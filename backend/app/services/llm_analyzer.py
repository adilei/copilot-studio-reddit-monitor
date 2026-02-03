import httpx
import json
import logging
from datetime import datetime

from sqlalchemy.orm import Session
from app.config import get_settings
from app.models import Post, Analysis, ProductArea

logger = logging.getLogger(__name__)

# Base prompt template - product areas are inserted dynamically
ANALYSIS_PROMPT_TEMPLATE = """Analyze this Reddit post about Microsoft Copilot Studio:

Title: {title}
Content: {body}

Classify the sentiment based on the user's EMOTIONAL TONE toward Copilot Studio as a product:

- NEGATIVE: User expresses frustration, anger, disappointment, or complains about bugs/broken features. They feel the product let them down.
- NEUTRAL: User asks a question, seeks help, or discusses features without strong emotion. Struggling to understand something is NOT negative if they're not blaming the product.
- POSITIVE: User praises the product, shares success, or expresses satisfaction.

Additionally, set is_warning=true if the user exhibits ANY of these escalation signals:
- Being derogatory, hostile, or abusive toward the product/company
- Questioning whether to continue using the product ("should I quit?", "time to give up?")
- Expressing loss of faith/confidence in the product ("lost faith", "lost hope", "don't trust it")
- Seeking alternatives or asking about switching to competitors
- Saying they've "had enough" or are at their breaking point
- Describing the situation as a "cry for help" or expressing desperation
- Citing other frustrated users or community complaints as validation for their concerns
- Deadline pressure combined with product reliability concerns

A polite help request or "how do I do X?" question is NEUTRAL, not negative.
Note: A post can be politely written but still warrant is_warning=true if the user is considering abandoning the product.

Identify which Copilot Studio product area this post is PRIMARILY about (pick the single best match):
{product_areas_list}

Provide a JSON response:
{{
    "summary": "A 2-3 sentence summary",
    "sentiment": "positive" | "neutral" | "negative",
    "sentiment_score": <-1.0 to 1.0>,
    "is_warning": true | false,
    "product_area_id": <product area ID or null if unclear/general>
}}

Respond ONLY with the JSON object."""


class LLMAnalyzer:
    def __init__(self):
        self.settings = get_settings()
        self._product_areas_cache = None
        self._cache_time = None

    def _get_product_areas(self, db: Session) -> list[ProductArea]:
        """Get active product areas from database with caching."""
        from datetime import timedelta

        # Cache for 5 minutes to avoid repeated DB queries
        now = datetime.utcnow()
        if (self._product_areas_cache is not None and
            self._cache_time is not None and
            now - self._cache_time < timedelta(minutes=5)):
            return self._product_areas_cache

        product_areas = (
            db.query(ProductArea)
            .filter(ProductArea.is_active == True)
            .order_by(ProductArea.display_order)
            .all()
        )
        self._product_areas_cache = product_areas
        self._cache_time = now
        return product_areas

    def _build_product_areas_list(self, product_areas: list[ProductArea]) -> str:
        """Build the product areas section of the prompt."""
        lines = []
        for pa in product_areas:
            # Use first part of description (before first period) as short description
            short_desc = pa.description.split('.')[0] if pa.description else pa.name
            lines.append(f"{pa.id} = {pa.name} ({short_desc})")
        return "\n".join(lines)

    def _get_valid_product_area_ids(self, product_areas: list[ProductArea]) -> set[int]:
        """Get set of valid product area IDs."""
        return {pa.id for pa in product_areas}

    async def analyze_post(self, db: Session, post: Post) -> Analysis | None:
        """Analyze a post using the configured LLM provider."""
        try:
            # Get product areas dynamically from database
            product_areas = self._get_product_areas(db)
            product_areas_list = self._build_product_areas_list(product_areas)
            valid_pa_ids = self._get_valid_product_area_ids(product_areas)

            prompt = ANALYSIS_PROMPT_TEMPLATE.format(
                title=post.title,
                body=post.body or "(no body text)",
                product_areas_list=product_areas_list,
            )

            if self.settings.llm_provider == "ollama":
                result = await self._analyze_with_ollama(prompt)
                model_used = f"ollama/{self.settings.ollama_model}"
            else:
                result = await self._analyze_with_azure(prompt)
                model_used = f"azure/{self.settings.azure_openai_deployment}"

            if result is None:
                return None

            # Validate product_area_id against actual database IDs
            product_area_id = result.get("product_area_id")
            if product_area_id is not None and product_area_id not in valid_pa_ids:
                logger.warning(f"Invalid product_area_id {product_area_id} returned by LLM, setting to None")
                product_area_id = None

            # Create analysis record
            analysis = Analysis(
                post_id=post.id,
                summary=result["summary"],
                sentiment=result["sentiment"],
                sentiment_score=result.get("sentiment_score"),
                is_warning=result.get("is_warning", False),
                key_issues=result.get("key_issues"),
                product_area_id=product_area_id,
                analyzed_at=datetime.utcnow(),
                model_used=model_used,
            )

            db.add(analysis)
            db.commit()
            db.refresh(analysis)

            logger.info(f"Analyzed post {post.id}: {result['sentiment']}, product_area={product_area_id}")
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

            if self.settings.azure_openai_auth_type == "managed_identity":
                from azure.identity import DefaultAzureCredential, get_bearer_token_provider

                credential = DefaultAzureCredential()
                token_provider = get_bearer_token_provider(
                    credential, "https://cognitiveservices.azure.com/.default"
                )
                client = AsyncAzureOpenAI(
                    azure_endpoint=self.settings.azure_openai_endpoint,
                    azure_ad_token_provider=token_provider,
                    api_version="2024-02-01",
                )
            else:
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

            # Get product_area_id (validation against DB happens in analyze_post)
            product_area_id = data.get("product_area_id")
            if product_area_id is not None:
                if not isinstance(product_area_id, int):
                    product_area_id = None

            return {
                "summary": data["summary"],
                "sentiment": sentiment,
                "sentiment_score": data.get("sentiment_score"),
                "is_warning": data.get("is_warning", False),
                "key_issues": data.get("key_issues"),
                "product_area_id": product_area_id,
            }

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {str(e)}")
            logger.debug(f"Response text: {text}")
            return None


# Global analyzer instance
analyzer = LLMAnalyzer()
