import { gameState, SPRITE_MAP } from './state.js';
import { sendAction, showSwapMenuAction } from './battle.js';

/**
 * 현재 게임 상태를 기반으로 배틀 화면 UI(이름, LV, HP 바, 스프라이트)를 갱신합니다.
 */
export function updateUI() {
    // 플레이어 및 적 이름/레벨 갱신
    document.getElementById("player-name").innerText = gameState.me.name;
    document.getElementById("player-lv").innerText = gameState.me.level;
    document.getElementById("player-hp-text").innerText = `${gameState.me.hp}/${gameState.me.max_hp}`;
    
    document.getElementById("enemy-name").innerText = gameState.opponent.name;
    document.getElementById("enemy-lv").innerText = gameState.opponent.level;
    
    // HP 바 너비 및 색상 갱신
    updateHPBar("player-hp-bar", gameState.me.hp, gameState.me.max_hp);
    updateHPBar("enemy-hp-bar", gameState.opponent.hp, gameState.opponent.max_hp);
    
    // 스프라이트 이미지 설정 (플레이어는 뒷모습, 적은 앞모습)
    setSprite("player-sprite", gameState.me.name, "back");
    setSprite("enemy-sprite", gameState.opponent.name, "front");
}

/**
 * 특정 요소에 포켓몬 이미지를 설정합니다.
 * @param {string} id - 이미지를 넣을 요소의 ID
 * @param {string} name - 포켓몬 이름
 * @param {string} view - 'front' 또는 'back'
 */
export function setSprite(id, name, view) {
    const el = document.getElementById(id);
    const data = SPRITE_MAP[name];
    if (!data) return;

    if (data.sheet) {
        // 스프라이트 시트(애니메이션용) 사용 시
        el.style.backgroundImage = `url('${data.sheet}')`;
        el.style.backgroundPosition = view === "front" ? "left center" : "right center";
        el.style.backgroundSize = "200%";
    } else {
        // 단일 이미지 사용 시
        el.style.backgroundImage = `url('${data[view]}')`;
        el.style.backgroundPosition = "center";
        el.style.backgroundSize = "contain";
    }
    el.style.backgroundRepeat = "no-repeat";
}

/**
 * HP 수치에 따라 HP 바의 길이와 색상을 변경합니다.
 */
export function updateHPBar(id, current, max) {
    const bar = document.getElementById(id);
    const percentage = (current / max) * 100;
    bar.style.width = `${percentage}%`;
    
    // 체력 잔량에 따른 색상 변경 (녹색 -> 황색 -> 적색)
    bar.style.backgroundColor = percentage > 50 ? "var(--hp-green)" : percentage > 20 ? "var(--hp-yellow)" : "var(--hp-red)";
}

/**
 * 배틀 메인 메뉴(공격, 교체)를 표시합니다.
 */
export function showMenu() {
    const menuBox = document.getElementById("menu-box");
    menuBox.innerHTML = `
        <button class="menu-btn" id="btn-show-moves">공격</button>
        <button class="menu-btn" id="btn-show-swap">교체</button>
    `;
    // 이벤트 리스너 직접 등록 (모듈 방식 유지)
    document.getElementById("btn-show-moves").onclick = showMoves;
    document.getElementById("btn-show-swap").onclick = () => showSwapMenu(true);
    menuBox.classList.remove("hidden");
}

/**
 * 현재 활성화된 포켓몬의 기술 목록 메뉴를 표시합니다.
 */
export function showMoves() {
    const menuBox = document.getElementById("menu-box");
    menuBox.innerHTML = "";
    gameState.me.moves.forEach((move, index) => {
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = `${move.name} (${move.type})`;
        btn.onclick = () => sendAction("MOVE", index);
        menuBox.appendChild(btn);
    });
    
    // 돌아가기 버튼
    const backBtn = document.createElement("button");
    backBtn.className = "menu-btn";
    backBtn.innerText = "뒤로가기";
    backBtn.onclick = showMenu;
    menuBox.appendChild(backBtn);
}

/**
 * 팀 교체 메뉴를 표시합니다.
 * @param {boolean} isStrategic - 전략적 교체(내 턴 소모)인지, 빈사로 인한 강제 교체인지 여부
 */
export function showSwapMenu(isStrategic = false) {
    console.log("교체 메뉴 오픈 - 전략적:", isStrategic);
    const menuBox = document.getElementById("menu-box");
    menuBox.innerHTML = "";
    menuBox.classList.remove("hidden");
    
    showMessage("다음 포켓몬을 선택하세요!");

    // 내 팀 정보 확인
    if (!gameState.myTeam || gameState.myTeam.length === 0) {
        console.error("팀 정보가 없습니다!");
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = "선택 가능한 포켓몬 없음 (새로고침 필요)";
        btn.onclick = () => location.reload();
        menuBox.appendChild(btn);
        return;
    }

    // 팀의 각 포켓몬을 버튼으로 생성
    gameState.myTeam.forEach((pInfo, index) => {
        if (!pInfo) return;
        
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = pInfo.name || "알 수 없음";
        
        // 상태에 따른 버튼 비활성화 (이미 빈사했거나 현재 싸우고 있는 경우)
        if (pInfo.is_fainted) {
            btn.disabled = true;
            btn.innerText += " (빈사)";
        } else if (gameState.me && pInfo.name === gameState.me.name) {
            btn.disabled = true;
            btn.innerText += " (전투 중)";
        }
        
        // 클릭 시 교체 액션 실행
        btn.onclick = () => showSwapMenuAction(isStrategic, index);
        menuBox.appendChild(btn);
    });
    
    if (isStrategic) {
        const backBtn = document.createElement("button");
        backBtn.className = "menu-btn";
        backBtn.innerText = "뒤로가기";
        backBtn.onclick = showMenu;
        menuBox.appendChild(backBtn);
    }
}

// 메시지 순차 출력을 위한 Promise 체인
let messageChain = Promise.resolve();

/**
 * 하단 메시지 박스에 텍스트를 한 글자씩 타자 치는 효과로 출력합니다.
 * @param {string} text - 출력할 메시지
 */
export function showMessage(text) {
    // 이전 메시지가 완전히 끝난 후 다음 메시지가 나오도록 순서 보장
    messageChain = messageChain.then(() => {
        return new Promise(resolve => {
            const box = document.getElementById("message-box");
            box.innerText = "";
            let i = 0;
            const interval = setInterval(() => {
                if (i >= text.length) {
                    clearInterval(interval);
                    setTimeout(resolve, 800); // 메시지 출력 후 잠깐 대기
                    return;
                }
                box.innerText += text[i];
                i++;
            }, 30);
        });
    });
    return messageChain;
}
