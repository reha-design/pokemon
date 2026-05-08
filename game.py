import json
import random
from typing import List
from pydantic import BaseModel
from pokemon import Pokemon, calculate_damage

# 데이터 로드
with open("starters.json", "r", encoding="utf-8") as f:
    STARTERS_DATA = json.load(f)["starters"]

# 방 관리 시스템
rooms = {} # {room_id: RoomObject}

class JoinRequest(BaseModel):
    player_id: str
    starter_names: List[str] # List로 변경
    room_id: str = None

class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = [] # [{"id": str, "starter": str, "team": [Pokemon], "ws": WebSocket}]
        self.turn_order = [] # [player_id, player_id]
        self.actions = {} # {player_id: action_index}
        self.state = "waiting" # waiting, battle, finished

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

            self.players.append({
                "id": player_id,
                "starter": starter_names[0], # 첫 번째를 대표 스타터로 유지
                "team": [Pokemon(pd) for pd in team_data],
                "active_idx": 0,
                "ws": None
            })
            return True
        except StopIteration:
            print(f"Error: One of the starters {starter_names} not found")
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
        "team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in player_p["team"]]
    }

async def check_and_process_turn(room):
    collected = list(room.actions.keys())
    needed = [p["id"] for p in room.players]
    waiting = [pid[:8] for pid in needed if pid not in room.actions]
    ready   = [pid[:8] for pid in collected]
    print(f"[TURN] 액션 수집: {ready} / 대기 중: {waiting}")

    if len(room.actions) == 2:
        print(f"[TURN] 양쪽 준비 완료 → 턴 처리 시작")
        try:
            await process_multiplayer_turn(room)
            print(f"[TURN] 턴 처리 완료")
        except Exception as e:
            import traceback
            traceback.print_exc()
            print(f"[TURN] 오류 발생: {e}")
        finally:
            room.actions = {}
            print(f"[TURN] 액션 초기화 완료")

async def process_multiplayer_turn(room):
    p1, p2 = room.players
    actions = room.actions
    
    # 안전 장치: 두 플레이어의 액션이 모두 있는지 확인
    if p1["id"] not in actions or p2["id"] not in actions:
        print(f"Missing actions for one or more players: {list(actions.keys())}")
        return

    events = []
    
    # 1. 교체(SWAP) 우선 처리
    swap_order = []
    if actions[p1["id"]]["type"] == "SWAP": swap_order.append(p1)
    if actions[p2["id"]]["type"] == "SWAP": swap_order.append(p2)
    
    # 교체가 여러 명이면 스피드 순 (단, 교체 자체는 공격보다 무조건 빠름)
    if len(swap_order) == 2:
        s1 = p1["team"][p1["active_idx"]].get_stat("speed")
        s2 = p2["team"][p2["active_idx"]].get_stat("speed")
        if s2 > s1: swap_order = [p2, p1]
        
    for p in swap_order:
        old_name = p["team"][p["active_idx"]].name
        p["active_idx"] = actions[p["id"]]["index"]
        new_pkmn = p["team"][p["active_idx"]]
        new_pkmn.reset_stages()
        events.append({
            "logs": [f"{p['id'][:5]}..은(는) {old_name}(을)를 불러들이고 {new_pkmn.name}(을)를 내보냈다!"],
            "p1_hp": p1["team"][p1["active_idx"]].current_hp,
            "p2_hp": p2["team"][p2["active_idx"]].current_hp,
            "swapped_id": p["id"],
            "new_pokemon": get_battle_info(p)
        })

    # 2. 공격(MOVE) 처리
    move_order = []
    if actions[p1["id"]]["type"] == "MOVE": move_order.append(p1)
    if actions[p2["id"]]["type"] == "MOVE": move_order.append(p2)
    
    # 스피드 비교
    if len(move_order) == 2:
        s1 = p1["team"][p1["active_idx"]].get_stat("speed")
        s2 = p2["team"][p2["active_idx"]].get_stat("speed")
        v1 = s1 * random.uniform(0.9, 1.1) # 변동성 다시 약간 추가
        v2 = s2 * random.uniform(0.9, 1.1)
        if v2 > v1: move_order = [p2, p1]
        else: move_order = [p1, p2]

    for attacker_p in move_order:
        defender_p = p2 if attacker_p == p1 else p1
        attacker = attacker_p["team"][attacker_p["active_idx"]]
        defender = defender_p["team"][defender_p["active_idx"]]
        
        # 공격자가 쓰러졌는지 확인 (먼저 공격받아 쓰러졌을 수 있음)
        if attacker.is_fainted(): continue
            
        move_idx = actions[attacker_p["id"]]["index"]
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
            dmg, mod = calculate_damage(attacker, defender, move)
            if mod == -1.0:
                logs.append("공격이 빗나갔다!")
            else:
                defender.take_damage(dmg)
                if mod > 1.0: logs.append("효과가 굉장했다!")
                elif mod < 1.0 and mod > 0: logs.append("효과가 별로인 듯하다...")

        events.append({
            "logs": logs,
            "p1_hp": p1["team"][p1["active_idx"]].current_hp,
            "p2_hp": p2["team"][p2["active_idx"]].current_hp,
            "attacker_id": attacker_p["id"]
        })
        
        if defender.is_fainted():
            events.append({
                "logs": [f"{defender.name}는 쓰러졌다!"],
                "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                "fainted_id": defender_p["id"]
            })
            # 방어자가 쓰러지면 해당 턴의 남은 공격 취소
            break

    # 배틀 종료 체크 (누군가 쓰러졌을 때 남은 포켓몬이 있는지 확인)
    p1_alive = any(pk.current_hp > 0 for pk in p1["team"])
    p2_alive = any(pk.current_hp > 0 for pk in p2["team"])
    
    if not p1_alive or not p2_alive:
        winner_id = p2["id"] if not p1_alive else p1["id"]
        # 즉시 배틀 종료 브로드캐스트
        await room.broadcast({
            "type": "BATTLE_END",
            "winner_id": winner_id,
            "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
            "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]]
        })
        # 방 정보 정리
        if room.room_id in rooms:
            del rooms[room.room_id]
        return

    # 살아있다면 TURN_RESULT 전송
    await room.broadcast({
        "type": "TURN_RESULT",
        "events": events,
        "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
        "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]]
    })
