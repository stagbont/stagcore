from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    database_url: str = "sqlite+aiosqlite:///./stagcore.db"
    database_url_unpooled: str = "sqlite+aiosqlite:///./stagcore.db"
    better_auth_secret: str = "change-me-to-a-random-32-char-secret-minimum-length"
    better_auth_url: str = "http://localhost:3000"
    platform_admin_emails: str = "admin@stagcore.local"
    app_env: str = "development"
    cors_origins: str = "http://localhost:3000"
    openrouter_api_key: str = ""
    openrouter_model: str = "z-ai/glm-5.2:free"
    openrouter_site_url: str = "http://localhost:3000"
    openrouter_app_name: str = "Stagcore"

    @property
    def is_sqlite(self) -> bool:
        return "sqlite" in self.database_url

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def platform_admin_emails_list(self) -> list[str]:
        return [e.strip().lower() for e in self.platform_admin_emails.split(",") if e.strip()]


settings = Settings()
