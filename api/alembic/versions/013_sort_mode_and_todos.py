"""add project sort_mode and todo optional FKs + status

Revision ID: 013
Revises: 012
Create Date: 2025-02-05

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "013"
down_revision: Union[str, None] = "012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "projects",
        sa.Column("sort_mode", sa.String(32), nullable=False, server_default="cidr_asc"),
    )
    op.add_column(
        "todos",
        sa.Column("status", sa.String(16), nullable=False, server_default="open"),
    )
    op.add_column("todos", sa.Column("subnet_id", sa.UUID(), nullable=True))
    op.add_column("todos", sa.Column("host_id", sa.UUID(), nullable=True))
    op.add_column("todos", sa.Column("port_id", sa.UUID(), nullable=True))
    op.add_column(
        "todos",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_foreign_key(
        "fk_todos_subnet_id", "todos", "subnets", ["subnet_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_todos_host_id", "todos", "hosts", ["host_id"], ["id"], ondelete="SET NULL"
    )
    op.create_foreign_key(
        "fk_todos_port_id", "todos", "ports", ["port_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_todos_subnet_id", "todos", ["subnet_id"], unique=False)
    op.create_index("ix_todos_host_id", "todos", ["host_id"], unique=False)
    op.create_index("ix_todos_port_id", "todos", ["port_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_todos_port_id", "todos")
    op.drop_index("ix_todos_host_id", "todos")
    op.drop_index("ix_todos_subnet_id", "todos")
    op.drop_constraint("fk_todos_port_id", "todos", type_="foreignkey")
    op.drop_constraint("fk_todos_host_id", "todos", type_="foreignkey")
    op.drop_constraint("fk_todos_subnet_id", "todos", type_="foreignkey")
    op.drop_column("todos", "updated_at")
    op.drop_column("todos", "port_id")
    op.drop_column("todos", "host_id")
    op.drop_column("todos", "subnet_id")
    op.drop_column("todos", "status")
    op.drop_column("projects", "sort_mode")
