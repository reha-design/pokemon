import { gameState, battleMusic, playerId } from './state.js';
import { updateUI, showMenu, showMessage, showSwapMenu } from './ui.js';

/**
 * 웹소켓으로부터 BATTLE_START 메시지를 받았을 때 초기 데이터를 설정하고 배틀을 시작합니다.
 */
export function setupBattle(data) {
    // BGM 재생 (브라우저 정책에 따라 첫 클릭 이후 재생 가능)
    battleMusic.play().catch(e => console.log("BGM 재생 실패:", e));
    
    // 내가 P1인지 P2인지에 따라 내 데이터와 상대 데이터 배정
    if (gameState.isP1) {
        gameState.me = data.p1;
        gameState.opponent = data.p2;
    } else {
        gameState.me = data.p2;
        gameState.opponent = data.p1;
    }
    gameState.myTeam = gameState.me.team; // 내 팀 정보 동기화
    
    updateUI();
    showMessage("전투가 시작되었습니다!");
    showMenu(); // 커맨드 메뉴 표시
}

/**
 * 서버에서 전송된 턴 결과(이벤트 리스트)를 순차적으로 화면에 연출합니다.
 * @param {Array} events - 턴 동안 발생한 사건(공격, 데미지, 교체 등)의 배열
 */
export async function processEvents(events) {
    // 연출 도중 입력 방지를 위해 메뉴 숨김
    document.getElementById("menu-box").classList.add("hidden");
    
    for (const event of events) {
        // 1. 발생한 모든 로그 메시지 출력
        for (const log of event.logs) {
            await showMessage(log);
        }
        
        // 2. 서버 계산 결과에 맞춰 현재 체력 데이터 업데이트
        if (gameState.isP1) {
            gameState.me.hp = event.p1_hp;
            gameState.opponent.hp = event.p2_hp;
        } else {
            gameState.me.hp = event.p2_hp;
            gameState.opponent.hp = event.p1_hp;
        }
        
        // 내 팀 상태 리스트의 체력 수치도 동기화
        if (gameState.myTeam) {
            const activeIdx = gameState.myTeam.findIndex(p => p.name === gameState.me.name);
            if (activeIdx !== -1) {
                gameState.myTeam[activeIdx].hp = gameState.me.hp;
                if (gameState.me.hp <= 0) gameState.myTeam[activeIdx].is_fainted = true;
            }
        }
        
        // UI 갱신 (HP 바 등)
        updateUI();

        // 3. 누군가 교체를 한 경우 연출 처리
        if (event.swapped_id) {
            const swapData = { ...event, player_id: event.swapped_id };
            await handleSwapEvent(swapData);
            continue; // 교체 후에는 다음 이벤트로 진행
        }

        // 4. 누군가 쓰러진(빈사) 경우 연출 처리
        if (event.fainted_id) {
            const spriteId = event.fainted_id === playerId ? "player-sprite" : "enemy-sprite";
            document.getElementById(spriteId).classList.add("fainted"); // 쓰러지는 애니메이션 효과
            await new Promise(resolve => setTimeout(resolve, 1200));
            
            // 내가 쓰러졌고, 교체할 수 있는 생존 포켓몬이 있다면 교체 메뉴 표시
            if (event.fainted_id === playerId) {
                const anyAlive = gameState.myTeam && gameState.myTeam.some(p => p.hp > 0 && !p.is_fainted);
                if (anyAlive) {
                    showSwapMenu(false); // 강제 교체 모드로 메뉴 오픈
                }
                return; // 강제 교체 입력을 기다려야 하므로 루프 중단
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500)); // 이벤트 간 짧은 대기 시간
    }
    
    // 모든 연출이 끝난 후 내가 살아있다면 다시 메뉴 표시
    if (gameState.me && gameState.me.hp > 0) {
        showMenu();
    }
}

/**
 * 포켓몬이 교체되었을 때 데이터를 업데이트하고 스프라이트를 다시 불러옵니다.
 */
export async function handleSwapEvent(data) {
    if (data.player_id === playerId) {
        // 내가 교체한 경우
        gameState.me = data.new_pokemon;
        gameState.myTeam = data.new_pokemon.team;
        document.getElementById("player-sprite").classList.remove("fainted");
    } else {
        // 상대가 교체한 경우
        gameState.opponent = data.new_pokemon;
        document.getElementById("enemy-sprite").classList.remove("fainted");
    }
    
    updateUI();
    
    const msg = data.message || "포켓몬이 교체되었습니다.";
    await showMessage(msg);
    
    // 교체 후 내가 살아있다면 메뉴 표시
    if (gameState.me && gameState.me.hp > 0) {
        showMenu();
    }
}

/**
 * 배틀 종료 시 승패 결과 연출을 처리합니다.
 */
export async function handleBattleEnd(data) {
    const isWinner = (data.winner_id === playerId);
    const msg = isWinner ? "축하합니다! 배틀에서 승리했습니다!" : "아쉽네요... 배틀에서 패배했습니다.";
    
    // 최종 결과 팀 상태 업데이트
    if (gameState.isP1) {
        gameState.myTeam = data.p1_team;
    } else {
        gameState.myTeam = data.p2_team;
    }
    
    await showMessage(msg);
    battleMusic.pause(); // 음악 종료
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    location.reload(); // 첫 화면으로 새로고침
}

/**
 * 공격이나 교체 같은 커맨드를 서버로 전송합니다.
 */
export function sendAction(type, index) {
    if (gameState.isWaiting) return; // 중복 전송 방지
    gameState.isWaiting = true;
    
    gameState.ws.send(JSON.stringify({
        type: "ACTION",
        action_type: type,
        index: index
    }));
    
    document.getElementById("menu-box").classList.add("hidden");
    showMessage("상대의 선택을 기다리는 중...");
}

/**
 * 교체 메뉴에서 선택한 결과를 서버로 전송합니다.
 */
export function showSwapMenuAction(isStrategic, index) {
    if (isStrategic) {
        // 일반 턴에서 '교체'를 선택한 경우 (턴 소모)
        sendAction("SWAP", index);
    } else {
        // 포켓몬이 쓰러져서 강제로 교체하는 경우 (턴 소모 없음)
        gameState.ws.send(JSON.stringify({ type: "SWAP_FAINTED", index: index }));
    }
    document.getElementById("menu-box").classList.add("hidden");
}

/**
 * 대기실이나 전투 중 방을 나갑니다.
 */
export function leaveRoom() {
    if (gameState.ws) gameState.ws.close();
    location.reload();
}
