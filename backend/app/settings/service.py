import base64
import hashlib
import uuid
from datetime import datetime, timezone

from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.settings.models import UserSettings
from app.settings.schemas import UserSettingsRequest, UserSettingsResponse


def _fernet() -> Fernet:
    raw = app_settings.secret_key.encode()
    key = base64.urlsafe_b64encode(hashlib.sha256(raw).digest())
    return Fernet(key)


def encrypt_key(value: str) -> str:
    return _fernet().encrypt(value.encode()).decode()


def decrypt_key(blob: str) -> str:
    return _fernet().decrypt(blob.encode()).decode()


def _mask(value: str) -> str:
    if len(value) <= 8:
        return "****"
    return value[:4] + "..." + "****"


async def get_or_create(db: AsyncSession, user_id: uuid.UUID) -> UserSettings:
    result = await db.execute(
        select(UserSettings).where(UserSettings.user_id == user_id)
    )
    row = result.scalar_one_or_none()
    if row is None:
        row = UserSettings(user_id=user_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


async def upsert(
    db: AsyncSession, user_id: uuid.UUID, req: UserSettingsRequest
) -> UserSettings:
    row = await get_or_create(db, user_id)

    if req.llm_provider is not None:
        row.llm_provider = req.llm_provider
    if req.llm_model is not None:
        row.llm_model = req.llm_model
    if req.llm_api_key is not None:
        row.llm_api_key_encrypted = encrypt_key(req.llm_api_key) if req.llm_api_key else None
    if req.perplexity_api_key is not None:
        row.perplexity_api_key_encrypted = encrypt_key(req.perplexity_api_key) if req.perplexity_api_key else None
    if req.strix_telemetry is not None:
        row.strix_telemetry = req.strix_telemetry
    if req.strix_default_scan_mode is not None:
        row.strix_default_scan_mode = req.strix_default_scan_mode
    if req.strix_default_max_budget_usd is not None:
        row.strix_default_max_budget_usd = req.strix_default_max_budget_usd  # type: ignore[assignment]
    if req.ollama_base_url is not None:
        row.ollama_base_url = req.ollama_base_url or None

    row.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row


def to_response(row: UserSettings) -> UserSettingsResponse:
    has_llm = bool(row.llm_api_key_encrypted)
    has_perp = bool(row.perplexity_api_key_encrypted)
    return UserSettingsResponse(
        llm_provider=row.llm_provider,
        llm_model=row.llm_model,
        llm_api_key_set=has_llm,
        llm_api_key_masked=_mask(decrypt_key(row.llm_api_key_encrypted)) if has_llm else None,
        perplexity_api_key_set=has_perp,
        perplexity_api_key_masked=_mask(decrypt_key(row.perplexity_api_key_encrypted)) if has_perp else None,
        strix_telemetry=row.strix_telemetry,
        strix_default_scan_mode=row.strix_default_scan_mode,
        strix_default_max_budget_usd=float(row.strix_default_max_budget_usd),
        ollama_base_url=row.ollama_base_url,
        updated_at=row.updated_at,
    )
