const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;
const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000`;

let playerId = localStorage.getItem("pokemon_player_id") || "user_" + Date.now();
localStorage.setItem("pokemon_player_id", playerId);

let gameState = {
    myPlayerId: playerId,
    room_id: null,
    me: null,
    opponent: null,
    ws: null,
    myTeam: [],
    isWaiting: false,
    weather: { type: "clear", turns: 0 }
};

const WEATHER_LABELS = {
    clear: "맑음",
    sun: "쾌청",
    rain: "비",
    sandstorm: "모래바람",
    hail: "싸라기눈"
};

const battleMusic = new Audio("assets/battle_bgm.mp3?v=browser-compatible-1");
battleMusic.loop = true;
battleMusic.preload = "auto";
const normalHitSound = new Audio("assets/normal_hit.wav?v=cc0-8bit-1");
normalHitSound.preload = "auto";
let audioEnabled = false;
let audioPrimed = false;

const SPRITE_MAP = {
    "이상해씨": {
        label: "이상해씨",
        color: "#69bf6b"
    },
    "파이리": {
        label: "파이리",
        color: "#f07a3f"
    },
    "꼬부기": {
        label: "꼬부기",
        color: "#5aa7dc"
    },
    "치코리타": { 
        front: "assets/chikorita_front.png", 
        back: "assets/chikorita_back.png" 
    },
    "브케인": { 
        front: "assets/cyndaquil_front.png", 
        back: "assets/cyndaquil_back.png" 
    },
    "리아코": { 
        front: "assets/totodile_front.png", 
        back: "assets/totodile_back.png" 
    },
    "나무지기": {
        label: "나무지기",
        color: "#4fbf7a"
    },
    "아차모": {
        label: "아차모",
        color: "#ef8b44"
    },
    "물짱이": {
        label: "물짱이",
        color: "#5aa8e8"
    },
    "모부기": {
        label: "모부기",
        color: "#79b85a"
    },
    "불꽃숭이": {
        label: "불꽃숭이",
        color: "#e76e46"
    },
    "팽도리": {
        label: "팽도리",
        color: "#5f9fd8"
    }
};

async function enableAudio() {
    audioEnabled = true;
    hideAudioPermission();
    await primeBattleMusic();
}

function skipAudioPermission() {
    audioEnabled = false;
    hideAudioPermission();
}

function hideAudioPermission() {
    const modal = document.getElementById("audio-permission");
    if (modal) modal.classList.add("hidden");
}

function showAudioNotice(text) {
    const panel = document.querySelector("#audio-permission .audio-panel p");
    if (panel) panel.innerText = text;
}

async function primeBattleMusic() {
    if (!audioEnabled || audioPrimed) return;

    try {
        battleMusic.volume = 0.8;
        normalHitSound.volume = 0.75;
        battleMusic.muted = false;
        await battleMusic.play();
        battleMusic.pause();
        battleMusic.currentTime = 0;
        await primeSoundEffect(normalHitSound);
        audioPrimed = true;
    } catch (firstError) {
        try {
            battleMusic.muted = true;
            await battleMusic.play();
            battleMusic.pause();
            battleMusic.currentTime = 0;
            battleMusic.muted = false;
            await primeSoundEffect(normalHitSound);
            audioPrimed = true;
        } catch (secondError) {
            battleMusic.muted = false;
            console.log("오디오 사전 활성화 실패:", firstError, secondError);
        }
    }
}

async function primeSoundEffect(sound) {
    sound.muted = true;
    await sound.play();
    sound.pause();
    sound.currentTime = 0;
    sound.muted = false;
}

function playNormalHitSound() {
    if (!audioEnabled) return;

    try {
        const sound = normalHitSound.cloneNode();
        sound.volume = normalHitSound.volume;
        sound.play().catch(error => console.log("피격음 재생 실패:", error));
    } catch (error) {
        console.log("피격음 생성 실패:", error);
    }
}

async function playBattleMusic() {
    if (!audioEnabled) return;

    try {
        battleMusic.muted = false;
        battleMusic.volume = 0.8;
        battleMusic.currentTime = 0;
        await battleMusic.play();
    } catch (error) {
        console.log("BGM 재생 실패 (사용자 상호작용 필요):", error);
        scheduleBattleMusicRetry();
    }
}

function scheduleBattleMusicRetry() {
    showMessage("BGM이 차단되었습니다. 화면을 한 번 클릭하면 음악을 다시 재생합니다.");
    document.addEventListener("click", retryBattleMusicFromGesture, { once: true });
}

async function retryBattleMusicFromGesture() {
    if (!audioEnabled || !gameState.me || !battleMusic.paused) return;

    try {
        battleMusic.muted = false;
        battleMusic.volume = 0.8;
        await battleMusic.play();
    } catch (error) {
        console.log("BGM 재시도 실패:", error);
    }
}

let selectedTeam = [];

// 1. 스타팅 선택
function pickStarter(name) {
    if (selectedTeam.includes(name)) return;
    if (selectedTeam.length >= 3) return;

    selectedTeam.push(name);
    
    // UI 업데이트
    const listSpan = document.getElementById("selected-team-list");
    if (listSpan) {
        listSpan.innerText = selectedTeam.join(", ");
    }
    const statusDiv = document.getElementById("team-selection-status");
    if (statusDiv) {
        statusDiv.innerText = `선택된 팀: ${selectedTeam.join(", ")} (${selectedTeam.length}/3)`;
    }
    
    // 버튼 비활성화
    const btn = document.getElementById(`btn-${name}`);
    if (btn) btn.classList.add("disabled");

    // 3마리 선택 완료 시 로비로 이동
    if (selectedTeam.length === 3) {
        document.getElementById("start-screen").classList.add("hidden");
        document.getElementById("lobby-screen").classList.remove("hidden");
        document.getElementById("selected-starter").innerText = selectedTeam.join(", ");
        refreshRooms();
    }
}

// 2. 로비 기능
async function refreshRooms() {
    const response = await fetch(`${API_BASE}/lobby/rooms`);
    const rooms = await response.json();
    const list = document.getElementById("room-list");
    list.innerHTML = "";
    
    if (rooms.length === 0) {
        list.innerHTML = "<p>현재 개설된 방이 없습니다.</p>";
        return;
    }
    
    rooms.forEach(room => {
        const div = document.createElement("div");
        div.className = "room-item";
        div.innerHTML = `
            <span>방 ID: ${room.id} (${room.players}/2)</span>
            <button onclick="joinRoom('${room.id}')" class="menu-btn">참가</button>
        `;
        list.appendChild(div);
    });
}

async function createRoom() {
    await primeBattleMusic();
    const res = await fetch(`${API_BASE}/lobby/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            player_id: playerId, 
            starter_names: selectedTeam
        })
    });
    const data = await res.json();
    enterWaitingRoom(data.room_id);
}

async function joinRoom(roomId) {
    await primeBattleMusic();
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
    enterWaitingRoom(data.room_id);
}

function enterWaitingRoom(roomId) {
    gameState.room_id = roomId;
    document.getElementById("lobby-screen").classList.add("hidden");
    document.getElementById("waiting-screen").classList.remove("hidden");
    document.getElementById("current-room-id").innerText = roomId;
    connectWebSocket(roomId);
}

// 3. 실시간 통신 (WebSocket)
// WS 메시지 큐 (순차 실행 보장)
let wsMessageQueue = [];
let isProcessingQueue = false;

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

function connectWebSocket(roomId) {
    const ws = new WebSocket(`${WS_BASE}/ws/battle/${roomId}/${playerId}`);
    gameState.ws = ws;
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log("[WS RX]", data.type, data);
        if (data.type === "OPPONENT_DISCONNECTED") {
            wsMessageQueue = [];
            isProcessingQueue = false;
            handleOpponentDisconnected(data.message);
            return;
        }
        wsMessageQueue.push(data);
        processMessageQueue();
    };
    
    ws.onclose = () => {
        console.log("WebSocket 연결 종료");
    };
    
    ws.onerror = (e) => {
        console.error("WebSocket 오류:", e);
    };
}

async function handleWSMessage(data) {
    switch (data.type) {
        case "BATTLE_START":
            document.getElementById("waiting-screen").classList.add("hidden");
            gameState.weather = data.weather || gameState.weather;
            gameState.isP1 = (data.p1.id === playerId);
            setupBattle(data);
            break;
        case "TURN_RESULT":
            gameState.isWaiting = false;
            gameState.weather = data.weather || gameState.weather;
            if (gameState.isP1) {
                gameState.myTeam = data.p1_team;
            } else {
                gameState.myTeam = data.p2_team;
            }
            await processEvents(data.events);
            break;
        case "WEATHER_CHANGED":
            gameState.weather = data.weather || gameState.weather;
            updateWeatherUI();
            await showMessage(data.message || "날씨가 변했다!");
            break;
        case "PLAYER_SWAPPED":
            gameState.isWaiting = false;
            await handleSwapEvent(data);
            break;
        case "BATTLE_END":
            await handleBattleEnd(data);
            break;
        case "OPPONENT_DISCONNECTED":
            await handleOpponentDisconnected(data.message);
            break;
    }
}

async function handleOpponentDisconnected(message = "상대의 연결이 끊어졌습니다") {
    resetToStartScreen();
    await showNoticeModal(message, 1000);
}

function resetToStartScreen() {
    if (gameState.ws) {
        gameState.ws.onclose = null;
        gameState.ws.close();
    }

    battleMusic.pause();
    battleMusic.currentTime = 0;
    closeMoveModal();

    gameState.room_id = null;
    gameState.me = null;
    gameState.opponent = null;
    gameState.ws = null;
    gameState.myTeam = [];
    gameState.isWaiting = false;
    gameState.weather = { type: "clear", turns: 0 };
    wsMessageQueue = [];
    isProcessingQueue = false;

    selectedTeam = [];
    document.querySelectorAll(".starter-btn.disabled").forEach(btn => btn.classList.remove("disabled"));

    setHTML("team-selection-status", '선택된 팀: <span id="selected-team-list">없음</span> (0/3)');
    setText("selected-starter", "---");
    setText("current-room-id", "---");
    setHTML("room-list", "<p>현재 개설된 방이 없습니다.</p>");
    setText("message-box", "세상을 구하러 떠나볼까요?");
    addClass("menu-box", "hidden");

    ["lobby-screen", "waiting-screen", "move-modal"].forEach(id => addClass(id, "hidden"));
    removeClass("start-screen", "hidden");
    updateWeatherUI();
}

function getEl(id) {
    return document.getElementById(id);
}

function setText(id, text) {
    const el = getEl(id);
    if (el) el.innerText = text;
}

function setHTML(id, html) {
    const el = getEl(id);
    if (el) el.innerHTML = html;
}

function addClass(id, className) {
    const el = getEl(id);
    if (el) el.classList.add(className);
}

function removeClass(id, className) {
    const el = getEl(id);
    if (el) el.classList.remove(className);
}

function showNoticeModal(message, duration = 1000) {
    const modal = document.getElementById("notice-modal");
    const msg = document.getElementById("notice-message");
    if (!modal || !msg) return Promise.resolve();

    msg.innerText = message;
    modal.classList.remove("hidden");

    return new Promise(resolve => {
        setTimeout(() => {
            modal.classList.add("hidden");
            resolve();
        }, duration);
    });
}

async function handleBattleEnd(data) {
    const isWinner = (data.winner_id === playerId);
    const msg = isWinner ? "축하합니다! 배틀에서 승리했습니다!" : "아쉽네요... 배틀에서 패배했습니다.";
    gameState.weather = data.weather || gameState.weather;
    
    // 마지막 상태 업데이트 (HP 등)
    if (gameState.isP1) {
        gameState.myTeam = data.p1_team;
    } else {
        gameState.myTeam = data.p2_team;
    }

    if (data.events && data.events.length > 0) {
        await processEvents(data.events, { showMenuAfter: false });
    }
    
    await showMessage(msg);
    battleMusic.pause();
    battleMusic.currentTime = 0;
    await new Promise(resolve => setTimeout(resolve, 3000));
    location.reload(); // 메인 화면으로 돌아가기
}

function setupBattle(data) {
    playBattleMusic();
    if (gameState.isP1) {
        gameState.me = data.p1;
        gameState.opponent = data.p2;
    } else {
        gameState.me = data.p2;
        gameState.opponent = data.p1;
    }
    gameState.myTeam = gameState.me.team;
    
    updateUI();
    showMessage("전투가 시작되었습니다!");
    showMenu();
}

async function processEvents(events, options = {}) {
    const showMenuAfter = options.showMenuAfter !== false;
    console.log(`[processEvents] 시작 - 이벤트 수: ${events.length}`, events);
    document.getElementById("menu-box").classList.add("hidden");
    
    for (let i = 0; i < events.length; i++) {
        const event = events[i]; // ← 핵심 수정: event 변수 올바르게 정의
        console.log(`[processEvents] 이벤트 ${i+1}/${events.length}:`, event);

        // 1. 로그 출력
        for (const log of event.logs) {
            console.log(`  [log] ${log}`);
            await showMessage(log);
            await animateMoveEffect(getMoveNameFromLog(log), event.attacker_id);
        }
        
        // 2. HP 및 UI 업데이트
        console.log(`  [HP] p1_hp=${event.p1_hp}, p2_hp=${event.p2_hp}`);
        const prevMyHp = gameState.me.hp;
        const prevOpponentHp = gameState.opponent.hp;
        if (gameState.isP1) {
            gameState.me.hp = event.p1_hp;
            gameState.opponent.hp = event.p2_hp;
        } else {
            gameState.me.hp = event.p2_hp;
            gameState.opponent.hp = event.p1_hp;
        }

        if (gameState.me.hp < prevMyHp || gameState.opponent.hp < prevOpponentHp) {
            playNormalHitSound();
        }
        
        // 내 팀 상태 동기화
        if (gameState.myTeam) {
            const activeIdx = gameState.myTeam.findIndex(p => p.name === gameState.me.name);
            if (activeIdx !== -1) {
                gameState.myTeam[activeIdx].hp = gameState.me.hp;
                if (gameState.me.hp <= 0) gameState.myTeam[activeIdx].is_fainted = true;
            }
        }
        
        updateUI();

        // 3. 교체 이벤트 처리 (swapped_id → player_id로 정규화하여 전달)
        if (event.swapped_id) {
            const swapData = { ...event, player_id: event.swapped_id };
            console.log(`  [SWAP] swapped_id=${event.swapped_id}, 내 ID=${playerId}, 내 교체여부=${event.swapped_id === playerId}`);
            await handleSwapEvent(swapData);
            continue;
        }

        // 4. 빈사 이벤트 처리
        if (event.fainted_id) {
            console.log(`  [FAINTED] ${event.fainted_id}`);
            const spriteId = event.fainted_id === playerId ? "player-sprite" : "enemy-sprite";
            document.getElementById(spriteId).classList.add("fainted");
            await new Promise(resolve => setTimeout(resolve, 1200));
            
            if (event.fainted_id === playerId) {
                const anyAlive = gameState.myTeam && gameState.myTeam.some(p => p.hp > 0 && !p.is_fainted);
                console.log(`  [FAINTED] 내 팀 생존자 있음: ${anyAlive}`, gameState.myTeam);
                if (anyAlive) {
                    showSwapMenu();
                } else {
                    console.log("  [FAINTED] 전원 빈사 - BATTLE_END 대기");
                }
                return;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log(`[processEvents] 완료 - 내 HP: ${gameState.me?.hp}`);
    if (showMenuAfter && gameState.me && gameState.me.hp > 0) {
        showMenu();
    }
}

function getMoveNameFromLog(log) {
    const match = log.match(/의 (.+)!$/);
    return match ? match[1] : null;
}

function animateMoveEffect(moveName, attackerId) {
    if (!moveName || !attackerId) return Promise.resolve();

    if (moveName === "몸통박치기") {
        return animateTackle(attackerId);
    }

    const effectMap = {
        "째려보기": "leer-effect",
        "울음소리": "growl-effect",
        "하이드로펌프": "hydro-pump-effect"
    };

    const effectClass = effectMap[moveName];
    if (!effectClass) return Promise.resolve();

    return playBattleEffect(effectClass, attackerId);
}

function animateTackle(attackerId) {
    const isMine = attackerId === playerId;
    const spriteId = isMine ? "player-sprite" : "enemy-sprite";
    const className = isMine ? "tackle-player" : "tackle-enemy";
    const sprite = document.getElementById(spriteId);

    if (!sprite) return Promise.resolve();

    sprite.classList.remove(className);
    void sprite.offsetWidth;
    sprite.classList.add(className);

    return new Promise(resolve => {
        const done = () => {
            sprite.classList.remove(className);
            resolve();
        };
        sprite.addEventListener("animationend", done, { once: true });
        setTimeout(done, 600);
    });
}

function playBattleEffect(effectClass, attackerId) {
    const layer = document.getElementById("effect-layer");
    if (!layer) return Promise.resolve();

    const isMine = attackerId === playerId;
    const effect = document.createElement("div");
    effect.className = `battle-effect ${effectClass} ${isMine ? "effect-player" : "effect-enemy"}`;

    if (effectClass === "growl-effect") {
        const wave = document.createElement("span");
        wave.className = "wave";
        effect.appendChild(wave);
    }

    layer.appendChild(effect);

    return new Promise(resolve => {
        const done = () => {
            effect.remove();
            resolve();
        };
        effect.addEventListener("animationend", done, { once: true });
        setTimeout(done, 950);
    });
}

// 4. UI 갱신 (팀 배틀 버전으로 수정)
function updateUI() {
    document.getElementById("player-name").innerText = gameState.me.name;
    document.getElementById("player-lv").innerText = gameState.me.level;
    document.getElementById("player-hp-text").innerText = `${gameState.me.hp}/${gameState.me.max_hp}`;
    
    document.getElementById("enemy-name").innerText = gameState.opponent.name;
    document.getElementById("enemy-lv").innerText = gameState.opponent.level;
    
    updateHPBar("player-hp-bar", gameState.me.hp, gameState.me.max_hp);
    updateHPBar("enemy-hp-bar", gameState.opponent.hp, gameState.opponent.max_hp);
    
    setSprite("player-sprite", gameState.me.name, "back");
    setSprite("enemy-sprite", gameState.opponent.name, "front");
    updateWeatherUI();
}

function updateWeatherUI() {
    const el = document.getElementById("weather-status");
    if (!el) return;

    const weatherType = gameState.weather?.type || "clear";
    if (weatherType === "clear") {
        el.classList.add("hidden");
        return;
    }

    const label = WEATHER_LABELS[weatherType] || weatherType;
    const turns = gameState.weather?.turns > 0 ? ` (${gameState.weather.turns}턴)` : "";
    el.innerText = `날씨: ${label}${turns}`;
    el.classList.remove("hidden");
}

function setSprite(id, name, view) {
    const el = document.getElementById(id);
    const data = SPRITE_MAP[name];
    el.innerText = "";
    el.classList.remove("sprite-fallback");
    if (!data) {
        el.classList.add("sprite-fallback");
        el.innerText = name;
        return;
    }

    if (data.sheet) {
        el.style.backgroundImage = `url('${data.sheet}')`;
        // 시트 방식: 플레이어는 뒷모습(오른쪽), 적은 앞모습(왼쪽)
        el.style.backgroundPosition = view === "front" ? "left center" : "right center";
        el.style.backgroundSize = "200%";
        el.style.backgroundColor = "";
    } else if (data.label) {
        el.style.backgroundImage = "";
        el.style.backgroundPosition = "center";
        el.style.backgroundSize = "contain";
        el.style.backgroundColor = data.color;
        el.innerText = data.label;
        el.classList.add("sprite-fallback");
    } else {
        // 개별 이미지 방식
        el.style.backgroundImage = `url('${data[view]}')`;
        el.style.backgroundPosition = "center";
        el.style.backgroundSize = "contain";
        el.style.backgroundColor = "";
    }
    el.style.backgroundRepeat = "no-repeat";
}

function updateHPBar(id, current, max) {
    const bar = document.getElementById(id);
    const percentage = (current / max) * 100;
    bar.style.width = `${percentage}%`;
        bar.style.backgroundColor = percentage > 50 ? "var(--hp-green)" : percentage > 20 ? "var(--hp-yellow)" : "var(--hp-red)";
}

function showMenu() {
    closeMoveModal();
    const menuBox = document.getElementById("menu-box");
    menuBox.innerHTML = `
        <button class="menu-btn" onclick="showFightMenu()">싸운다</button>
        <button class="menu-btn" onclick="showBagMenu()">가방</button>
        <button class="menu-btn" onclick="showSwapMenu(true)">포켓몬</button>
        <button class="menu-btn" onclick="tryRun()">도망간다</button>
    `;
    menuBox.classList.remove("hidden");
}

function showFightMenu() {
    showMessage("어떤 기술을 사용할까?");
    openMoveModal();
}

function openMoveModal() {
    const modal = document.getElementById("move-modal");
    const moveList = document.getElementById("move-list");
    moveList.innerHTML = "";

    gameState.me.moves.forEach((move, index) => {
        const btn = document.createElement("button");
        btn.className = "menu-btn move-btn";
        btn.innerText = `${move.name} (${move.type})`;
        btn.onclick = () => sendAction("MOVE", index);
        moveList.appendChild(btn);
    });

    modal.classList.remove("hidden");
}

function closeMoveModal() {
    const modal = document.getElementById("move-modal");
    if (modal) modal.classList.add("hidden");
}

async function showBagMenu() {
    if (gameState.isWaiting) return;
    await showMessage("가방은 아직 사용할 수 없습니다.");
    showMenu();
}

async function tryRun() {
    if (gameState.isWaiting) return;
    await showMessage("상대와의 배틀에서는 도망칠 수 없습니다!");
    showMenu();
}

function sendAction(type, index) {
    if (gameState.isWaiting) return;
    gameState.isWaiting = true;
    
    gameState.ws.send(JSON.stringify({
        type: "ACTION",
        action_type: type,
        index: index
    }));
    closeMoveModal();
    document.getElementById("menu-box").classList.add("hidden");
    showMessage("상대의 선택을 기다리는 중...");
}
function showSwapMenu(isStrategic = false) {
    console.log("교체 메뉴 오픈 - 전략적:", isStrategic);
    const menuBox = document.getElementById("menu-box");
    menuBox.innerHTML = "";
    menuBox.classList.remove("hidden");
    
    showMessage("어느 포켓몬으로 할까?");

    if (!gameState.myTeam || gameState.myTeam.length === 0) {
        console.error("팀 정보가 없습니다!");
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = "선택 가능한 포켓몬 없음 (새로고침 필요)";
        btn.onclick = () => location.reload();
        menuBox.appendChild(btn);
        return;
    }

    gameState.myTeam.forEach((pInfo, index) => {
        if (!pInfo) return;
        
        const btn = document.createElement("button");
        btn.className = "menu-btn";
        btn.innerText = pInfo.name || "알 수 없음";
        
        if (pInfo.is_fainted) {
            btn.disabled = true;
            btn.innerText += " (빈사)";
        } else if (gameState.me && pInfo.name === gameState.me.name) {
            btn.disabled = true;
            btn.innerText += " (전투 중)";
        }
        
        btn.onclick = () => {
            if (isStrategic) {
                sendAction("SWAP", index);
            } else {
                gameState.ws.send(JSON.stringify({ type: "SWAP_FAINTED", index: index }));
            }
            menuBox.classList.add("hidden");
        };
        menuBox.appendChild(btn);
    });
    
    if (isStrategic) {
        const backBtn = document.createElement("button");
        backBtn.className = "menu-btn";
        backBtn.innerText = "뒤로";
        backBtn.onclick = showMenu;
        menuBox.appendChild(backBtn);
    }
}

async function handleSwapEvent(data) {
    if (data.player_id === playerId) {
        // 본인이 교체한 경우
        gameState.me = data.new_pokemon;
        gameState.myTeam = data.new_pokemon.team; // 팀 상태 최신화 (is_fainted 등)
        document.getElementById("player-sprite").classList.remove("fainted");
    } else {
        // 상대방이 교체한 경우
        gameState.opponent = data.new_pokemon;
        document.getElementById("enemy-sprite").classList.remove("fainted");
    }
    
    updateUI();
    
    // undefined 방지 및 메시지 출력
    const msg = data.message || "포켓몬이 교체되었습니다.";
    await showMessage(msg);
    
    // 내 포켓몬이 살아있다면 메뉴 표시 (배틀 재개)
    if (gameState.me && gameState.me.hp > 0) {
        showMenu();
    }
}

let messageChain = Promise.resolve();

function showMessage(text) {
    // 이전 메시지 출력이 완료된 후에 다음 메시지를 출력하도록 체이닝
    messageChain = messageChain.then(() => {
        return new Promise(resolve => {
            const box = document.getElementById("message-box");
            box.innerText = "";
            let i = 0;
            const interval = setInterval(() => {
                if (i >= text.length) {
                    clearInterval(interval);
                    setTimeout(resolve, 800);
                    return;
                }
                box.innerText += text[i];
                i++;
            }, 30);
        });
    });
    return messageChain;
}

// 초기화
function leaveRoom() {
    if (gameState.ws) gameState.ws.close();
    location.reload();
}
