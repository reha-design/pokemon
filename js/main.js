/**
 * 클라이언트 애플리케이션의 진입점(Entry Point)입니다.
 * 각 모듈에서 정의한 핵심 함수들을 불러와 전역 객체(window)에 바인딩하여 
 * HTML 내의 인라인 이벤트 핸들러(onclick 등)에서 호출할 수 있도록 합니다.
 */

import { pickStarter, createRoom, refreshRooms, joinRoom } from './lobby.js';
import { leaveRoom } from './battle.js';

// HTML에서 직접 접근할 수 있도록 전역 스코프에 노출
window.pickStarter = pickStarter;     // 포켓몬 선택
window.createRoom = createRoom;       // 방 생성
window.refreshRooms = refreshRooms;   // 방 목록 갱신
window.joinRoom = joinRoom;           // 방 참가
window.leaveRoom = leaveRoom;         // 나가기
