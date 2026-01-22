from pydantic_settings import BaseSettings
from typing import Literal
from functools import lru_cache


class Settings(BaseSettings):
    # Reddit API
    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "CopilotStudioMonitor/1.0"

    # LLM Provider
    llm_provider: Literal["ollama", "azure"] = "ollama"
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2"

    # Azure OpenAI
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-4o"

    # Database
    database_url: str = "sqlite:///./data/reddit_monitor.db"

    # Scheduler
    scrape_interval_hours: int = 1

    # Target subreddits
    target_subreddits: str = "MicrosoftCopilot,PowerPlatform,mspowerplatform"

    # Search queries
    search_queries: str = "copilot studio,power virtual agents"

    @property
    def subreddit_list(self) -> list[str]:
        return [s.strip() for s in self.target_subreddits.split(",")]

    @property
    def query_list(self) -> list[str]:
        return [q.strip() for q in self.search_queries.split(",")]

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
