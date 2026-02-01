from contextlib import asynccontextmanager
from uuid import UUID

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.ws import manager as ws_manager
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
    await ws.send_json({"type": "hello", "app": "redopsync"})
    subscribed_project: UUID | None = None
    try:
        while True:
            data = await ws.receive_json()
            msg_type = data.get("type")
            if msg_type == "subscribe" and "project_id" in data:
                try:
                    project_id = UUID(data["project_id"])
                except (ValueError, TypeError):
                    await ws.send_json({"type": "error", "detail": "Invalid project_id"})
                    continue
                if subscribed_project:
                    await ws_manager.unsubscribe(ws, subscribed_project)
                await ws_manager.subscribe(ws, project_id)
                subscribed_project = project_id
                await ws.send_json({"type": "subscribed", "project_id": str(project_id)})
            elif msg_type == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        if subscribed_project:
            await ws_manager.unsubscribe(ws, subscribed_project)
