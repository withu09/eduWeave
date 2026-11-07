import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    LLM_PROVIDER: str = "xunfei"
    DASHSCOPE_API_KEY: str = ""
    DASHSCOPE_BASE_URL: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    DASHSCOPE_MODEL: str = "deepseek-v4.1-flash-1017"

    XUNFEI_SPARK_APP_ID: str = os.getenv("XUNFEI_SPARK_APP_ID", "")
    XUNFEI_SPARK_API_KEY: str = os.getenv("XUNFEI_SPARK_API_KEY", "")
    XUNFEI_SPARK_API_SECRET: str = os.getenv("XUNFEI_SPARK_API_SECRET", "")
    XUNFEI_SPARK_BASE_URL: str = os.getenv("XUNFEI_SPARK_BASE_URL", "https://spark-api-open.xf-yun.com/v1")
    XUNFEI_SPARK_MODEL: str = os.getenv("XUNFEI_SPARK_MODEL", "4.0Ultra")
    
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CHROMA_HOST: str = os.getenv("CHROMA_HOST", "localhost")
    CHROMA_PORT: int = int(os.getenv("CHROMA_PORT", "8000"))

settings = Settings()
