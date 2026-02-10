from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.core.deps import get_current_user
from app.db.session import get_db
from app.models.models import Todo, Project, User, Port
from app.schemas.todo import TodoCreate, TodoUpdate, TodoRead

router = APIRouter()


def _check_project_access(db: Session, project_id: UUID, user: User) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


def _todo_to_read(t: Todo) -> TodoRead:
    # Backfill target_type/target_id for legacy todos that have FKs but default target_type
    tt, tid = t.target_type, t.target_id
    if tt == "scope" and (t.port_id or t.host_id or t.subnet_id):
        if t.port_id:
            tt, tid = "port", t.port_id
        elif t.host_id:
            tt, tid = "host", t.host_id
        elif t.subnet_id:
            tt, tid = "subnet", t.subnet_id
    return TodoRead(
        id=t.id,
        project_id=t.project_id,
        title=t.title,
        description=t.body,
        status=t.status,
        subnet_id=t.subnet_id,
        host_id=t.host_id,
        port_id=t.port_id,
        assigned_to_user_id=t.assigned_to_user_id,
        assigned_to_username=t.assigned_to.username if t.assigned_to else None,
        target_type=tt,
        target_id=tid,
        created_at=t.created_at,
        updated_at=t.updated_at,
    )


@router.get("", response_model=list[TodoRead])
def list_todos(
    project_id: UUID = Query(...),
    status: str | None = Query(None, pattern="^(open|done|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_project_access(db, project_id, current_user)
    q = db.query(Todo).options(joinedload(Todo.assigned_to)).filter(Todo.project_id == project_id)
    if status and status != "all":
        q = q.filter(Todo.status == status)
    q = q.order_by(Todo.created_at.desc())
    todos = q.all()
    return [_todo_to_read(t) for t in todos]


def _resolve_target_to_fks(
    db: Session, project_id: UUID, target_type: str | None, target_id: UUID | None,
    subnet_id: UUID | None, host_id: UUID | None, port_id: UUID | None,
) -> tuple[str, UUID | None, UUID | None, UUID | None, UUID | None]:
    """Return (target_type, target_id, subnet_id, host_id, port_id). Uses target_* when provided else derives from FKs."""
    if target_type is not None:
        tt, tid = target_type, target_id
        if tt == "scope":
            return ("scope", None, None, None, None)
        if tt == "vulnerabilities":
            return ("vulnerabilities", None, None, None, None)
        if tt == "vulnerability_definition" and tid:
            return ("vulnerability_definition", tid, None, None, None)
        if tt == "subnet" and tid:
            return ("subnet", tid, tid, None, None)
        if tt == "host" and tid:
            return ("host", tid, None, tid, None)
        if tt == "host_ports" and tid:
            return ("host_ports", tid, None, tid, None)
        if tt == "port" and tid:
            port = db.query(Port).filter(Port.id == tid).first()
            host_id_from_port = port.host_id if port else None
            return ("port", tid, None, host_id_from_port, tid)
    # Backwards compat: derive target_type/target_id from FKs
    if port_id:
        return ("port", port_id, None, host_id, port_id)
    if host_id:
        return ("host", host_id, None, host_id, None)
    if subnet_id:
        return ("subnet", subnet_id, subnet_id, None, None)
    return ("scope", None, None, None, None)


@router.post("", response_model=TodoRead, status_code=201)
def create_todo(
    body: TodoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _check_project_access(db, body.project_id, current_user)
    tt, tid, snid, hid, pid = _resolve_target_to_fks(
        db, body.project_id,
        body.target_type, body.target_id,
        body.subnet_id, body.host_id, body.port_id,
    )
    todo = Todo(
        project_id=body.project_id,
        title=body.title,
        body=body.description,
        status="open",
        target_type=tt,
        target_id=tid,
        subnet_id=snid,
        host_id=hid,
        port_id=pid,
        assigned_to_user_id=body.assigned_to_user_id,
    )
    db.add(todo)
    db.commit()
    todo = db.query(Todo).options(joinedload(Todo.assigned_to)).filter(Todo.id == todo.id).first()
    return _todo_to_read(todo)


@router.patch("/{todo_id}", response_model=TodoRead)
def update_todo(
    todo_id: UUID,
    body: TodoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = db.query(Todo).options(joinedload(Todo.assigned_to)).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    _check_project_access(db, todo.project_id, current_user)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        todo.status = data["status"]
    if "title" in data:
        todo.title = data["title"]
    if "description" in data:
        todo.body = data["description"]
    if "assigned_to_user_id" in data:
        todo.assigned_to_user_id = data["assigned_to_user_id"]
    db.commit()
    todo = db.query(Todo).options(joinedload(Todo.assigned_to)).filter(Todo.id == todo_id).first()
    return _todo_to_read(todo)


@router.delete("/{todo_id}", status_code=204)
def delete_todo(
    todo_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    todo = db.query(Todo).filter(Todo.id == todo_id).first()
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    _check_project_access(db, todo.project_id, current_user)
    db.delete(todo)
    db.commit()
    return None
