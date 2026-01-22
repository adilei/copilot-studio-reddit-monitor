import httpx
import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import Post, Analysis
from app.models.post import PostStatus

logger = logging.getLogger(__name__)

ANALYSIS_PROMPT = """Analyze this Reddit post about Microsoft Copilot Studio:

Title: {title}
Content: {body}

Classify the sentiment based on the user's EMOTIONAL TONE toward Copilot Studio as a product:

- NEGATIVE: User expresses frustration, anger, disappointment, or complains about bugs/broken features. They feel the product let them down.
- NEUTRAL: User asks a question, seeks help, or discusses features without strong emotion. Struggling to understand something is NOT negative if they're not blaming the product.
- POSITIVE: User praises the product, shares success, or expresses satisfaction.

A polite help request or "how do I do X?" question is NEUTRAL, not negative.

Provide a JSON response:
{{
    "summary": "A 2-3 sentence summary",
    "sentiment": "positive" | "neutral" | "negative",
    "sentiment_score": <-1.0 to 1.0>,
    "key_issues": ["list", "of", "issues"] or null
}}

Respond ONLY with the JSON object."""


class LLMAnalyzer:
    def __init__(self):
        self.settings = get_settings()

    async def analyze_post(self, db: Session, post: Post) -> Analysis | None:
        """Analyze a post using the configured LLM provider."""
        try:
            prompt = ANALYSIS_PROMPT.format(
                title=post.title,
                body=post.body or "(no body text)",
            )

            if self.settings.llm_provider == "ollama":
                result = await self._analyze_with_ollama(prompt)
                model_used = f"ollama/{self.settings.ollama_model}"
            else:
                result = await self._analyze_with_azure(prompt)
                model_used = f"azure/{self.settings.azure_openai_deployment}"

            if result is None:
                return None

            # Create analysis record
            analysis = Analysis(
                post_id=post.id,
                summary=result["summary"],
                sentiment=result["sentiment"],
                sentiment_score=result.get("sentiment_score"),
                key_issues=result.get("key_issues"),
                analyzed_at=datetime.utcnow(),
                model_used=model_used,
            )

            db.add(analysis)
            # Don't downgrade from "handled" to "analyzed"
            if post.status != PostStatus.HANDLED.value:
                post.status = PostStatus.ANALYZED.value
            db.commit()
            db.refresh(analysis)

            logger.info(f"Analyzed post {post.id}: {result['sentiment']}")
            return analysis

        except Exception as e:
            logger.error(f"Error analyzing post {post.id}: {str(e)}")
            db.rollback()
            return None

    async def _analyze_with_ollama(self, prompt: str) -> dict | None:
        """Send analysis request to Ollama."""
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.settings.ollama_base_url}/api/generate",
                    json={
                        "model": self.settings.ollama_model,
                        "prompt": prompt,
                        "stream": False,
                        "format": "json",
                    },
                )
                response.raise_for_status()

                data = response.json()
                result_text = data.get("response", "")

                return self._parse_llm_response(result_text)

        except httpx.HTTPError as e:
            logger.error(f"Ollama HTTP error: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Ollama error: {str(e)}")
            return None

    async def _analyze_with_azure(self, prompt: str) -> dict | None:
        """Send analysis request to Azure OpenAI."""
        try:
            from openai import AsyncAzureOpenAI

            client = AsyncAzureOpenAI(
                azure_endpoint=self.settings.azure_openai_endpoint,
                api_key=self.settings.azure_openai_key,
                api_version="2024-02-01",
            )

            response = await client.chat.completions.create(
                model=self.settings.azure_openai_deployment,
                messages=[
                    {
                        "role": "system",
                        "content": "You are a sentiment analysis assistant. Respond only with valid JSON.",
                    },
                    {"role": "user", "content": prompt},
                ],
                temperature=0.3,
                response_format={"type": "json_object"},
            )

            result_text = response.choices[0].message.content
            return self._parse_llm_response(result_text)

        except Exception as e:
            logger.error(f"Azure OpenAI error: {str(e)}")
            return None

    def _parse_llm_response(self, text: str) -> dict | None:
        """Parse LLM response JSON."""
        try:
            # Clean up response if needed
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]

            data = json.loads(text.strip())

            # Validate required fields
            if "summary" not in data or "sentiment" not in data:
                logger.error("Missing required fields in LLM response")
                return None

            # Normalize sentiment
            sentiment = data["sentiment"].lower()
            if sentiment not in ["positive", "neutral", "negative"]:
                sentiment = "neutral"

            return {
                "summary": data["summary"],
                "sentiment": sentiment,
                "sentiment_score": data.get("sentiment_score"),
                "key_issues": data.get("key_issues"),
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {str(e)}")
            logger.debug(f"Response text: {text}")
            return None


# Global analyzer instance
analyzer = LLMAnalyzer()
