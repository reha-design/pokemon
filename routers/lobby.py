from fastapi import APIRouter, HTTPException
import uuid
from game import rooms, Room, JoinRequest

router = APIRouter(prefix="/lobby", tags=["Lobby"])

@router.get("/rooms")
async def get_rooms():
    return [{"id": rid, "players": len(r.players)} for rid, r in rooms.items() if r.state == "waiting"]

@router.post("/create")
async def create_room(request: JoinRequest):
    room_id = str(uuid.uuid4())[:8]
    room = Room(room_id)
    if not room.add_player(request.player_id, request.starter_names):
        raise HTTPException(status_code=400, detail="Failed to create player. Check starter names.")
    rooms[room_id] = room
    return {"room_id": room_id}

@router.post("/join")
async def join_room(request: JoinRequest):
    if request.room_id not in rooms:
        raise HTTPException(status_code=404, detail="Room not found")
    room = rooms[request.room_id]
    if not room.add_player(request.player_id, request.starter_names):
        raise HTTPException(status_code=400, detail="Room full or invalid starters")
    return {"room_id": request.room_id}
