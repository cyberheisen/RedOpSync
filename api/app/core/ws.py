"""WebSocket connection manager for broadcasting lock and job events."""
import asyncio
import json
from uuid import UUID

from fastapi import WebSocket


class ConnectionManager:
    """Manages WebSocket connections per project for broadcasting events."""

    def __init__(self) -> None:
        # project_id -> set of WebSocket connections
        self._project_connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def subscribe(self, ws: WebSocket, project_id: UUID) -> None:
        """Register a connection as subscribed to a project."""
        key = str(project_id)
        async with self._lock:
            if key not in self._project_connections:
                self._project_connections[key] = set()
            self._project_connections[key].add(ws)

    async def unsubscribe(self, ws: WebSocket, project_id: UUID) -> None:
        """Remove a connection from a project's subscribers."""
        key = str(project_id)
        async with self._lock:
            if key in self._project_connections:
                self._project_connections[key].discard(ws)
                if not self._project_connections[key]:
                    del self._project_connections[key]

    async def broadcast_lock_changed(
        self,
        project_id: UUID,
        event: str,
        payload: dict,
    ) -> None:
        """Broadcast lock_changed (or lock_released) to all project subscribers."""
        key = str(project_id)
        async with self._lock:
            connections = self._project_connections.get(key, set()).copy()
        msg = json.dumps({"type": "lock_changed", "event": event, "data": payload})
        dead: list[WebSocket] = []
        for ws in connections:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        if dead:
            async with self._lock:
                for ws in dead:
                    if key in self._project_connections:
                        self._project_connections[key].discard(ws)
                if key in self._project_connections and not self._project_connections[key]:
                    del self._project_connections[key]


# Global instance; set on app.state in main
manager = ConnectionManager()
