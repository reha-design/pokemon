/**
 * 클라이언트 앱의 전역 설정 및 상태를 관리하는 모듈입니다.
 */

// API 및 웹소켓 접속을 위한 기본 URL 설정 (현재 호스트 기준)
export const API_BASE = `${window.location.protocol}//${window.location.hostname}:8000`;
export const WS_BASE = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:8000`;

// 플레이어 고유 ID 생성 및 로컬 스토리지 유지 (새로고침 시에도 동일 ID 유지)
export let playerId = localStorage.getItem("pokemon_player_id") || "user_" + Date.now();
localStorage.setItem("pokemon_player_id", playerId);

/**
 * 실시간 게임 진행 상태를 담는 객체
 */
export let gameState = {
    myPlayerId: playerId, // 내 고유 ID
    room_id: null,        // 현재 참여 중인 방 ID
    me: null,             // 내 배틀 데이터 (현재 활성화된 포켓몬 등)
    opponent: null,       // 상대방 배틀 데이터
    ws: null,             // 현재 활성화된 웹소켓 연결
    myTeam: [],           // 내 전체 팀 정보 (HP, 빈사 여부 등)
    isWaiting: false,     // 상대방의 입력을 기다리는 중인지 여부
    isP1: false           // 내가 Player 1인지 여부 (서버 판정 기준)
};

// 배경음악 설정
export const battleMusic = new Audio("assets/battle_bgm.mp3");
battleMusic.loop = true;

/**
 * 포켓몬별 스프라이트 이미지 경로 맵핑
 */
export const SPRITE_MAP = {
    "치코리타": { front: "assets/chikorita_front.png", back: "assets/chikorita_back.png" },
    "브케인": { front: "assets/cyndaquil_front.png", back: "assets/cyndaquil_back.png" },
    "리아코": { front: "assets/totodile_front.png", back: "assets/totodile_back.png" },
    "피카츄": { front: "assets/pikachu_front.png", back: "assets/pikachu_back.png" }
};

// 사용자가 선택한 스타팅 팀 목록 (최대 3마리)
export let selectedTeam = [];
