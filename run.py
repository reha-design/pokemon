import uvicorn

if __name__ == "__main__":
    # reload=True 옵션을 사용하려면 앱을 문자열 형태("파일명:객체명")로 전달해야 합니다.
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
