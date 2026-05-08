from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# 분리된 라우터 모듈 임포트
from routers import lobby, battle

app = FastAPI(title="Pokemon Battle Server")

# CORS 설정: 브라우저에서의 교차 출처 요청 허용
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 기능별 라우터 등록
app.include_router(lobby.router)   # 로비 관련 (HTTP)
app.include_router(battle.router)  # 배틀 관련 (WebSocket)

# 정적 파일 서빙: index.html, style.css, assets 등을 서비스
# (가장 하단에 위치하여 API 경로와 겹치지 않게 함)
app.mount("/", StaticFiles(directory=".", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    # 서버 실행 (모든 네트워크 인터페이스 허용)
    uvicorn.run(app, host="0.0.0.0", port=8000)
