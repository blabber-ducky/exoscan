import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text, TIMESTAMP, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
    )
    llm_provider: Mapped[str] = mapped_column(
        String(50), server_default="openai", nullable=False
    )
    llm_model: Mapped[str] = mapped_column(
        String(100), server_default="gpt-4o", nullable=False
    )
    llm_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    perplexity_api_key_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)
    strix_telemetry: Mapped[bool] = mapped_column(
        Boolean, server_default="false", nullable=False
    )
    strix_default_scan_mode: Mapped[str] = mapped_column(
        String(20), server_default="standard", nullable=False
    )
    strix_default_max_budget_usd: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), server_default="10.00", nullable=False
    )
    ollama_base_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=func.now(), nullable=False
    )
