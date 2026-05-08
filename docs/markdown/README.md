# 🎮 포켓몬 2세대 배틀 시뮬레이터

포켓몬스터 2세대(금/은/크리스탈)의 전투 시스템을 현대적인 웹 기술로 재현한 멀티플레이어 배틀 프로젝트입니다.

---

## 🛠 기술 스택 (Tech Stack)

| 구분 | 기술 |
| :--- | :--- |
| **Backend** | ![Python](https://img.shields.io/badge/Python-3.14+-3776AB?style=flat-square&logo=python&logoColor=white) ![FastAPI](https://img.shields.io/badge/FastAPI-0.136.1+-009688?style=flat-square&logo=fastapi&logoColor=white) ![Uvicorn](https://img.shields.io/badge/Uvicorn-0.46.0+-499848?style=flat-square) ![Websockets](https://img.shields.io/badge/Websockets-16.0+-000000?style=flat-square) |
| **Frontend** | ![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-F7DF1E?style=flat-square&logo=javascript&logoColor=black) ![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white) ![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white) |
| **DevOps** | ![uv](https://img.shields.io/badge/uv-Package_Manager-FFD43B?style=flat-square) ![Git](https://img.shields.io/badge/Git-F05032?style=flat-square&logo=git&logoColor=white) |

---

## 📂 프로젝트 구조 및 파일 설명

### 🐍 Backend (Python/FastAPI)
- **`main.py`**: 서버의 진입점입니다. FastAPI 앱 설정, CORS 미들웨어 구성 및 라우터들을 통합합니다.
- **`game.py`**: 게임의 핵심 비즈니스 로직을 담당합니다. 방(Room) 관리, 실시간 전투 턴 처리, 데미지 동기화 등을 수행합니다.
- **`pokemon.py`**: 포켓몬의 능력치 계산, 상성 보정 및 2세대 데미지 공식을 담은 핵심 클래스입니다.
- **`routers/`**: 엔드포인트를 기능별로 분리한 폴더입니다.
  - `lobby.py`: 방 목록 조회, 생성, 참가 등 REST API를 제공합니다.
  - `battle.py`: 실시간 전투 데이터를 주고받기 위한 WebSocket 엔드포인트를 관리합니다.
- **`starters.json`**: 포켓몬의 종족값, 타입, 기술 정보가 담긴 JSON 데이터베이스입니다.

### 🌐 Frontend (Vanilla JS Modules)
- **`index.html` / `style.css`**: 게임의 구조와 디자인을 정의합니다.
- **`js/`**: 유지보수를 위해 기능별로 모듈화된 자바스크립트 폴더입니다.
  - `main.js`: 프론트엔드 진입점입니다. HTML에서 호출 가능한 함수들을 글로벌로 노출합니다.
  - `state.js`: 전역 게임 상태(`gameState`), 플레이어 정보, 설정 상수를 관리합니다.
  - `ui.js`: DOM 조작 및 배틀 애니메이션(타이핑 효과, HP 바 갱신 등)을 전담합니다.
  - `lobby.js`: 포켓몬 선택 및 서버 API 통신(방 생성/참가)을 처리합니다.
  - `network.js`: 웹소켓 연결 및 수신된 메시지를 연출 순서에 맞게 큐(Queue)로 관리합니다.
  - `battle.js`: 턴 연출, 데미지 처리, 교체 및 배틀 종료 등의 게임 흐름을 제어합니다.

---

## 🚀 시작하기

이 프로젝트는 현대적인 Python 패키지 매니저인 `uv`를 사용합니다.

### 1. 필수 조건
- [uv](https://github.com/astral-sh/uv)가 설치되어 있어야 합니다.

### 2. 환경 구축 및 실행
```bash
# 의존성 설치 및 가상환경 동기화
uv sync

# 백엔드 서버 실행
uv run main.py
```
서버는 기본적으로 `http://localhost:8000`에서 실행됩니다. 브라우저로 해당 주소에 접속하면 게임을 시작할 수 있습니다.

---

## 📄 문서 (Documentation)
추가적인 상세 내용은 `docs/markdown/` 폴더 내의 문서를 참고하세요.
- `battle_flow.md`: 전투 로직 흐름도.
- `pokemon_gen2_battle_stats.md`: 2세대 전투 시스템 조사 결과.
