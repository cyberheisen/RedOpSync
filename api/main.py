from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.db.session import engine
from app.db.base import Base
from app.api.routes import router as api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    from app.db.session import SessionLocal
    from app.db.seed import seed_admin
    db = SessionLocal()
    try:
        seed_admin(db)
    finally:
        db.close()
    yield
    engine.dispose()


app = FastAPI(title="RedOpSync API", version="0.0.1", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

@app.get("/health")
def health():
    return {"status": "ok", "app": "redopsync", "version": "0.0.1"}

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    # Placeholder: push job/lock updates later
    await ws.send_json({"type": "hello", "app": "redopsync"})
    await ws.close()
