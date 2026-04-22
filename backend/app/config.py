from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Webull API
    webull_app_key: str = ""
    webull_app_secret: str = ""

    # Database
    database_url: str = "postgresql://ziptrader:localdev@localhost:5432/ziptrader"

    # Security
    secret_key: str = "change-me-in-production"

    # App
    environment: str = "development"
    allowed_origins: str = "http://localhost:5173,http://localhost:8000"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
