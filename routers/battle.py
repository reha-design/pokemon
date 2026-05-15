from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game import WEATHER_LABELS, check_and_process_turn, get_battle_info, notify_opponent_disconnected, rooms

# 배틀 실시간 통신을 위한 라우터 설정
router = APIRouter(prefix="/ws", tags=["Battle"])

"""
특정 방의 특정 플레이어를 위한 웹소켓 엔드포인트입니다.
"""
@router.websocket("/battle/{room_id}/{player_id}")
async def battle_websocket(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()
    
    # 1. 방 및 플레이어 유효성 검사
    if room_id not in rooms:
        await websocket.close(code=1000)
        return
    
    room = rooms[room_id]
    player = next((p for p in room.players if p["id"] == player_id), None)
    if not player:
        await websocket.close(code=1000)
        return
    
    # 플레이어 정보에 웹소켓 객체 저장
    player["ws"] = websocket
    
    # 2. 두 명의 플레이어가 모두 접속했는지 확인하여 배틀 시작 알림
    if len(room.players) == 2 and all(p["ws"] for p in room.players):
        room.state = "battle"
        p1, p2 = room.players
        await room.broadcast({
            "type": "BATTLE_START",
            "weather": room.weather,
            "p1": get_battle_info(p1),
            "p2": get_battle_info(p2)
        })

    # 3. 실시간 메시지 수신 루프
    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "UNKNOWN")

            if event_type == "ACTION":
                # 플레이어가 공격(MOVE) 또는 교체(SWAP) 선택 시
                action_type = data.get("action_type", "MOVE")
                idx = data.get("index", 0)
                
                room.actions[player_id] = {
                    "type": action_type,
                    "index": idx
                }
                # 양쪽 플레이어의 선택이 완료되었는지 확인 후 처리
                await check_and_process_turn(room)
            
            elif event_type == "SWAP_FAINTED":
                # 포켓몬이 쓰러져서 강제로 교체하는 경우
                new_idx = data["index"]
                player["active_idx"] = new_idx
                new_pkmn = player["team"][new_idx]
                new_pkmn.reset_stages()
                new_pkmn.clear_volatile()
                
                # 교체 사실을 모든 플레이어에게 알림
                await room.broadcast({
                    "type": "PLAYER_SWAPPED",
                    "player_id": player_id,
                    "new_pokemon": get_battle_info(player),
                    "message": f"{player_id[:5]}..은(는) {new_pkmn.name}(을)를 내보냈다!"
                })

            elif event_type == "SET_WEATHER":
                weather_type = data.get("weather", "clear")
                if weather_type in WEATHER_LABELS:
                    room.weather = {
                        "type": weather_type,
                        "turns": data.get("turns", 0)
                    }
                    await room.broadcast({
                        "type": "WEATHER_CHANGED",
                        "weather": room.weather,
                        "message": f"날씨가 {WEATHER_LABELS[weather_type]} 상태가 되었다!"
                    })
                
    except WebSocketDisconnect:
        # 연결 종료 시 방 정보 삭제 (세션 종료)
        if room_id in rooms:
            await notify_opponent_disconnected(room, player_id)
            del rooms[room_id]
