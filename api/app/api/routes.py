from fastapi import APIRouter

router = APIRouter(prefix="/api")

@router.get("/version")
def version():
    return {"name": "RedOpSync", "version": "0.0.1"}
