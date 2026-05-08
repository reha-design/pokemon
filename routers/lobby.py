from fastapi import APIRouter, HTTPException
import uuid
from game import rooms, Room, JoinRequest

# 로비 관련 기능을 담당하는 라우터 설정
router = APIRouter(prefix="/lobby", tags=["Lobby"])

"""
현재 대기 중(waiting) 상태인 방 목록을 반환합니다.
"""
@router.get("/rooms")
async def get_rooms():
    return [{"id": rid, "players": len(r.players)} for rid, r in rooms.items() if r.state == "waiting"]

"""
새로운 방을 생성하고 생성자를 첫 번째 플레이어로 등록합니다.
"""
@router.post("/create")
async def create_room(request: JoinRequest):
    # 고유한 8자리 방 ID 생성
    room_id = str(uuid.uuid4())[:8]
    room = Room(room_id)
    
    # 플레이어 추가 시도 (포켓몬 팀 유효성 검사 포함)
    if not room.add_player(request.player_id, request.starter_names):
        raise HTTPException(status_code=400, detail="Failed to create player. Check starter names.")
    
    rooms[room_id] = room
    return {"room_id": room_id}

"""
기존 방에 두 번째 플레이어로 참가합니다.
"""
@router.post("/join")
async def join_room(request: JoinRequest):
    # 방 존재 여부 확인
    if request.room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
        
    room = rooms[request.room_id]
    
    # 플레이어 추가 (방이 꽉 찼거나 데이터가 잘못된 경우 에러 반환)
    if not room.add_player(request.player_id, request.starter_names):
        raise HTTPException(status_code=400, detail="Room full or invalid starters")
        
    return {"room_id": request.room_id}
