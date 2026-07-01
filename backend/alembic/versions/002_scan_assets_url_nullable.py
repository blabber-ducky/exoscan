"""Make scan_assets.url nullable; fix dns_records default to array

Passive recon creates assets with only hostname set (no url yet — the probe
stage fills url in after confirming the host is live). The original schema
had url NOT NULL which prevents those inserts.

Also corrects dns_records server_default from '{}' (object) to '[]' (array)
to match what the dns and ip_profiling modules actually write.

Revision ID: 002
Revises: 001
Create Date: 2026-07-02
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy import text

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("scan_assets", "url", nullable=True)
    op.execute(
        "ALTER TABLE scan_assets ALTER COLUMN dns_records SET DEFAULT '[]'::jsonb"
    )


def downgrade() -> None:
    # Restore NOT NULL requires no existing nulls
    op.execute("UPDATE scan_assets SET url = '' WHERE url IS NULL")
    op.alter_column("scan_assets", "url", nullable=False)
    op.execute(
        "ALTER TABLE scan_assets ALTER COLUMN dns_records SET DEFAULT '{}'::jsonb"
    )
