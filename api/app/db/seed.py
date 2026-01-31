from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_password
from app.models.models import User


def seed_admin(db: Session) -> None:
    existing = db.query(User).filter(User.username == "admin").first()
    if existing:
        return
    admin = User(
        username="admin",
        password_hash=hash_password(settings.admin_password),
        role="admin",
    )
    db.add(admin)
    db.commit()
