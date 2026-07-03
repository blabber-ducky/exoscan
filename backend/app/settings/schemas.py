from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator

LLM_PROVIDERS = [
    "openai",
    "anthropic",
    "google",
    "aws_bedrock",
    "azure",
    "openrouter",
    "ollama",
]

LLM_PROVIDER_LABELS = {
    "openai": "OpenAI",
    "anthropic": "Anthropic",
    "google": "Google Vertex AI",
    "aws_bedrock": "AWS Bedrock",
    "azure": "Azure OpenAI",
    "openrouter": "OpenRouter",
    "ollama": "Ollama / Local",
}

LLM_MODEL_PLACEHOLDERS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-6",
    "google": "gemini-1.5-pro",
    "aws_bedrock": "anthropic.claude-3-5-sonnet-20241022-v2:0",
    "azure": "gpt-4o",
    "openrouter": "openai/gpt-4o",
    "ollama": "llama3.1",
}


class UserSettingsRequest(BaseModel):
    llm_provider: str | None = None
    llm_model: str | None = None
    llm_api_key: str | None = None        # plaintext; service encrypts before storing
    perplexity_api_key: str | None = None  # plaintext; service encrypts before storing
    strix_telemetry: bool | None = None
    strix_default_scan_mode: Literal["quick", "standard", "deep"] | None = None
    strix_default_max_budget_usd: float | None = None

    @model_validator(mode="after")
    def _validate(self) -> "UserSettingsRequest":
        if self.llm_provider is not None and self.llm_provider not in LLM_PROVIDERS:
            raise ValueError(f"llm_provider must be one of: {', '.join(LLM_PROVIDERS)}")
        if self.strix_default_max_budget_usd is not None:
            if not (0.01 <= self.strix_default_max_budget_usd <= 100.0):
                raise ValueError("strix_default_max_budget_usd must be between 0.01 and 100.00")
        return self


class UserSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    llm_provider: str
    llm_model: str
    llm_api_key_set: bool        # true if an encrypted key exists; never return plaintext
    llm_api_key_masked: str | None  # e.g. "sk-...****" or None
    perplexity_api_key_set: bool
    perplexity_api_key_masked: str | None
    strix_telemetry: bool
    strix_default_scan_mode: str
    strix_default_max_budget_usd: float
    updated_at: datetime


class TestConnectionResponse(BaseModel):
    ok: bool
    error: str | None = None
