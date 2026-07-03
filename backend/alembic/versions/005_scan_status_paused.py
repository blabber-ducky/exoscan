"""add paused to scan status constraint

Revision ID: 005
Revises: 004
Create Date: 2026-07-03
"""
from alembic import op

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("chk_scan_status", "scans", type_="check")
    op.create_check_constraint(
        "chk_scan_status",
        "scans",
        "status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'paused')",
    )


def downgrade() -> None:
    op.drop_constraint("chk_scan_status", "scans", type_="check")
    op.create_check_constraint(
        "chk_scan_status",
        "scans",
        "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
    )
