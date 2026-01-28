import httpx
import json
import logging
from datetime import datetime
from typing import Literal

from sqlalchemy import func

from app.config import get_settings
from app.database import SessionLocal
from app.models import Post, ProductArea, PainTheme, PostThemeMapping, ClusteringRun, Analysis

logger = logging.getLogger(__name__)

BATCH_SIZE = 20  # Posts per batch for LLM analysis

BATCH_CLUSTERING_PROMPT = """Analyze these Reddit posts about Microsoft Copilot Studio. Identify recurring themes based on what users are TRYING TO DO but struggling with or asking about.

Posts:
{posts_text}

Product Areas (use the ID number for classification - choose the area that is the SOURCE of the frustration):
1 = Agent Flows / Power Automate: flow authoring (natural language or drag-and-drop), triggers, actions, input/output variables, calling flows from topics, real-time vs async execution, timeouts, data limits
2 = Generative Answers / Knowledge / RAG: knowledge sources (SharePoint, files, websites, Dataverse, Azure AI Search), RAG retrieval quality, chunking/indexing, citation accuracy, refresh/sync delays, hallucination, grounding
3 = Autonomous Agents / Triggers: event triggers (Dataverse, SharePoint, OneDrive), scheduled agents, running without user prompts, trigger payloads, maker credential auth for autonomous runs
4 = Analytics: session analytics, conversation transcripts, custom analytics via Dataverse, Viva Insights, agent effectiveness reporting, usage metrics, telemetry
5 = Tools / Connectors: prebuilt connectors (1000+), custom connectors via OpenAPI, premium vs standard, connection management, tool groups, connector auth, schema/type issues
6 = MCP: Model Context Protocol servers, MCP resources/tools/prompts, Streamable transport, API key or OAuth auth, dynamic tool discovery
7 = Channels: Teams deployment (persistent sessions, caching), web chat, M365 Copilot channel, SharePoint, Power Pages, Direct Line API, channel-specific auth, channel parity gaps
8 = User Experience: topic authoring canvas, AI-assisted topic creation, system vs custom topics, node types, YAML editor, conversation flow design, test chat
9 = Governance: DLP data policies, data residency, compliance, Microsoft Purview auditing, environment controls, sensitivity labels, RBAC, tenant publishing controls
10 = Lifecycle / Admin: ALM (dev/test/prod), Power Platform solutions, pipelines, CI/CD, source control, managed solutions, environment variables, licensing, billing
11 = Orchestration: generative orchestration, multi-agent patterns, connected/child agents, handoffs, conversation history passing, A2A protocol, agent-to-human handoff
12 = Pro Dev Experience: M365 Copilot APIs, SDKs (.NET, Python, TypeScript), REST API via OpenAPI, API plugins, Agents Toolkit for VS Code, Teams Toolkit, SPFx

IMPORTANT - Assign product_area_id based on the SOURCE OF FRUSTRATION, not keyword mentions:
- Ask: "Which product area is causing this user's problem or confusion?"
- A post mentioning "flows" might actually be a Knowledge/RAG issue if the flow works fine but gets bad data
- A post about "SharePoint" could be a Channels issue if it only fails in Teams but works in test chat
- Focus on WHAT IS BLOCKING THE USER, not which features they mention using

Examples of product area assignment:
- "My flow triggers but gets wrong data from SharePoint" → Product Area 2 (Knowledge/RAG) - knowledge retrieval is the blocker
- "Can't get my agent to work in Teams but test chat is fine" → Product Area 7 (Channels) - Teams channel is the blocker
- "Flow action fails with timeout" → Product Area 1 (Agent Flows) - flow execution is the blocker

THEME NAMING - Focus on what users are trying to accomplish:
- Good: "Connecting SharePoint as a knowledge source" (what they want to do)
- Bad: "SharePoint sync failures" (technical symptom)
- Good: "Understanding why the agent gives wrong answers" (user's goal)
- Bad: "Hallucination issues" (jargon)

For each theme you discover:
- Name it based on what users WANT TO DO (their goal, not the technical problem)
- Describe what users are trying to accomplish and why they're struggling
- Identify which product area is the SOURCE of their frustration
- List which post IDs exhibit this theme

Return a JSON object with this structure:
{{
    "themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID of area causing frustration, or null if unclear>,
            "post_ids": ["1abc123", "2def456"]
        }}
    ]
}}

CRITICAL: The post_ids array MUST contain the exact IDs from the [Post XXX] markers in the input above.
For example, if the input contains "[Post 1qpia0c]", then use "1qpia0c" in post_ids.

Important:
- Group posts where users have the same GOAL (what they want to accomplish)
- Each post should be assigned to exactly ONE theme - its PRIMARY pain point
- If a post mentions multiple issues, identify the MAIN frustration and assign to that theme only
- Include general questions and feature requests as themes
- Every post must map to exactly one theme

Respond ONLY with the JSON object."""

CONSOLIDATION_PROMPT = """These themes were discovered from analyzing multiple batches of Reddit posts about Microsoft Copilot Studio.

Themes from all batches:
{themes_text}

Your task: Merge semantically similar themes into 10-15 final consolidated themes.

Rules:
1. Combine themes where users have the SAME GOAL (e.g., "Connecting SharePoint as knowledge source" and "Setting up SharePoint knowledge base" = same user goal)
2. Keep theme names focused on what users WANT TO DO, not technical symptoms
3. Combine post_ids from all merged themes into one array
4. If themes span multiple product areas, choose the one that is the primary SOURCE of frustration

Return a JSON object with this structure:
{{
    "themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID number or null>,
            "post_ids": ["1abc123", "2def456", "3ghi789"]
        }}
    ]
}}

CRITICAL:
- The post_ids array must contain the ACTUAL post IDs from the input themes (like "1qpia0c"). Merge the post_ids arrays from themes you combine.
- product_area_id should be a number from the input themes, or null.

Respond ONLY with the JSON object."""

INCREMENTAL_ASSIGNMENT_PROMPT = """Given these existing themes and a batch of new posts, assign each post to its PRIMARY theme based on what the user is TRYING TO DO.

Existing Themes:
{themes_text}

New Posts:
{posts_text}

For each post, identify the ONE existing theme that best matches the user's PRIMARY pain point. If a post mentions multiple issues, focus on the MAIN frustration. If a post describes a goal not covered by existing themes, suggest a new theme.

Return a JSON object with this structure:
{{
    "assignments": [
        {{
            "post_id": "the_post_id",
            "theme_id": 1,
            "confidence": 0.8
        }}
    ],
    "new_themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID number or null>,
            "post_ids": ["actual_post_id_1", "actual_post_id_2"]
        }}
    ]
}}

Notes:
- Each post should be assigned to exactly ONE theme (its PRIMARY pain point)
- confidence should be 0.0-1.0
- Only suggest new_themes if the post describes a user goal not covered by existing themes
- Most posts should map to existing themes
- General questions and feature requests are valid themes

Respond ONLY with the JSON object."""


class ClusteringService:
    def __init__(self):
        self.settings = get_settings()

    def _calculate_severity_from_sentiments(self, db, theme_id: int) -> int:
        """Calculate theme severity from the sentiments of posts in the theme.

        Uses a weighted score approach:
        - Negative = +1 (pain)
        - Neutral  =  0 (no signal)
        - Positive = -1 (satisfaction)

        Score = sum(weights) / total_posts → range -1.0 to +1.0

        Severity mapping:
        - 5: score >= 0.5 (mostly negative)
        - 4: score 0.25 to 0.5
        - 3: score 0 to 0.25
        - 2: score -0.25 to 0
        - 1: score < -0.25 (mostly positive)
        """
        # Get post IDs for this theme
        post_ids = [
            m.post_id for m in
            db.query(PostThemeMapping.post_id).filter(PostThemeMapping.theme_id == theme_id).all()
        ]

        if not post_ids:
            return 3  # Default to medium if no posts

        # Get the latest analysis for each post (subquery for max analysis id per post)
        latest_analysis_ids = (
            db.query(func.max(Analysis.id))
            .filter(Analysis.post_id.in_(post_ids))
            .group_by(Analysis.post_id)
            .subquery()
        )

        # Get sentiments from latest analyses
        analyses = (
            db.query(Analysis.sentiment)
            .filter(Analysis.id.in_(latest_analysis_ids))
            .all()
        )

        if not analyses:
            return 3  # Default to medium if no analyses

        # Calculate weighted score
        total = len(analyses)
        score_sum = 0
        for a in analyses:
            sentiment = a.sentiment.lower() if a.sentiment else "neutral"
            if sentiment == "negative":
                score_sum += 1
            elif sentiment == "positive":
                score_sum -= 1
            # neutral adds 0

        weighted_score = score_sum / total  # Range: -1.0 to +1.0

        # Map to severity
        if weighted_score >= 0.5:
            return 5
        elif weighted_score >= 0.25:
            return 4
        elif weighted_score >= 0:
            return 3
        elif weighted_score >= -0.25:
            return 2
        else:
            return 1

    async def run_clustering(self, run_id: int, run_type: Literal["full", "incremental"]):
        """Execute a clustering run."""
        db = SessionLocal()
        try:
            clustering_run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
            if not clustering_run:
                logger.error(f"Clustering run {run_id} not found")
                return

            if run_type == "full":
                await self._run_full_clustering(db, clustering_run)
            else:
                await self._run_incremental_clustering(db, clustering_run)

        except Exception as e:
            logger.error(f"Clustering run {run_id} failed: {str(e)}")
            clustering_run = db.query(ClusteringRun).filter(ClusteringRun.id == run_id).first()
            if clustering_run:
                clustering_run.status = "failed"
                clustering_run.error_message = str(e)
                clustering_run.completed_at = datetime.utcnow()
                db.commit()
        finally:
            db.close()

    async def _run_full_clustering(self, db, clustering_run: ClusteringRun):
        """Full re-clustering: analyze all posts and regenerate themes."""
        logger.info(f"Starting full clustering run {clustering_run.id}")

        # Get all posts
        posts = db.query(Post).order_by(Post.created_utc.desc()).all()
        if not posts:
            clustering_run.status = "completed"
            clustering_run.completed_at = datetime.utcnow()
            db.commit()
            return

        # Deactivate existing themes (soft delete)
        db.query(PainTheme).update({PainTheme.is_active: False})

        # Clear existing mappings
        db.query(PostThemeMapping).delete()
        db.commit()

        # Batch posts and discover themes
        all_discovered_themes = []
        for i in range(0, len(posts), BATCH_SIZE):
            batch = posts[i:i + BATCH_SIZE]
            batch_themes = await self._discover_themes_in_batch(batch)
            if batch_themes:
                all_discovered_themes.extend(batch_themes)
            clustering_run.posts_processed = min(i + BATCH_SIZE, len(posts))
            db.commit()

        # Consolidate themes if we have multiple batches
        if len(all_discovered_themes) > 15:
            final_themes = await self._consolidate_themes(all_discovered_themes)
        else:
            final_themes = all_discovered_themes

        # Get valid product area IDs
        valid_pa_ids = {pa.id for pa in db.query(ProductArea).filter(ProductArea.is_active == True).all()}

        # Create theme records and mappings
        themes_created = 0
        created_theme_ids = []
        for theme_data in final_themes:
            # Get product area ID from LLM response
            product_area_id = theme_data.get("product_area_id")
            # Validate it exists
            if product_area_id and product_area_id not in valid_pa_ids:
                logger.warning(f"Invalid product_area_id {product_area_id}, setting to None")
                product_area_id = None

            # Create theme (severity will be calculated from post sentiments)
            theme = PainTheme(
                name=theme_data["theme_name"],
                description=theme_data.get("description"),
                severity=3,  # Placeholder, will be calculated below
                product_area_id=product_area_id,
                is_active=True,
                clustering_run_id=clustering_run.id,
            )
            db.add(theme)
            db.flush()  # Get the theme ID
            created_theme_ids.append(theme.id)

            # Create post mappings
            for post_id in theme_data.get("post_ids", []):
                # Verify post exists
                if db.query(Post).filter(Post.id == post_id).first():
                    mapping = PostThemeMapping(
                        post_id=post_id,
                        theme_id=theme.id,
                        confidence=1.0,
                    )
                    db.add(mapping)

            themes_created += 1

        db.commit()

        # Calculate severity for each theme based on post sentiments
        for theme_id in created_theme_ids:
            theme = db.query(PainTheme).filter(PainTheme.id == theme_id).first()
            if theme:
                theme.severity = self._calculate_severity_from_sentiments(db, theme_id)

        clustering_run.themes_created = themes_created
        clustering_run.status = "completed"
        clustering_run.completed_at = datetime.utcnow()
        db.commit()

        logger.info(f"Full clustering completed: {len(posts)} posts, {themes_created} themes")

    async def _run_incremental_clustering(self, db, clustering_run: ClusteringRun):
        """Incremental clustering: assign new posts to existing themes."""
        logger.info(f"Starting incremental clustering run {clustering_run.id}")

        # Get existing active themes
        existing_themes = db.query(PainTheme).filter(PainTheme.is_active == True).all()

        if not existing_themes:
            # No existing themes, run full clustering instead
            await self._run_full_clustering(db, clustering_run)
            return

        # Get posts without theme mappings
        mapped_post_ids = db.query(PostThemeMapping.post_id).distinct().subquery()
        unmapped_posts = (
            db.query(Post)
            .filter(~Post.id.in_(mapped_post_ids))
            .order_by(Post.created_utc.desc())
            .all()
        )

        if not unmapped_posts:
            clustering_run.status = "completed"
            clustering_run.completed_at = datetime.utcnow()
            db.commit()
            return

        # Get valid product area IDs for new themes
        valid_pa_ids = {pa.id for pa in db.query(ProductArea).filter(ProductArea.is_active == True).all()}

        themes_created = 0
        themes_updated = 0
        affected_theme_ids = set()  # Track themes that got new posts
        new_theme_ids = []  # Track newly created themes

        # Process in batches
        for i in range(0, len(unmapped_posts), BATCH_SIZE):
            batch = unmapped_posts[i:i + BATCH_SIZE]
            result = await self._assign_posts_to_themes(existing_themes, batch)

            if result:
                # Create mappings for assigned posts (one theme per post)
                for assignment in result.get("assignments", []):
                    post_id = assignment["post_id"]
                    confidence = assignment.get("confidence", 1.0)
                    theme_id = assignment.get("theme_id")

                    if theme_id:
                        mapping = PostThemeMapping(
                            post_id=post_id,
                            theme_id=theme_id,
                            confidence=confidence,
                        )
                        db.add(mapping)
                        themes_updated += 1
                        affected_theme_ids.add(theme_id)

                # Create any new themes
                for new_theme in result.get("new_themes", []):
                    product_area_id = new_theme.get("product_area_id")
                    # Validate it exists
                    if product_area_id and product_area_id not in valid_pa_ids:
                        logger.warning(f"Invalid product_area_id {product_area_id}, setting to None")
                        product_area_id = None

                    theme = PainTheme(
                        name=new_theme["theme_name"],
                        description=new_theme.get("description"),
                        severity=3,  # Placeholder, will be calculated below
                        product_area_id=product_area_id,
                        is_active=True,
                        clustering_run_id=clustering_run.id,
                    )
                    db.add(theme)
                    db.flush()
                    new_theme_ids.append(theme.id)

                    # Add mappings for new theme
                    for post_id in new_theme.get("post_ids", []):
                        if db.query(Post).filter(Post.id == post_id).first():
                            mapping = PostThemeMapping(
                                post_id=post_id,
                                theme_id=theme.id,
                                confidence=1.0,
                            )
                            db.add(mapping)

                    themes_created += 1
                    existing_themes.append(theme)  # Add to list for next batch

            clustering_run.posts_processed = min(i + BATCH_SIZE, len(unmapped_posts))
            db.commit()

        # Recalculate severity for all affected themes (existing + new)
        all_themes_to_update = affected_theme_ids.union(set(new_theme_ids))
        for theme_id in all_themes_to_update:
            theme = db.query(PainTheme).filter(PainTheme.id == theme_id).first()
            if theme:
                theme.severity = self._calculate_severity_from_sentiments(db, theme_id)

        clustering_run.themes_created = themes_created
        clustering_run.themes_updated = themes_updated
        clustering_run.status = "completed"
        clustering_run.completed_at = datetime.utcnow()
        db.commit()

        logger.info(
            f"Incremental clustering completed: {len(unmapped_posts)} posts, "
            f"{themes_created} new themes, {themes_updated} assignments"
        )

    async def _discover_themes_in_batch(self, posts: list[Post]) -> list[dict] | None:
        """Discover themes in a batch of posts."""
        posts_text = "\n\n".join([
            f"[Post {post.id}]\nTitle: {post.title}\nBody: {post.body or '(no body)'}"
            for post in posts
        ])

        prompt = BATCH_CLUSTERING_PROMPT.format(posts_text=posts_text)
        result = await self._call_llm(prompt)

        if result and "themes" in result:
            return result["themes"]
        logger.warning(f"LLM returned unexpected result: {result}")
        return None

    async def _consolidate_themes(self, themes: list[dict]) -> list[dict]:
        """Consolidate discovered themes from multiple batches."""
        themes_text = json.dumps(themes, indent=2)
        prompt = CONSOLIDATION_PROMPT.format(themes_text=themes_text)
        result = await self._call_llm(prompt)

        if result and "themes" in result:
            return result["themes"]
        return themes[:15]  # Fallback: just take first 15

    async def _assign_posts_to_themes(self, themes: list[PainTheme], posts: list[Post]) -> dict | None:
        """Assign posts to existing themes (incremental mode)."""
        themes_text = "\n".join([
            f"[Theme ID: {t.id}] {t.name}: {t.description or 'No description'}"
            for t in themes
        ])

        posts_text = "\n\n".join([
            f"[Post {post.id}]\nTitle: {post.title}\nBody: {post.body or '(no body)'}"
            for post in posts
        ])

        prompt = INCREMENTAL_ASSIGNMENT_PROMPT.format(
            themes_text=themes_text,
            posts_text=posts_text,
        )

        return await self._call_llm(prompt)

    async def _call_llm(self, prompt: str) -> dict | None:
        """Call the configured LLM provider."""
        if self.settings.llm_provider == "ollama":
            return await self._call_ollama(prompt)
        else:
            return await self._call_azure(prompt)

    async def _call_ollama(self, prompt: str) -> dict | None:
        """Send request to Ollama."""
        try:
            async with httpx.AsyncClient(timeout=180.0) as client:
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

    async def _call_azure(self, prompt: str) -> dict | None:
        """Send request to Azure OpenAI."""
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
                        "content": "You are an expert at analyzing product feedback and identifying recurring themes. Respond only with valid JSON.",
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
            text = text.strip()
            if text.startswith("```json"):
                text = text[7:]
            if text.startswith("```"):
                text = text[3:]
            if text.endswith("```"):
                text = text[:-3]

            return json.loads(text.strip())

        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response: {str(e)}")
            logger.debug(f"Response text: {text}")
            return None


# Global clustering service instance
clustering_service = ClusteringService()
