import { WS_BASE, playerId, gameState } from './state.js';
import { setupBattle, processEvents, handleSwapEvent, handleBattleEnd } from './battle.js';

/**
 * 서버에서 전송된 웹소켓 메시지를 순차적으로 처리하기 위한 큐 시스템입니다.
 * 애니메이션 연출 도중 다른 메시지가 처리되어 데이터가 꼬이는 것을 방지합니다.
 */
let wsMessageQueue = [];
let isProcessingQueue = false;

/**
 * 메시지 큐에 데이터가 있을 경우 하나씩 꺼내어 처리 함수로 전달합니다.
 */
async function processMessageQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;
    
    while (wsMessageQueue.length > 0) {
        const data = wsMessageQueue.shift();
        try {
            await handleWSMessage(data);
        } catch(e) {
            console.error("[MSG] 메시지 처리 오류:", e);
        }
    }
    isProcessingQueue = false;
}

/**
 * 배틀 서버와 실시간 통신을 위한 웹소켓 연결을 수립합니다.
 */
export function connectWebSocket(roomId) {
    const ws = new WebSocket(`${WS_BASE}/ws/battle/${roomId}/${playerId}`);
    gameState.ws = ws;
    
    // 서버로부터 메시지 수신 시 큐에 추가
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("[WS RX]", data.type, data);
        wsMessageQueue.push(data);
        processMessageQueue(); // 큐 처리 시도
    };
    
    ws.onclose = () => {
        console.log("WebSocket 연결 종료");
    };
    
    ws.onerror = (e) => {
        console.error("WebSocket 오류:", e);
    };
}

/**
 * 수신된 메시지 타입에 따라 적절한 배틀 로직 함수를 호출합니다.
 */
async function handleWSMessage(data) {
    switch (data.type) {
        case "BATTLE_START":
            // 두 플레이어가 매칭되어 배틀이 시작됨
            document.getElementById("waiting-screen").classList.add("hidden");
            gameState.isP1 = (data.p1.id === playerId);
            setupBattle(data);
            break;
            
        case "TURN_RESULT":
            // 양쪽의 입력을 받아 턴이 진행됨
            gameState.isWaiting = false;
            if (gameState.isP1) {
                gameState.myTeam = data.p1_team;
            } else {
                gameState.myTeam = data.p2_team;
            }
            await processEvents(data.events); // 애니메이션 연출 (await를 통해 연출 완료 대기)
            break;
            
        case "PLAYER_SWAPPED":
            // 누군가 포켓몬을 교체함
            gameState.isWaiting = false;
            await handleSwapEvent(data);
            break;
            
        case "BATTLE_END":
            // 승패가 결정됨
            await handleBattleEnd(data);
            break;
    }
}
