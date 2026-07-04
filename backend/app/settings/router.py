import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.models import User
from app.dependencies import get_current_user, get_db
from app.settings import service
from app.settings.schemas import (
    LLM_PROVIDERS,
    TestConnectionResponse,
    UserSettingsRequest,
    UserSettingsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("", response_model=UserSettingsResponse)
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await service.get_or_create(db, current_user.id)
    return service.to_response(row)


@router.put("", response_model=UserSettingsResponse)
async def update_settings(
    body: UserSettingsRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await service.upsert(db, current_user.id, body)
    return service.to_response(row)


@router.post("/test-connection", response_model=TestConnectionResponse)
async def test_connection(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = await service.get_or_create(db, current_user.id)
    is_ollama = row.llm_provider == "ollama"

    if not is_ollama and not row.llm_api_key_encrypted:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No LLM API key configured — save your settings first",
        )
    try:
        model = f"{row.llm_provider}/{row.llm_model}"

        import litellm
        litellm.set_verbose = False

        kwargs: dict = {
            "model": model,
            "messages": [{"role": "user", "content": "ping"}],
            "max_tokens": 1,
        }
        if row.llm_api_key_encrypted:
            kwargs["api_key"] = service.decrypt_key(row.llm_api_key_encrypted)
        if is_ollama:
            kwargs["api_base"] = row.ollama_base_url or "http://host.docker.internal:11434"

        response = await litellm.acompletion(**kwargs)
        _ = response  # response consumed; just checking no exception
        return TestConnectionResponse(ok=True)
    except Exception as exc:
        logger.warning("LLM connection test failed for user %s: %s", current_user.id, exc)
        return TestConnectionResponse(ok=False, error=str(exc)[:300])
