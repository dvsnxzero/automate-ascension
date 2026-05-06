from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Webull API (live brokerage — read-only by default in this app)
    webull_app_key: str = ""
    webull_app_secret: str = ""

    # Alpaca API (paper trading)
    alpaca_api_key: str = ""
    alpaca_api_secret: str = ""
    alpaca_base_url: str = "https://paper-api.alpaca.markets/v2"
    alpaca_data_url: str = "https://data.alpaca.markets/v2"

    # Virtual equity cap on the paper account.
    # Alpaca paper accounts default to $100k and can't be reset to a custom
    # amount via API. We enforce a soft cap in our app so position sizing
    # matches real available capital. Set to 0 to disable the cap entirely.
    paper_virtual_equity: float = 11300.0
    paper_margin_multiplier: float = 2.0  # 2x for cash equities; options BP = equity

    # Initial deposit on the paper account (used by the settlement tracker
    # to compute settled_cash baseline). Should match the funds you set
    # when you opened the paper account in Alpaca's dashboard.
    paper_starting_cash: float = 11300.0

    # Live trading kill switch — must be explicitly set to "true" to enable
    # real-money order placement via the Webull client. Default OFF.
    enable_live_trading: bool = False

    # Database
    database_url: str = "postgresql://ziptrader:localdev@localhost:5432/ziptrader"

    # Security
    secret_key: str = "change-me-in-production"

    # Market Intelligence APIs
    # Reddit: no key needed — uses public JSON endpoints
    finnhub_api_key: str = ""

    # Seed flags — skip slow/noisy startup scrapes when set to false.
    # Reddit JSON endpoints have been blocking unauthenticated traffic since
    # 2024, and Finnhub fails without an API key. Default OFF — you can flip
    # them on when you actually want the data and have the keys configured.
    seed_news: bool = False
    seed_reddit: bool = False
    seed_balance: bool = True

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
