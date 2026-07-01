"""Initial schema

Revision ID: 001
Revises:
Create Date: 2026-07-01
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy import text
from sqlalchemy.dialects import postgresql

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("email", sa.String(255), nullable=False),
        sa.Column("username", sa.String(100), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email"),
        sa.UniqueConstraint("username"),
    )

    op.create_table(
        "scans",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("target", sa.String(255), nullable=False),
        sa.Column("scan_type", sa.String(20), nullable=False),
        sa.Column(
            "modules",
            postgresql.JSONB(),
            server_default=text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "port_config",
            postgresql.JSONB(),
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            server_default=text("'pending'"),
            nullable=False,
        ),
        sa.Column(
            "container_ids",
            postgresql.JSONB(),
            server_default=text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "dork_hits",
            postgresql.JSONB(),
            server_default=text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "scan_type IN ('passive', 'active', 'comprehensive')",
            name="chk_scan_type",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'running', 'completed', 'failed', 'cancelled')",
            name="chk_scan_status",
        ),
    )
    op.execute(
        "CREATE INDEX idx_scans_user_id_created_at ON scans (user_id, created_at DESC)"
    )

    op.create_table(
        "scan_assets",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("url", sa.String(512), nullable=False),
        sa.Column("ip_address", postgresql.INET(), nullable=True),
        sa.Column("hostname", sa.String(255), nullable=True),
        sa.Column("status_code", sa.SmallInteger(), nullable=True),
        sa.Column("title", sa.String(512), nullable=True),
        sa.Column("screenshot_path", sa.String(512), nullable=True),
        sa.Column(
            "technologies",
            postgresql.JSONB(),
            server_default=text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "headers",
            postgresql.JSONB(),
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "dns_records",
            postgresql.JSONB(),
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("waf_detected", sa.String(100), nullable=True),
        sa.Column(
            "scan_status",
            sa.String(20),
            server_default=text("'live'"),
            nullable=False,
        ),
        sa.Column("scan_notes", sa.Text(), nullable=True),
        sa.Column(
            "open_ports",
            postgresql.JSONB(),
            server_default=text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "scan_status IN ('live', 'unreachable', 'timeout', 'filtered')",
            name="chk_asset_scan_status",
        ),
    )
    op.create_index("idx_scan_assets_scan_id", "scan_assets", ["scan_id"])

    op.create_table(
        "scan_cves",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("cve_id", sa.String(20), nullable=False),
        sa.Column("technology", sa.String(100), nullable=False),
        sa.Column("version", sa.String(100), nullable=True),
        sa.Column("cvss_score", sa.Numeric(4, 1), nullable=True),
        sa.Column("cvss_version", sa.String(10), nullable=True),
        sa.Column("severity", sa.String(10), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("nvd_url", sa.String(512), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["scan_assets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "cve_id", name="uq_asset_cve"),
        sa.CheckConstraint(
            "severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')",
            name="chk_cve_severity",
        ),
    )
    op.create_index("idx_scan_cves_asset_id", "scan_cves", ["asset_id"])

    op.create_table(
        "scan_logs",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "level",
            sa.String(10),
            server_default=text("'INFO'"),
            nullable=False,
        ),
        sa.Column("stage", sa.String(30), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["scan_id"], ["scans.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "level IN ('DEBUG', 'INFO', 'WARN', 'ERROR')",
            name="chk_log_level",
        ),
    )
    op.execute(
        "CREATE INDEX idx_scan_logs_scan_id_ts ON scan_logs (scan_id, timestamp ASC)"
    )

    op.create_table(
        "cve_cache",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("cache_key", sa.String(200), nullable=False),
        sa.Column("cves", postgresql.JSONB(), nullable=False),
        sa.Column(
            "fetched_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("cache_key"),
    )

    op.create_table(
        "suggested_scans",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            server_default=text("gen_random_uuid()"),
            nullable=False,
        ),
        sa.Column("asset_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("scan_type", sa.String(50), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("risk_level", sa.String(10), nullable=False),
        sa.Column(
            "priority",
            sa.SmallInteger(),
            server_default=text("0"),
            nullable=False,
        ),
        sa.Column(
            "params",
            postgresql.JSONB(),
            server_default=text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "status",
            sa.String(20),
            server_default=text("'suggested'"),
            nullable=False,
        ),
        sa.Column("triggered_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("triggered_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("completed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.TIMESTAMP(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["asset_id"], ["scan_assets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["triggered_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "risk_level IN ('LOW', 'MEDIUM', 'HIGH')",
            name="chk_suggested_risk",
        ),
        sa.CheckConstraint(
            "status IN ('suggested', 'running', 'completed', 'failed')",
            name="chk_suggested_status",
        ),
    )
    op.create_index("idx_suggested_scans_asset_id", "suggested_scans", ["asset_id"])


def downgrade() -> None:
    op.drop_table("suggested_scans")
    op.drop_table("cve_cache")
    op.drop_table("scan_logs")
    op.drop_table("scan_cves")
    op.drop_table("scan_assets")
    op.drop_table("scans")
    op.drop_table("users")
