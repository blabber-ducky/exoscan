"""add ollama_base_url to user_settings

Revision ID: 009
Revises: 008
Create Date: 2026-07-04
"""
import sqlalchemy as sa
from alembic import op

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_settings", sa.Column("ollama_base_url", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("user_settings", "ollama_base_url")
