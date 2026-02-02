from fastapi import APIRouter

from app.api.routes import (
    auth,
    projects,
    subnets,
    hosts,
    ports,
    locks,
    vulnerability_instances,
    vulnerability_definitions,
    notes,
    admin_users,
    admin_locks,
    admin_audit,
    admin_import_export,
    admin_system,
)

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
router.include_router(vulnerability_definitions.router, prefix="/vulnerability-definitions", tags=["vulnerability-definitions"])
router.include_router(notes.router, prefix="/notes", tags=["notes"])
router.include_router(admin_users.router, prefix="/admin/users", tags=["admin-users"])
router.include_router(admin_locks.router, prefix="/admin/locks", tags=["admin-locks"])
router.include_router(admin_audit.router, prefix="/admin/audit", tags=["admin-audit"])
router.include_router(admin_import_export.router, prefix="/admin/import-export", tags=["admin-import-export"])
router.include_router(admin_system.router, prefix="/admin/system", tags=["admin-system"])