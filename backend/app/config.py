from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://exoscan:exoscan@postgres:5432/exoscan"
    secret_key: str = "dev-secret-change-in-production"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    nvd_api_key: str = ""
    frontend_url: str = "http://localhost:3000"
    screenshot_base_path: str = "/app/static/screenshots"
    nuclei_templates_path: str = "/nuclei-templates"
    # Explicit Docker volume names (must match the `name:` fields in docker-compose.yml
    # so that ephemeral Kali containers can reference the same volumes by name)
    nuclei_templates_volume: str = "exoscan_nuclei_templates_vol"
    screenshots_volume: str = "exoscan_screenshots_vol"
    docker_network: str = "exoscan_net"


settings = Settings()
