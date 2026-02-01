from fastapi import APIRouter

from app.api.routes import auth, projects, subnets, hosts, ports, locks, vulnerability_instances, notes

router = APIRouter(prefix="/api")


@router.get("/version")
def version():
    return {"name": "RedOpSync", "version": "0.0.1"}


router.include_router(auth.router, prefix="/auth", tags=["auth"])
router.include_router(projects.router, prefix="/projects", tags=["projects"])
router.include_router(subnets.router, prefix="/subnets", tags=["subnets"])
router.include_router(hosts.router, prefix="/hosts", tags=["hosts"])
router.include_router(ports.router, prefix="/ports", tags=["ports"])
router.include_router(locks.router, prefix="/locks", tags=["locks"])
router.include_router(vulnerability_instances.router, prefix="/vulnerability-instances", tags=["vulnerability-instances"])
router.include_router(notes.router, prefix="/notes", tags=["notes"])
