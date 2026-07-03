"""scan completed_stages for pause/resume support

Revision ID: 004
Revises: 003
Create Date: 2026-07-03
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'scans',
        sa.Column(
            'completed_stages',
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        )
    )


def downgrade() -> None:
    op.drop_column('scans', 'completed_stages')
