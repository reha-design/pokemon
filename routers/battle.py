from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from game import rooms, get_battle_info, check_and_process_turn

router = APIRouter(prefix="/ws", tags=["Battle"])

@router.websocket("/battle/{room_id}/{player_id}")
async def battle_websocket(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()
    if room_id not in rooms:
        await websocket.close(code=1000)
        return
    
    room = rooms[room_id]
    player = next((p for p in room.players if p["id"] == player_id), None)
    if not player:
        await websocket.close(code=1000)
        return
    
    player["ws"] = websocket
    print(f"[WS] 플레이어 접속: {player_id[:8]} / 방: {room_id} / 현재 인원: {sum(1 for p in room.players if p['ws'])}명")
    
    # 두 명의 플레이어가 모두 접속했는지 확인
    if len(room.players) == 2 and all(p["ws"] for p in room.players):
        room.state = "battle"
        p1, p2 = room.players
        print(f"[BATTLE_START] 방 {room_id}: {p1['id'][:8]} vs {p2['id'][:8]}")
        print(f"  P1 팀: {[pk.name for pk in p1['team']]}")
        print(f"  P2 팀: {[pk.name for pk in p2['team']]}")
        await room.broadcast({
            "type": "BATTLE_START",
            "p1": get_battle_info(p1),
            "p2": get_battle_info(p2)
        })

    try:
        while True:
            data = await websocket.receive_json()
            event_type = data.get("type", "UNKNOWN")
            print(f"[EVENT] {player_id[:8]} → {event_type}")

            if event_type == "ACTION":
                action_type = data.get("action_type", "MOVE")
                idx = data.get("index", 0)
                active = player["team"][player["active_idx"]]
                if action_type == "MOVE":
                    move_name = active.moves[idx].name if idx < len(active.moves) else "?"
                    print(f"  └─ MOVE: {active.name} → {move_name} (idx={idx})")
                else:
                    target = player["team"][idx].name if idx < len(player["team"]) else "?"
                    print(f"  └─ SWAP: {active.name} → {target} (idx={idx})")

                room.actions[player_id] = {
                    "type": action_type,
                    "index": idx
                }
                await check_and_process_turn(room)
            
            elif event_type == "SWAP_FAINTED":
                new_idx = data["index"]
                old_pkmn = player["team"][player["active_idx"]]
                player["active_idx"] = new_idx
                new_pkmn = player["team"][new_idx]
                new_pkmn.reset_stages()
                print(f"  └─ SWAP_FAINTED: {old_pkmn.name} → {new_pkmn.name}")
                
                await room.broadcast({
                    "type": "PLAYER_SWAPPED",
                    "player_id": player_id,
                    "new_pokemon": get_battle_info(player),
                    "message": f"{player_id[:5]}..은(는) {new_pkmn.name}(을)를 내보냈다!"
                })
    except WebSocketDisconnect:
        print(f"[WS] 연결 끊김: {player_id[:8]} / 방: {room_id}")
        if room_id in rooms:
            del rooms[room_id]
