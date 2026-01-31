from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = Field(default="postgresql+psycopg://postgres:postgres@localhost:5432/redopsync", alias="DATABASE_URL")
    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    attachments_dir: str = Field(default="/data/attachments", alias="ATTACHMENTS_DIR")
    secret_key: str = Field(default="change-me", alias="SECRET_KEY")
    cors_origins: str = Field(
        default="http://localhost:3000,http://127.0.0.1:3000",
        alias="CORS_ORIGINS",
    )
    jwt_algorithm: str = Field(default="HS256", alias="JWT_ALGORITHM")
    jwt_expire_hours: int = Field(default=24, alias="JWT_EXPIRE_HOURS")
    admin_password: str = Field(default="admin", alias="ADMIN_PASSWORD")

    @property
    def cors_origins_list(self):
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

settings = Settings()
