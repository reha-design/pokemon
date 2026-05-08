import json
import random
from typing import List
from pydantic import BaseModel
from pokemon import Pokemon, calculate_damage

# 스타팅 포켓몬 기본 데이터 로드
with open("starters.json", "r", encoding="utf-8") as f:
    STARTERS_DATA = json.load(f)["starters"]

# 현재 활성화된 모든 방 정보를 담는 전역 저장소
rooms = {} # {room_id: RoomObject}

"""
클라이언트로부터 받는 참가/생성 요청 데이터 모델
"""
class JoinRequest(BaseModel):
    player_id: str
    starter_names: List[str]
    room_id: str = None

"""
하나의 게임 세션(방)을 관리하는 클래스
"""
class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = []    # 플레이어 정보 리스트
        self.turn_order = [] # 행동 순서 (현재는 로직상 동시 처리)
        self.actions = {}    # 이번 턴에 각 플레이어가 선택한 액션
        self.state = "waiting" # 방 상태: waiting(대기), battle(전투 중)

    """
    플레이어를 방에 추가하고 포켓몬 팀을 구성합니다.
    """
    def add_player(self, player_id, starter_names):
        if len(self.players) >= 2:
            return False
        
        try:
            team_data = []
            for name in starter_names:
                # starters.json에서 포켓몬 데이터 검색
                p_data = next(p for p in STARTERS_DATA if p["name"] == name)
                team_data.append(p_data)
            
            if len(team_data) < 1:
                return False

            self.players.append({
                "id": player_id,
                "starter": starter_names[0],
                "team": [Pokemon(pd) for pd in team_data], # Pokemon 객체 생성
                "active_idx": 0, # 현재 첫 번째 포켓몬이 전투 중
                "ws": None       # 웹소켓 연결은 나중에 설정
            })
            return True
        except StopIteration:
            return False

    """
    방에 있는 모든 플레이어에게 메시지를 브로드캐스트합니다.
    """
    async def broadcast(self, message):
        for p in self.players:
            if p["ws"]:
                try:
                    await p["ws"].send_json(message)
                except:
                    pass

"""
클라이언트에 전달할 배틀용 최소 정보를 추출합니다.
"""
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

"""
두 플레이어의 입력이 모두 완료되었는지 확인하고 턴 처리를 실행합니다.
"""
async def check_and_process_turn(room):
    if len(room.actions) == 2:
        try:
            await process_multiplayer_turn(room)
        except Exception as e:
            import traceback
            traceback.print_exc()
        finally:
            room.actions = {} # 턴 종료 후 액션 데이터 초기화

"""
턴의 실제 전투 로직(교체 우선, 스피드 비교, 데미지 계산)을 처리합니다.
"""
async def process_multiplayer_turn(room):
    p1, p2 = room.players
    actions = room.actions
    
    if p1["id"] not in actions or p2["id"] not in actions:
        return

    events = []
    
    # 1단계: 교체(SWAP) 우선 처리
    swap_order = []
    if actions[p1["id"]]["type"] == "SWAP": swap_order.append(p1)
    if actions[p2["id"]]["type"] == "SWAP": swap_order.append(p2)
    
    # 둘 다 교체 시 스피드 순 (보통 교체는 공격보다 무조건 빠름)
    if len(swap_order) == 2:
        s1 = p1["team"][p1["active_idx"]].get_stat("speed")
        s2 = p2["team"][p2["active_idx"]].get_stat("speed")
        if s2 > s1: swap_order = [p2, p1]
        
    for p in swap_order:
        old_name = p["team"][p["active_idx"]].name
        p["active_idx"] = actions[p["id"]]["index"]
        new_pkmn = p["team"][p["active_idx"]]
        new_pkmn.reset_stages() # 교체 시 랭크업 초기화
        events.append({
            "logs": [f"{p['id'][:5]}..은(는) {old_name}(을)를 불러들이고 {new_pkmn.name}(을)를 내보냈다!"],
            "p1_hp": p1["team"][p1["active_idx"]].current_hp,
            "p2_hp": p2["team"][p2["active_idx"]].current_hp,
            "swapped_id": p["id"],
            "new_pokemon": get_battle_info(p)
        })

    # 2단계: 공격(MOVE) 처리
    move_order = []
    if actions[p1["id"]]["type"] == "MOVE": move_order.append(p1)
    if actions[p2["id"]]["type"] == "MOVE": move_order.append(p2)
    
    # 공격자 간 스피드 비교 (동속일 경우 50% 확률)
    if len(move_order) == 2:
        s1 = p1["team"][p1["active_idx"]].get_stat("speed")
        s2 = p2["team"][p2["active_idx"]].get_stat("speed")
        if s1 > s2:
            move_order = [p1, p2]
        elif s2 > s1:
            move_order = [p2, p1]
        else:
            # 스피드 타이
            move_order = random.sample([p1, p2], 2)

    for attacker_p in move_order:
        defender_p = p2 if attacker_p == p1 else p1
        attacker = attacker_p["team"][attacker_p["active_idx"]]
        defender = defender_p["team"][defender_p["active_idx"]]
        
        # 공격자가 이미 쓰러졌다면 행동 취소
        if attacker.is_fainted(): continue
            
        move_idx = actions[attacker_p["id"]]["index"]
        move = attacker.moves[move_idx]
        
        logs = [f"{attacker.name}의 {move.name}!"]
        
        # 기술 종류에 따른 처리 (변화기 vs 공격기)
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
            # 데미지 계산 (속성 상성 등 포함)
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
        
        # 방어자가 쓰러졌을 경우 빈사 이벤트 기록 및 턴 조기 종료
        if defender.is_fainted():
            events.append({
                "logs": [f"{defender.name}는 쓰러졌다!"],
                "p1_hp": p1["team"][p1["active_idx"]].current_hp,
                "p2_hp": p2["team"][p2["active_idx"]].current_hp,
                "fainted_id": defender_p["id"]
            })
            break

    # 최종 승패 체크 (한 쪽 팀의 모든 포켓몬이 쓰러졌는지 확인)
    p1_alive = any(pk.current_hp > 0 for pk in p1["team"])
    p2_alive = any(pk.current_hp > 0 for pk in p2["team"])
    
    if not p1_alive or not p2_alive:
        winner_id = p2["id"] if not p1_alive else p1["id"]
        # 게임 종료 브로드캐스트
        await room.broadcast({
            "type": "BATTLE_END",
            "winner_id": winner_id,
            "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
            "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]]
        })
        # 방 정보 삭제
        if room.room_id in rooms:
            del rooms[room.room_id]
        return

    # 전투가 계속되면 턴 결과 전송
    await room.broadcast({
        "type": "TURN_RESULT",
        "events": events,
        "p1_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p1["team"]],
        "p2_team": [{"name": p.name, "hp": p.current_hp, "is_fainted": p.is_fainted()} for p in p2["team"]]
    })
