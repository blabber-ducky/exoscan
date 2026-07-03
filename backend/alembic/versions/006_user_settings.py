"""add user_settings table

Revision ID: 006
Revises: 005
Create Date: 2026-07-03
"""
import sqlalchemy as sa
from alembic import op

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("llm_provider", sa.String(50), server_default="openai", nullable=False),
        sa.Column("llm_model", sa.String(100), server_default="gpt-4o", nullable=False),
        sa.Column("llm_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("perplexity_api_key_encrypted", sa.Text(), nullable=True),
        sa.Column("strix_telemetry", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("strix_default_scan_mode", sa.String(20), server_default="standard", nullable=False),
        sa.Column(
            "strix_default_max_budget_usd",
            sa.Numeric(6, 2),
            server_default="10.00",
            nullable=False,
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_user_settings_user_id"),
        sa.CheckConstraint(
            "strix_default_scan_mode IN ('quick', 'standard', 'deep')",
            name="chk_user_settings_scan_mode",
        ),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
