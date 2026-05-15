import json
import random
from typing import List

from pydantic import BaseModel

from pokemon import Pokemon, calculate_damage

with open("starters.json", "r", encoding="utf-8-sig") as f:
    STARTERS_DATA = json.load(f)["starters"]

rooms = {}

WEATHER_LABELS = {
    "clear": "맑음",
    "sun": "쾌청",
    "rain": "비",
    "sandstorm": "모래바람",
    "hail": "싸라기눈",
}

DRAINING_MOVES = {"흡수", "메가드레인", "기가드레인"}
CHARGING_MOVES = {"솔라빔", "로케트박치기"}
TRAPPING_MOVES = {"불꽃소용돌이"}
RECOIL_MOVES = {"플레어드라이브"}
MOVE_PRIORITIES = {
    "전광석화": 1,
}


class JoinRequest(BaseModel):
    player_id: str
    starter_names: List[str]
    room_id: str = None


class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = []
        self.turn_order = []
        self.actions = {}
        self.state = "waiting"
        self.weather = {"type": "clear", "turns": 0}

    def add_player(self, player_id, starter_names):
        if len(self.players) >= 2:
            return False

        try:
            team_data = []
            for name in starter_names:
                p_data = next(p for p in STARTERS_DATA if p["name"] == name)
                team_data.append(p_data)

            if len(team_data) < 1:
                return False

            self.players.append(
                {
                    "id": player_id,
                    "starter": starter_names[0],
                    "team": [Pokemon(pd) for pd in team_data],
                    "active_idx": 0,
                    "ws": None,
                }
            )
            return True
        except StopIteration:
            return False

    async def broadcast(self, message):
        for p in self.players:
            if p["ws"]:
                try:
                    await p["ws"].send_json(message)
                except:
                    pass


def get_battle_info(player_p):
    pkmn = player_p["team"][player_p["active_idx"]]
    return {
        "id": player_p["id"],
        "name": pkmn.name,
        "hp": pkmn.current_hp,
        "max_hp": pkmn.max_hp,
        "level": pkmn.level,
        "moves": [{"name": m.name, "type": m.type} for m in pkmn.moves],
        "team": [
            {"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()}
            for p in player_p["team"]
        ],
    }


async def notify_opponent_disconnected(room, disconnected_player_id):
    for p in room.players:
        if p["id"] == disconnected_player_id or not p["ws"]:
            continue

        try:
            await p["ws"].send_json(
                {
                    "type": "OPPONENT_DISCONNECTED",
                    "message": "상대의 연결이 끊어졌습니다",
                }
            )
            await p["ws"].close(code=1000)
        except:
            pass


async def check_and_process_turn(room):
    if len(room.actions) == 2:
        try:
            await process_multiplayer_turn(room)
        except Exception:
            import traceback

            traceback.print_exc()
        finally:
            room.actions = {}


async def process_multiplayer_turn(room):
    p1, p2 = room.players
    actions = room.actions

    if p1["id"] not in actions or p2["id"] not in actions:
        return

    events = []

    swap_order = []
    if actions[p1["id"]]["type"] == "SWAP" and not p1["team"][p1["active_idx"]].volatile.get("charging"):
        swap_order.append(p1)
    if actions[p2["id"]]["type"] == "SWAP" and not p2["team"][p2["active_idx"]].volatile.get("charging"):
        swap_order.append(p2)

    if len(swap_order) == 2:
        s1 = p1["team"][p1["active_idx"]].get_stat("speed")
        s2 = p2["team"][p2["active_idx"]].get_stat("speed")
        if s2 > s1:
            swap_order = [p2, p1]

    for p in swap_order:
        active = p["team"][p["active_idx"]]
        if active.volatile.get("bound", {}).get("turns", 0) > 0:
            events.append(
                {
                    "logs": [f"{active.name}는 불꽃소용돌이에 휘말려 교체할 수 없다!"],
                    "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                    "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                    "attacker_id": p["id"],
                }
            )
            continue

        old_name = p["team"][p["active_idx"]].name
        p["active_idx"] = actions[p["id"]]["index"]
        new_pkmn = p["team"][p["active_idx"]]
        new_pkmn.reset_stages()
        new_pkmn.clear_volatile()
        events.append(
            {
                "logs": [f"{p['id'][:5]}..은(는) {old_name}(을)를 불러들이고 {new_pkmn.name}(을)를 내보냈다!"],
                "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                "swapped_id": p["id"],
                "new_pokemon": get_battle_info(p),
            }
        )

    move_order = []
    if actions[p1["id"]]["type"] == "MOVE" or p1["team"][p1["active_idx"]].volatile.get("charging"):
        move_order.append(p1)
    if actions[p2["id"]]["type"] == "MOVE" or p2["team"][p2["active_idx"]].volatile.get("charging"):
        move_order.append(p2)

    if len(move_order) == 2:
        move_order = sorted(
            move_order,
            key=lambda p: (
                get_action_priority(p, actions),
                p["team"][p["active_idx"]].get_stat("speed"),
                random.random(),
            ),
            reverse=True,
        )

    for attacker_p in move_order:
        defender_p = p2 if attacker_p == p1 else p1
        attacker = attacker_p["team"][attacker_p["active_idx"]]
        defender = defender_p["team"][defender_p["active_idx"]]

        if attacker.is_fainted():
            continue

        charging = attacker.volatile.get("charging")
        move_idx = charging["move_index"] if charging else actions[attacker_p["id"]]["index"]
        move = attacker.moves[move_idx]

        logs = [f"{attacker.name}의 {move.name}!"]
        if move.category == "Status":
            success = False
            stat_msg = ""
            if move.name == "울음소리":
                success = defender.apply_stat_change("attack", -1)
                stat_msg = f"{defender.name}의 공격력이 떨어졌다!"
            elif move.name in ["째려보기", "꼬리흔들기"]:
                success = defender.apply_stat_change("defense", -1)
                stat_msg = f"{defender.name}의 방어력이 떨어졌다!"
            logs.append(stat_msg if success else "그러나 아무 일도 일어나지 않았다!")
        else:
            weather = room.weather["type"]
            if not charging and move.name in CHARGING_MOVES and should_charge(move, weather):
                if move.name == "로케트박치기":
                    success = attacker.apply_stat_change("defense", 1)
                    logs.append(
                        f"{attacker.name}는 몸을 웅크려 방어가 올라갔다!"
                        if success
                        else f"{attacker.name}는 몸을 웅크렸다!"
                    )
                else:
                    logs.append(f"{attacker.name}는 빛을 모으고 있다!")

                attacker.volatile["charging"] = {
                    "move_index": move_idx,
                    "move_name": move.name,
                }
                events.append(
                    {
                        "logs": logs,
                        "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                        "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                        "attacker_id": attacker_p["id"],
                    }
                )
                continue

            if charging:
                attacker.volatile.pop("charging", None)

            power_override = get_power_override(move, defender)
            if move.name == "소금물" and power_override:
                logs.append("상대의 체력이 절반 이하라 소금물의 위력이 올라갔다!")

            defender_hp_before = defender.current_hp
            dmg, mod = calculate_damage(attacker, defender, move, weather=weather, power_override=power_override)
            if mod == -1.0:
                logs.append("공격이 빗나갔다!")
            else:
                defender.take_damage(dmg)
                dealt = min(dmg, defender_hp_before)
                if mod > 1.0:
                    logs.append("효과가 굉장했다!")
                elif 0 < mod < 1.0:
                    logs.append("효과가 별로인 듯하다...")
                append_weather_move_logs(logs, move, weather)
                apply_after_damage_effects(attacker, defender, move, dealt, logs)

        events.append(
            {
                "logs": logs,
                "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                "attacker_id": attacker_p["id"],
            }
        )

        if attacker.is_fainted():
            events.append(
                {
                    "logs": [f"{attacker.name}는 쓰러졌다!"],
                    "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                    "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                    "fainted_id": attacker_p["id"],
                }
            )
            break

        if defender.is_fainted():
            events.append(
                {
                    "logs": [f"{defender.name}는 쓰러졌다!"],
                    "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                    "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                    "fainted_id": defender_p["id"],
                }
            )
            break

    append_end_of_turn_effects(room, events, p1, p2)

    p1_alive = any(pk.current_hp > 0 for pk in p1["team"])
    p2_alive = any(pk.current_hp > 0 for pk in p2["team"])

    if not p1_alive or not p2_alive:
        winner_id = p2["id"] if not p1_alive else p1["id"]
        await room.broadcast(
            {
                "type": "BATTLE_END",
                "winner_id": winner_id,
                "weather": room.weather,
                "events": events,
                "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
                "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]],
            }
        )
        if room.room_id in rooms:
            del rooms[room.room_id]
        return

    await room.broadcast(
        {
            "type": "TURN_RESULT",
            "weather": room.weather,
            "events": events,
            "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
            "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]],
        }
    )


def should_charge(move, weather):
    if move.name == "솔라빔":
        return weather != "sun"
    return move.name == "로케트박치기"


def get_action_priority(player, actions):
    active = player["team"][player["active_idx"]]
    charging = active.volatile.get("charging")
    if charging:
        move_idx = charging["move_index"]
    else:
        action = actions.get(player["id"], {})
        if action.get("type") != "MOVE":
            return 0
        move_idx = action.get("index", 0)

    if move_idx >= len(active.moves):
        return 0

    return MOVE_PRIORITIES.get(active.moves[move_idx].name, 0)


def get_power_override(move, defender):
    if move.name == "소금물" and defender.current_hp <= defender.max_hp / 2:
        return move.power * 2
    return None


def append_weather_move_logs(logs, move, weather):
    if weather == "sun":
        if move.type == "Fire":
            logs.append("쾌청 때문에 불꽃 기술의 위력이 올라갔다!")
        elif move.type == "Water":
            logs.append("쾌청 때문에 물 기술의 위력이 떨어졌다!")
    elif weather == "rain":
        if move.type == "Water":
            logs.append("비 때문에 물 기술의 위력이 올라갔다!")
        elif move.type == "Fire":
            logs.append("비 때문에 불꽃 기술의 위력이 떨어졌다!")

    if move.name == "솔라빔" and weather in ["rain", "sandstorm", "hail"]:
        logs.append(f"{WEATHER_LABELS[weather]} 때문에 솔라빔의 위력이 떨어졌다!")


def apply_after_damage_effects(attacker, defender, move, dealt, logs):
    if dealt <= 0:
        return

    if move.name in DRAINING_MOVES:
        healed = attacker.heal(max(1, dealt // 2))
        if healed > 0:
            logs.append(f"{attacker.name}는 체력을 {healed} 회복했다!")

    if move.name in RECOIL_MOVES:
        recoil = max(1, dealt // 3)
        attacker.take_damage(recoil)
        logs.append(f"{attacker.name}는 반동으로 {recoil}의 데미지를 입었다!")

    if move.name in TRAPPING_MOVES:
        defender.volatile["bound"] = {
            "move_name": move.name,
            "turns": random.randint(2, 5),
        }
        logs.append(f"{defender.name}는 불꽃소용돌이에 갇혔다!")


def append_end_of_turn_effects(room, events, p1, p2):
    for player in room.players:
        active = player["team"][player["active_idx"]]
        bound = active.volatile.get("bound")
        if not bound or bound.get("turns", 0) <= 0 or active.is_fainted():
            continue

        damage = max(1, active.max_hp // 8)
        active.take_damage(damage)
        bound["turns"] -= 1
        logs = [f"{active.name}는 {bound['move_name']}의 데미지를 입었다!"]
        if bound["turns"] <= 0:
            active.volatile.pop("bound", None)
            logs.append(f"{active.name}는 불꽃소용돌이에서 벗어났다!")

        events.append(
            {
                "logs": logs,
                "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                "fainted_id": player["id"] if active.is_fainted() else None,
            }
        )

    if room.weather.get("turns", 0) > 0:
        room.weather["turns"] -= 1
        if room.weather["turns"] == 0:
            ended = room.weather["type"]
            room.weather = {"type": "clear", "turns": 0}
            events.append(
                {
                    "logs": [f"{WEATHER_LABELS[ended]} 상태가 끝났다."],
                    "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                    "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                }
            )
