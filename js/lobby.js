import { API_BASE, playerId, selectedTeam, gameState } from './state.js';
import { connectWebSocket } from './network.js';

export function pickStarter(name) {
    if (selectedTeam.includes(name)) return;
    if (selectedTeam.length >= 3) return;

    selectedTeam.push(name);
    
    const listSpan = document.getElementById("selected-team-list");
    if (listSpan) {
        listSpan.innerText = selectedTeam.join(", ");
    }
    const statusDiv = document.getElementById("team-selection-status");
    if (statusDiv) {
        statusDiv.innerText = `선택된 팀: ${selectedTeam.join(", ")} (${selectedTeam.length}/3)`;
    }
    
    const btn = document.getElementById(`btn-${name}`);
    if (btn) btn.classList.add("disabled");

    if (selectedTeam.length === 3) {
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("lobby-screen").classList.remove("hidden");
        document.getElementById("selected-starter").innerText = selectedTeam.join(", ");
        refreshRooms();
    }
}

/**
 * 서버에서 현재 대기 중인 방 목록을 가져와 로비 UI를 갱신합니다.
 */
export async function refreshRooms() {
    // 1. 서버의 로비 API로부터 방 목록을 비동기로 가져옴
    const response = await fetch(`${API_BASE}/lobby/rooms`);
    const rooms = await response.json();
    
    // 2. 방 목록을 표시할 컨테이너를 찾고 기존 내용을 초기화 (중복 방지)
    const list = document.getElementById("room-list");
    list.innerHTML = "";
    
    // 3. 개설된 방이 없는 경우 안내 메시지 출력
    if (rooms.length === 0) {
        list.innerHTML = "<p>현재 개설된 방이 없습니다.</p>";
        return;
    }
    
    // 4. 각 방 정보에 대해 DOM 요소를 동적으로 생성하여 목록 구성
    rooms.forEach(room => {
        const div = document.createElement("div");
        div.className = "room-item";
        
        // 방 정보 텍스트 (ID 및 플레이어 수)
        const span = document.createElement("span");
        span.innerText = `방 ID: ${room.id} (${room.players}/2)`;
        
        // 참가 버튼 생성 및 클릭 이벤트 연결
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = "참가";
        btn.onclick = () => joinRoom(room.id); // 클로저를 통해 해당 방 ID를 전달
        
        div.appendChild(span);
        div.appendChild(btn);
        
        list.appendChild(div);
    });
}

/**
 * 새로운 방을 생성하고 생성된 방의 대기실로 입장합니다.
 */
export async function createRoom() {
    // 서버에 방 생성 요청 (내 ID와 선택한 포켓몬 팀 정보 전송)
    const res = await fetch(`${API_BASE}/lobby/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            player_id: playerId, 
            starter_names: selectedTeam
        })
    });
    const data = await res.json();
    
    // 생성된 방 ID로 대기실 입장 처리
    enterWaitingRoom(data.room_id);
}

/**
 * 지정된 ID의 방에 참가 요청을 보내고 대기실로 입장합니다.
 */
export async function joinRoom(roomId) {
    // 서버에 해당 방 참가 요청 전송
    const res = await fetch(`${API_BASE}/lobby/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            player_id: playerId, 
            starter_names: selectedTeam,
            room_id: roomId 
        })
    });
    const data = await res.json();
    
    // 참가가 완료되면 대기실 화면으로 전환
    enterWaitingRoom(data.room_id);
}

/**
 * 로비 화면에서 대기실 화면으로 전환하고 실시간 배틀을 위해 웹소켓을 연결합니다.
 * @param {string} roomId - 입장할 방의 ID
 */
function enterWaitingRoom(roomId) {
    // 전역 게임 상태에 현재 방 ID 저장
    gameState.room_id = roomId;
    
    // UI 전환: 로비 숨기고 대기실 표시
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("waiting-screen").classList.remove("hidden");
    document.getElementById("current-room-id").innerText = roomId;
    
    // 실시간 배틀 통신을 위한 웹소켓 연결 시작
    connectWebSocket(roomId);
}
