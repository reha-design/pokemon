# 프로젝트 기반 강의 수업내용증명서

## 1. 프로젝트 개요

본 문서는 포켓몬스터 2세대 전투 시스템을 참고한 실시간 1:1 포켓몬 배틀 시뮬레이터 프로젝트를 기반으로, 강의에서 다룬 주요 수업 내용을 증명하기 위해 작성하였다. 해당 프로젝트는 Python 기반 FastAPI 서버가 방 생성, 플레이어 입장, 웹소켓 통신, 턴 처리 로직을 담당하고, Vanilla JavaScript 프론트엔드는 포켓몬 선택, 로비, 전투 화면, 전투 로그 및 HP 상태 표시를 담당하도록 구성하였다.

수업의 목표는 단순한 화면 구현을 넘어서 실제 게임 규칙을 코드로 모델링하고, 클라이언트와 서버가 실시간으로 상태를 주고받는 구조를 이해하도록 하는 것이다. 특히 포켓몬의 타입 상성, 자속 보정, 명중률, 능력치 랭크 변화, 교체와 공격의 우선순위 같은 전투 규칙을 직접 구현하는 과정을 통해 객체지향 설계와 네트워크 프로그래밍을 함께 다루었다.

## 2. 강의 주제 및 필요성

본 강의에서는 Python 문법, 클래스, JSON 데이터 처리, 웹 API, 비동기 통신 개념을 하나의 결과물로 연결하기 위해 게임형 프로젝트를 활용하였다. 포켓몬 배틀은 규칙이 명확하고 데이터 구조가 분명하기 때문에 객체 모델링 연습에 적합하다. 또한 두 명의 사용자가 같은 방에 접속하여 동시에 행동을 선택해야 하므로, 일반적인 요청-응답 방식뿐 아니라 WebSocket 기반 실시간 통신을 설명하고 실습하기에도 적합하다.

## 3. 사용 기술

- Python: 전투 규칙, 서버 로직, 데이터 처리 구현
- FastAPI: REST API 및 WebSocket 서버 구현
- Pydantic: 요청 데이터 검증
- JSON: 포켓몬 능력치와 기술 데이터 저장
- HTML/CSS/JavaScript: 사용자 인터페이스 구현
- WebSocket: 실시간 전투 이벤트 송수신
- uv: Python 실행 환경 및 의존성 관리

## 4. 시스템 구성

프로젝트는 크게 백엔드와 프론트엔드로 나뉜다.

백엔드는 `main.py`와 `pokemon.py`가 중심이다. `main.py`는 로비, 방 생성, 입장, 웹소켓 연결, 턴 처리 흐름을 담당한다. `pokemon.py`는 포켓몬 객체, 기술 객체, 타입 상성표, 데미지 계산 함수를 담당한다. 전투 데이터는 `starters.json`에 저장되어 있으며, 서버 실행 시 JSON 파일을 읽어 포켓몬 객체로 변환한다.

프론트엔드는 `index.html`, `style.css`, `script.js`로 구성된다. 사용자는 포켓몬 세 마리를 선택한 뒤 방을 만들거나 기존 방에 입장할 수 있다. 전투가 시작되면 클라이언트는 WebSocket으로 서버와 연결되고, 서버에서 전달하는 전투 이벤트를 순서대로 화면에 반영한다.

## 5. 주요 기능

### 5.1 포켓몬 및 기술 데이터 관리

수업에서는 포켓몬의 이름, 타입, 레벨, 능력치, 기술 목록을 JSON 파일에 저장하도록 구성하였다. 이렇게 데이터를 코드와 분리하면 새로운 포켓몬이나 기술을 추가할 때 전투 로직을 수정하지 않고 데이터만 확장할 수 있음을 설명하였다.

```json
{
  "name": "브케인",
  "type": ["Fire"],
  "level": 10,
  "stats": {
    "hp": 27,
    "attack": 15,
    "defense": 13,
    "special_attack": 17,
    "special_defense": 15,
    "speed": 18
  },
  "moves": [
    {
      "name": "불꽃세례",
      "type": "Fire",
      "category": "Special",
      "power": 40,
      "accuracy": 100,
      "pp": 25
    }
  ]
}
```

### 5.2 포켓몬 클래스 구현

`Pokemon` 클래스는 현재 HP, 최대 HP, 능력치, 기술 목록, 랭크 보정 상태를 가지도록 설계하였다. 전투 중 데미지를 받거나 능력치가 변화할 때 객체 내부 상태가 갱신되는 구조를 통해 클래스와 객체 상태 관리 개념을 다루었다.

```python
class Pokemon:
    def __init__(self, data):
        self.name = data['name']
        self.types = data['type']
        self.level = data['level']
        self.stats = data['stats']
        self.current_hp = self.stats['hp']
        self.max_hp = self.stats['hp']
        self.moves = [Move(m) for m in data['moves']]
        self.stages = {
            "attack": 0,
            "defense": 0,
            "special_attack": 0,
            "special_defense": 0,
            "speed": 0
        }
```

능력치 랭크는 -6부터 +6까지 변화하며, 실제 능력치를 계산할 때 배율을 적용한다.

```python
def get_stat(self, stat_name):
    base_stat = self.stats.get(stat_name, 0)
    stage = self.stages.get(stat_name, 0)

    if stage >= 0:
        multiplier = (2 + stage) / 2
    else:
        multiplier = 2 / (2 + abs(stage))

    return math.floor(base_stat * multiplier)
```

### 5.3 타입 상성과 데미지 계산

포켓몬 배틀의 핵심인 데미지 계산은 `calculate_damage` 함수로 분리하였다. 이 함수는 명중률, 물리/특수 공격 구분, 자속 보정, 타입 상성, 급소, 난수 보정을 적용하며, 복잡한 규칙을 함수 단위로 분리하는 방법을 설명하는 예제로 활용하였다.

```python
def calculate_damage(attacker, defender, move):
    if move.category == "Status":
        return 0, 1.0

    if random.randint(1, 100) > move.accuracy:
        return 0, -1.0

    if move.category == "Physical":
        atk = attacker.get_stat("attack")
        dfn = defender.get_stat("defense")
    else:
        atk = attacker.get_stat("special_attack")
        dfn = defender.get_stat("special_defense")

    level_factor = (2 * attacker.level / 5) + 2
    base_damage = (level_factor * move.power * atk / dfn) / 50 + 2

    stab = 1.5 if move.type in attacker.types else 1.0
    type_mod = get_type_effectiveness(move.type, defender.types)
    crit_mod = 1.5 if random.random() < 0.0625 else 1.0
    random_factor = random.randint(217, 255) / 255

    final_damage = math.floor(base_damage * stab * type_mod * crit_mod * random_factor)
    return final_damage, type_mod
```

이 구조를 통해 데미지 계산 규칙을 서버의 턴 처리 로직과 분리할 수 있음을 확인하였다. 따라서 전투 공식만 수정하거나 테스트할 때 `pokemon.py`만 확인하면 되는 구조적 장점을 수업에서 다루었다.

### 5.4 로비 및 방 생성 기능

수업에서는 사용자가 프론트엔드에서 팀을 선택한 뒤 방을 생성하거나 기존 방에 참가하는 흐름을 구현하였다. 서버는 방 정보를 `rooms` 딕셔너리에 저장하고, 방마다 플레이어 목록, 행동 선택 상태, 전투 상태를 관리하도록 하였다.

```python
class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = []
        self.turn_order = []
        self.actions = {}
        self.state = "waiting"

    def add_player(self, player_id, starter_names):
        if len(self.players) >= 2:
            return False

        team_data = []
        for name in starter_names:
            p_data = next(p for p in STARTERS_DATA if p["name"] == name)
            team_data.append(p_data)

        self.players.append({
            "id": player_id,
            "starter": starter_names[0],
            "team": [Pokemon(pd) for pd in team_data],
            "active_idx": 0,
            "ws": None
        })
        return True
```

### 5.5 WebSocket 기반 실시간 전투

두 플레이어가 모두 같은 방에 접속하면 서버는 전투 시작 메시지를 양쪽 클라이언트에 전송한다. 이후 각 플레이어가 행동을 선택하면 서버가 두 행동을 모두 수집한 뒤 턴을 처리하도록 구성하여, WebSocket 기반 실시간 통신과 서버 중심 상태 관리 방식을 설명하였다.

```python
@app.websocket("/ws/battle/{room_id}/{player_id}")
async def battle_websocket(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()
    room = rooms[room_id]
    player = next((p for p in room.players if p["id"] == player_id), None)
    player["ws"] = websocket

    if len(room.players) == 2 and all(p["ws"] for p in room.players):
        room.state = "battle"
        p1, p2 = room.players
        await room.broadcast({
            "type": "BATTLE_START",
            "p1": get_battle_info(p1),
            "p2": get_battle_info(p2)
        })
```

클라이언트는 WebSocket 메시지를 큐에 넣고 순서대로 처리한다. 이 방식은 여러 전투 이벤트가 짧은 시간에 도착해도 화면 표시 순서가 꼬이지 않도록 돕는 구조로, 비동기 이벤트 처리의 필요성을 설명하는 예제로 활용하였다.

```javascript
let wsMessageQueue = [];
let isProcessingQueue = false;

async function processMessageQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (wsMessageQueue.length > 0) {
        const data = wsMessageQueue.shift();
        await handleWSMessage(data);
    }

    isProcessingQueue = false;
}
```

## 6. 핵심 코드 구간별 설명

### 6.1 서버 초기화 및 데이터 로드 구간

해당 구간에서는 FastAPI 애플리케이션을 생성하고, 프론트엔드와의 통신을 허용하기 위한 CORS 설정을 적용하였다. 또한 `starters.json` 파일을 읽어 포켓몬 데이터를 서버 메모리에 로드하였다. 이 부분은 웹 서버 구성, 외부 데이터 파일 읽기, JSON 파싱을 설명하는 핵심 코드로 활용하였다.

```python
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

with open("starters.json", "r", encoding="utf-8") as f:
    STARTERS_DATA = json.load(f)["starters"]
```

### 6.2 방 생성 및 플레이어 등록 구간

이 구간은 실시간 대전에서 필요한 방 관리 구조를 보여준다. `Room` 객체는 방 번호, 참가자 목록, 플레이어별 행동, 현재 상태를 저장한다. 플레이어가 선택한 포켓몬 이름을 기준으로 JSON 데이터에서 포켓몬 정보를 찾아 팀 객체를 구성하는 과정도 포함되어 있다.

```python
rooms = {}

class Room:
    def __init__(self, room_id):
        self.room_id = room_id
        self.players = []
        self.turn_order = []
        self.actions = {}
        self.state = "waiting"

    def add_player(self, player_id, starter_names):
        if len(self.players) >= 2:
            return False

        team_data = []
        for name in starter_names:
            p_data = next(p for p in STARTERS_DATA if p["name"] == name)
            team_data.append(p_data)

        self.players.append({
            "id": player_id,
            "starter": starter_names[0],
            "team": [Pokemon(pd) for pd in team_data],
            "active_idx": 0,
            "ws": None
        })
        return True
```

### 6.3 로비 API 처리 구간

방 목록 조회, 방 생성, 방 입장은 REST API로 구현하였다. 이 구간은 HTTP 요청과 응답, 요청 데이터 검증, 서버 상태 저장을 설명하는 코드이다. `JoinRequest` 모델을 통해 클라이언트가 보내는 플레이어 ID, 선택 포켓몬 목록, 방 ID를 구조화하였다.

```python
class JoinRequest(BaseModel):
    player_id: str
    starter_names: List[str]
    room_id: str = None

@app.get("/lobby/rooms")
async def get_rooms():
    return [
        {"id": rid, "players": len(r.players)}
        for rid, r in rooms.items()
        if r.state == "waiting"
    ]

@app.post("/lobby/create")
async def create_room(request: JoinRequest):
    room_id = str(uuid.uuid4())[:8]
    room = Room(room_id)
    room.add_player(request.player_id, request.starter_names)
    rooms[room_id] = room
    return {"room_id": room_id}
```

### 6.4 WebSocket 연결 및 전투 시작 구간

전투는 HTTP 요청이 아니라 WebSocket 연결을 통해 진행된다. 두 명의 플레이어가 모두 같은 방에 접속하면 서버는 `BATTLE_START` 메시지를 브로드캐스트하여 양쪽 클라이언트의 전투 화면을 시작시킨다. 이 구간은 실시간 양방향 통신 구조를 설명하는 핵심 코드이다.

```python
@app.websocket("/ws/battle/{room_id}/{player_id}")
async def battle_websocket(websocket: WebSocket, room_id: str, player_id: str):
    await websocket.accept()
    room = rooms[room_id]
    player = next((p for p in room.players if p["id"] == player_id), None)
    player["ws"] = websocket

    if len(room.players) == 2 and all(p["ws"] for p in room.players):
        room.state = "battle"
        p1, p2 = room.players
        await room.broadcast({
            "type": "BATTLE_START",
            "p1": get_battle_info(p1),
            "p2": get_battle_info(p2)
        })
```

### 6.5 턴 입력 수집 및 처리 구간

두 플레이어가 모두 행동을 선택해야 턴이 처리되도록 구성하였다. 한 명의 행동만 먼저 도착해도 서버는 바로 전투를 진행하지 않고, `room.actions`에 행동을 저장한 뒤 두 명의 입력이 모두 모였을 때 `process_multiplayer_turn`을 호출한다.

```python
async def check_and_process_turn(room):
    collected = list(room.actions.keys())
    needed = [p["id"] for p in room.players]
    waiting = [pid[:8] for pid in needed if pid not in room.actions]
    ready = [pid[:8] for pid in collected]
    print(f"[TURN] 액션 수집: {ready} / 대기 중: {waiting}")

    if len(room.actions) == 2:
        try:
            await process_multiplayer_turn(room)
        finally:
            room.actions = {}
```

### 6.6 교체 및 공격 순서 결정 구간

전투 규칙에 따라 교체 행동은 공격보다 먼저 처리하고, 공격 행동은 스피드 값을 기준으로 순서를 정하였다. 이 구간은 조건문, 리스트 처리, 객체 상태 변경을 활용하여 게임 규칙을 코드로 표현한 예시이다.

```python
swap_order = []
if actions[p1["id"]]["type"] == "SWAP":
    swap_order.append(p1)
if actions[p2["id"]]["type"] == "SWAP":
    swap_order.append(p2)

for p in swap_order:
    old_name = p["team"][p["active_idx"]].name
    p["active_idx"] = actions[p["id"]]["index"]
    new_pkmn = p["team"][p["active_idx"]]
    new_pkmn.reset_stages()

move_order = []
if actions[p1["id"]]["type"] == "MOVE":
    move_order.append(p1)
if actions[p2["id"]]["type"] == "MOVE":
    move_order.append(p2)

if len(move_order) == 2:
    s1 = p1["team"][p1["active_idx"]].get_stat("speed")
    s2 = p2["team"][p2["active_idx"]].get_stat("speed")
    if s2 > s1:
        move_order = [p2, p1]
```

### 6.7 데미지 적용 및 전투 이벤트 생성 구간

공격자가 선택한 기술을 가져오고, 변화기인지 공격기인지에 따라 처리 방식을 나누었다. 공격기인 경우 `calculate_damage` 함수를 호출하여 데미지를 계산하고, 결과를 이벤트 목록에 저장해 클라이언트로 전달한다.

```python
move_idx = actions[attacker_p["id"]]["index"]
move = attacker.moves[move_idx]

logs = [f"{attacker.name}의 {move.name}!"]
if move.category == "Status":
    if move.name == "울음소리":
        defender.apply_stat_change("attack", -1)
        logs.append(f"{defender.name}의 공격력이 떨어졌다!")
else:
    dmg, mod = calculate_damage(attacker, defender, move)
    if mod == -1.0:
        logs.append("공격이 빗나갔다!")
    else:
        defender.take_damage(dmg)
        if mod > 1.0:
            logs.append("효과가 굉장했다!")

events.append({
    "logs": logs,
    "p1_hp": p1["team"][p1["active_idx"]].current_hp,
    "p2_hp": p2["team"][p2["active_idx"]].current_hp,
    "attacker_id": attacker_p["id"]
})
```

### 6.8 클라이언트 WebSocket 메시지 처리 구간

프론트엔드는 서버에서 받은 WebSocket 메시지를 큐에 저장하고 순서대로 처리한다. `BATTLE_START`, `TURN_RESULT`, `PLAYER_SWAPPED`, `BATTLE_END` 같은 메시지 타입에 따라 서로 다른 화면 갱신 로직을 실행하도록 구성하였다.

```javascript
async function handleWSMessage(data) {
    switch (data.type) {
        case "BATTLE_START":
            document.getElementById("waiting-screen").classList.add("hidden");
            gameState.isP1 = (data.p1.id === playerId);
            setupBattle(data);
            break;
        case "TURN_RESULT":
            gameState.isWaiting = false;
            await processEvents(data.events);
            break;
        case "PLAYER_SWAPPED":
            gameState.isWaiting = false;
            await handleSwapEvent(data);
            break;
        case "BATTLE_END":
            await handleBattleEnd(data);
            break;
    }
}
```

### 6.9 사용자 행동 전송 구간

사용자가 공격 또는 교체를 선택하면 클라이언트는 선택 내용을 JSON 형태로 WebSocket에 전송한다. 이후 메뉴를 숨기고 상대 선택을 기다리는 메시지를 표시하여, 턴제 게임의 대기 상태를 화면에 반영한다.

```javascript
function sendAction(type, index) {
    if (gameState.isWaiting) return;
    gameState.isWaiting = true;

    gameState.ws.send(JSON.stringify({
        type: "ACTION",
        action_type: type,
        index: index
    }));

    document.getElementById("menu-box").classList.add("hidden");
    showMessage("상대의 선택을 기다리는 중...");
}
```

### 6.10 화면 갱신 및 HP 바 표시 구간

서버에서 전달받은 HP와 포켓몬 정보를 바탕으로 화면의 이름, 레벨, HP 텍스트, HP 바, 스프라이트 이미지를 갱신한다. 이 구간은 서버 상태와 사용자 인터페이스를 동기화하는 프론트엔드 핵심 코드이다.

```javascript
function updateUI() {
    document.getElementById("player-name").innerText = gameState.me.name;
    document.getElementById("player-lv").innerText = gameState.me.level;
    document.getElementById("player-hp-text").innerText =
        `${gameState.me.hp}/${gameState.me.max_hp}`;

    document.getElementById("enemy-name").innerText = gameState.opponent.name;
    document.getElementById("enemy-lv").innerText = gameState.opponent.level;

    updateHPBar("player-hp-bar", gameState.me.hp, gameState.me.max_hp);
    updateHPBar("enemy-hp-bar", gameState.opponent.hp, gameState.opponent.max_hp);

    setSprite("player-sprite", gameState.me.name, "back");
    setSprite("enemy-sprite", gameState.opponent.name, "front");
}

function updateHPBar(id, current, max) {
    const bar = document.getElementById(id);
    const percentage = (current / max) * 100;
    bar.style.width = `${percentage}%`;
    bar.style.backgroundColor =
        percentage > 50 ? "var(--hp-green)" :
        percentage > 20 ? "var(--hp-yellow)" :
        "var(--hp-red)";
}
```

## 7. 수업 진행 내용

먼저 2세대 포켓몬 전투 규칙을 조사하여 타입 상성, 물리/특수 분류, 데미지 계산 공식을 정리하는 과정을 다루었다. 이후 JSON 파일에 포켓몬 데이터를 작성하고, Python 클래스에서 데이터를 읽어 전투 객체로 변환하도록 구현하였다.

다음 단계에서는 FastAPI로 로비 API를 구현하였다. 방 생성, 방 목록 조회, 방 입장을 REST API로 구성하고, 실제 전투는 WebSocket으로 처리하였다. 각 플레이어가 선택한 행동은 방 객체의 `actions`에 저장되며, 두 명의 행동이 모두 모이면 서버가 교체와 공격 순서를 계산하는 구조를 설명하였다.

마지막으로 프론트엔드에서 포켓몬 선택 화면, 로비 화면, 대기 화면, 전투 화면을 연결하였다. 서버가 보내는 이벤트를 기반으로 HP 바, 포켓몬 이미지, 전투 메시지를 갱신하여 사용자가 전투 진행 상황을 확인할 수 있도록 구현하였다.

## 8. 실행 방법

의존성 설치:

```bash
uv sync
```

서버 실행:

```bash
uv run main.py
```

또는 개발 모드 실행:

```bash
uv run run.py
```

서버 실행 후 브라우저에서 `index.html`을 열거나 `http://localhost:8000`에 접속하여 프로젝트를 확인할 수 있다.

## 9. 수업 결과 및 기대 효과

본 프로젝트를 통해 Python 객체지향 프로그래밍, JSON 데이터 모델링, FastAPI 서버 구현, WebSocket 실시간 통신, JavaScript 기반 UI 갱신을 종합적으로 다루었다. 단순히 문법을 학습하는 것에서 나아가, 하나의 기능이 데이터, 서버, 클라이언트 사이에서 어떻게 연결되는지 확인할 수 있도록 수업을 구성하였다.

또한 전투 규칙을 `pokemon.py`에 분리하여 구현했기 때문에 추후 새로운 포켓몬, 기술, 상태 이상, 우선도 기술, PP 관리 등을 추가하기 쉽다. 현재 구현은 기본적인 턴제 전투를 중심으로 하지만, 구조를 확장하면 더 완성도 높은 웹 기반 배틀 게임으로 발전시킬 수 있음을 설명하였다.

## 10. 향후 확장 가능 내용

- 기술 사용 시 PP 감소 기능 추가
- 상태 이상 기능 추가
- 급소 발생 여부를 전투 로그에 표시
- 방 연결이 끊겼을 때 재접속 또는 승패 처리 개선
- 프론트엔드에서 전투 애니메이션 강화
- 여러 방을 장시간 운영할 수 있도록 방 정리 로직 개선
- 테스트 코드를 작성하여 데미지 계산과 타입 상성을 검증

## 11. 결론

이번 프로젝트는 강의에서 다룬 내용을 실제 작동하는 웹 게임 형태로 통합한 수업 사례이다. 포켓몬 전투라는 친숙한 주제를 바탕으로 객체 설계, 서버 API, 실시간 통신, 프론트엔드 상태 관리까지 폭넓게 설명하고 실습할 수 있도록 구성하였다. 특히 전투 규칙을 코드로 표현하는 과정에서 문제를 작은 단위로 나누어 설계하는 방법을 다루었고, WebSocket을 활용하면서 실시간 서비스 구조에 대한 이해를 높이는 수업 자료로 활용하였다.
