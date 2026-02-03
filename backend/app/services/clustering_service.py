import asyncio
import httpx
import json
import logging
import os
from datetime import datetime
from typing import Literal

from sqlalchemy import func

from app.config import get_settings
from app.database import SessionLocal
from app.models import Post, ProductArea, PainTheme, PostThemeMapping, ClusteringRun, Analysis

logger = logging.getLogger(__name__)

# Enable debug logging via env var: CLUSTERING_DEBUG=true
CLUSTERING_DEBUG = os.getenv("CLUSTERING_DEBUG", "").lower() in ("true", "1", "yes")

# Delay between LLM requests to avoid rate limiting (default: 10 seconds)
# Set via env var: LLM_REQUEST_DELAY_SECONDS=15
LLM_REQUEST_DELAY = float(os.getenv("LLM_REQUEST_DELAY_SECONDS", "10"))

BATCH_SIZE = 20  # Posts per batch for LLM analysis

BATCH_CLUSTERING_PROMPT = """Analyze these Reddit posts about Microsoft Copilot Studio. Identify recurring themes based on what users are TRYING TO DO but struggling with or asking about.

Posts (each has a unique index number):
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
- List which post INDICES (the numbers 0-{max_index}) exhibit this theme

Return a JSON object with this structure:
{{
    "themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID of area causing frustration, or null if unclear>,
            "post_indices": [0, 3, 7]
        }}
    ]
}}

IMPORTANT: Use "post_indices" with the INDEX NUMBERS (0 to {max_index}), NOT post IDs.

CRITICAL REQUIREMENTS:
- EVERY post index (0 to {max_index}) MUST appear in exactly ONE theme's post_indices array - NO EXCEPTIONS
- If you're unsure which theme a post belongs to, assign it to the theme with the closest match
- Even low-confidence matches MUST be included - do not drop any posts
- If a post truly doesn't fit any theme, create a "General questions and discussions" theme and assign it there
- Group posts where users have the same GOAL (what they want to accomplish)
- If a post mentions multiple issues, identify the MAIN frustration and assign to that theme only
- Include general questions, feature requests, and success stories as valid themes

VERIFICATION: Before responding, count the indices in your response. It MUST equal {post_count}.

Respond ONLY with the JSON object."""

CONSOLIDATION_PROMPT = """These themes were discovered from analyzing multiple batches of Reddit posts about Microsoft Copilot Studio.

Themes from all batches (each has a unique index):
{themes_text}

Your task: Merge semantically similar themes into 10-15 final consolidated themes.

Rules:
1. Combine themes where users have the SAME GOAL (e.g., "Connecting SharePoint as knowledge source" and "Setting up SharePoint knowledge base" = same user goal)
2. Keep theme names focused on what users WANT TO DO, not technical symptoms
3. If themes span multiple product areas, choose the one that is the primary SOURCE of frustration

IMPORTANT: You do NOT need to handle post_ids - just tell me which theme indices to merge together.

Return a JSON object with this structure:
{{
    "themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID number or null>,
            "merged_from": [0, 3, 7]
        }}
    ]
}}

The "merged_from" array should contain the INDICES of the original themes that were merged into this consolidated theme.
For example, if themes at index 0, 3, and 7 are all about the same user goal, merge them into one theme with merged_from: [0, 3, 7].

Every original theme index (0 to {theme_count_minus_one}) MUST appear in exactly ONE consolidated theme's merged_from array.

Respond ONLY with the JSON object."""

INCREMENTAL_ASSIGNMENT_PROMPT = """Given these existing themes and a batch of new posts, assign each post to its PRIMARY theme based on what the user is TRYING TO DO.

Existing Themes:
{themes_text}

New Posts (each has a unique index number):
{posts_text}

For each post, identify the ONE existing theme that best matches the user's PRIMARY pain point. If a post mentions multiple issues, focus on the MAIN frustration. If a post describes a goal not covered by existing themes, suggest a new theme.

Return a JSON object with this structure:
{{
    "assignments": [
        {{
            "post_index": 0,
            "theme_id": 1,
            "confidence": 0.8
        }}
    ],
    "new_themes": [
        {{
            "theme_name": "What users are trying to do",
            "description": "Users want to X but are struggling because Y",
            "product_area_id": <ID number or null>,
            "post_indices": [3, 7]
        }}
    ]
}}

IMPORTANT: Use "post_index" and "post_indices" with INDEX NUMBERS (0 to {max_index}), NOT post IDs.

CRITICAL REQUIREMENTS:
- EVERY post index (0 to {max_index}) MUST appear either in an assignment OR in a new_theme's post_indices - NO EXCEPTIONS
- Even low-confidence matches (0.3+) MUST be included in assignments - do not drop any posts
- If a post truly doesn't fit any existing theme, create a new theme for it
- Each post should be assigned to exactly ONE theme (its PRIMARY pain point)
- confidence should be 0.0-1.0 (use lower confidence for uncertain matches, but still include them)
- General questions and feature requests are valid themes

VERIFICATION: Before responding, count the indices in your response. It MUST equal {post_count}.

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

        # Track all post IDs for later verification
        all_post_ids = {post.id for post in posts}

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

        # Consolidate themes PER PRODUCT AREA (not globally)
        # Themes with null product_area_id will have their posts go to Uncategorized
        MAX_PER_AREA = 5
        MAX_CONSOLIDATION_ROUNDS = 3

        # Group themes by product_area_id
        from collections import defaultdict
        themes_by_area = defaultdict(list)
        uncategorized_post_ids = set()  # Posts from themes with no product area

        for theme in all_discovered_themes:
            pa_id = theme.get("product_area_id")
            if pa_id is None:
                # Themes without product area -> posts go to uncategorized
                uncategorized_post_ids.update(theme.get("post_ids", []))
            else:
                themes_by_area[pa_id].append(theme)

        if CLUSTERING_DEBUG:
            logger.info(f"[CLUSTERING DEBUG] Themes by product area: {[(pa, len(themes)) for pa, themes in themes_by_area.items()]}")
            logger.info(f"[CLUSTERING DEBUG] Posts from null product_area themes: {len(uncategorized_post_ids)}")

        # Consolidate each product area separately
        final_themes = []
        for pa_id, area_themes in themes_by_area.items():
            if len(area_themes) <= MAX_PER_AREA:
                final_themes.extend(area_themes)
            else:
                # Consolidate this product area's themes
                consolidated = area_themes
                rounds = 0
                while len(consolidated) > MAX_PER_AREA and rounds < MAX_CONSOLIDATION_ROUNDS:
                    rounds += 1
                    logger.info(f"[CLUSTERING] Product area {pa_id}: consolidation round {rounds}, {len(consolidated)} -> {MAX_PER_AREA} themes")
                    consolidated = await self._consolidate_themes(consolidated)
                final_themes.extend(consolidated)

        logger.info(f"[CLUSTERING] After per-area consolidation: {len(final_themes)} themes")

        # Get valid product area IDs
        valid_pa_ids = {pa.id for pa in db.query(ProductArea).filter(ProductArea.is_active == True).all()}

        # Track which posts get mapped
        mapped_post_ids = set()

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
            mapped_count = 0
            failed_ids = []
            for post_id in theme_data.get("post_ids", []):
                # Verify post exists
                if post_id in all_post_ids:
                    mapping = PostThemeMapping(
                        post_id=post_id,
                        theme_id=theme.id,
                        confidence=1.0,
                    )
                    db.add(mapping)
                    mapped_post_ids.add(post_id)
                    mapped_count += 1
                else:
                    failed_ids.append(post_id)

            if CLUSTERING_DEBUG:
                if failed_ids:
                    logger.warning(f"[CLUSTERING DEBUG] Theme '{theme_data['theme_name']}': {len(failed_ids)} post IDs not found in DB: {failed_ids}")
                logger.info(f"[CLUSTERING DEBUG] Theme '{theme_data['theme_name']}': {mapped_count} posts mapped successfully")

            themes_created += 1

        db.commit()

        # Create "Uncategorized" theme for:
        # 1. Posts not assigned to any theme
        # 2. Posts from themes with null product_area_id
        unmapped_post_ids = (all_post_ids - mapped_post_ids) | (uncategorized_post_ids & all_post_ids)
        if unmapped_post_ids:
            logger.info(f"[CLUSTERING] Creating 'Uncategorized' theme for {len(unmapped_post_ids)} unmapped posts")

            uncategorized_theme = PainTheme(
                name="Uncategorized posts",
                description="Posts that couldn't be confidently assigned to a specific theme",
                severity=3,
                product_area_id=None,
                is_active=True,
                clustering_run_id=clustering_run.id,
            )
            db.add(uncategorized_theme)
            db.flush()
            created_theme_ids.append(uncategorized_theme.id)

            for post_id in unmapped_post_ids:
                mapping = PostThemeMapping(
                    post_id=post_id,
                    theme_id=uncategorized_theme.id,
                    confidence=0.5,  # Low confidence since not LLM-assigned
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

        # Calculate total mappings created
        total_mappings = db.query(PostThemeMapping).filter(
            PostThemeMapping.theme_id.in_(created_theme_ids)
        ).count()

        logger.info(f"Full clustering completed: {len(posts)} posts, {themes_created} themes, {total_mappings} mappings created")
        if CLUSTERING_DEBUG:
            logger.info(f"[CLUSTERING DEBUG] Post coverage: {total_mappings}/{len(all_post_ids)} posts mapped ({100*total_mappings/len(all_post_ids):.1f}%)")

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

    def _parse_post_reference(self, value, index_to_post_id: dict, post_id_to_index: dict) -> int | None:
        """Parse a post reference from LLM output into a valid index.

        Handles many formats the LLM might return:
        - Integer: 0, 1, 2
        - String integer: "0", "1", "2"
        - With prefix: "Post 0", "[Post 0]", "post 0"
        - Actual post ID: "1abc123" (reverse lookup)
        """
        import re

        # Already an integer
        if isinstance(value, int):
            return value if value in index_to_post_id else None

        if not isinstance(value, str):
            return None

        value = value.strip()

        # Pure digit string: "0", "1"
        if value.isdigit():
            idx = int(value)
            return idx if idx in index_to_post_id else None

        # Extract number from strings like "Post 0", "[Post 0]", "post 1", etc.
        match = re.search(r'\b(\d+)\b', value)
        if match:
            idx = int(match.group(1))
            if idx in index_to_post_id:
                return idx

        # Final fallback: maybe it's an actual post ID
        if value in post_id_to_index:
            return post_id_to_index[value]

        # Try lowercase
        value_lower = value.lower()
        for post_id, idx in post_id_to_index.items():
            if post_id.lower() == value_lower:
                return idx

        return None

    async def _discover_themes_in_batch(self, posts: list[Post]) -> list[dict] | None:
        """Discover themes in a batch of posts.

        Uses indices instead of post IDs to avoid LLM corrupting/hallucinating IDs.
        Maps indices back to real post IDs after LLM response.
        """
        # Build bidirectional mappings
        index_to_post_id = {i: post.id for i, post in enumerate(posts)}
        post_id_to_index = {post.id: i for i, post in enumerate(posts)}

        if CLUSTERING_DEBUG:
            logger.info(f"[CLUSTERING DEBUG] Sending {len(posts)} posts to LLM (indices 0-{len(posts)-1})")

        # Format posts with indices instead of IDs
        posts_text = "\n\n".join([
            f"[Post {i}]\nTitle: {post.title}\nBody: {post.body or '(no body)'}"
            for i, post in enumerate(posts)
        ])

        prompt = BATCH_CLUSTERING_PROMPT.format(
            posts_text=posts_text,
            post_count=len(posts),
            max_index=len(posts) - 1
        )
        result = await self._call_llm(prompt)

        if result and "themes" in result:
            # Map indices back to post IDs
            # Handle both "post_indices" (preferred) and "post_ids" (fallback if LLM ignores prompt)
            themes_with_ids = []
            indices_used = set()

            for theme in result["themes"]:
                post_ids = []
                # Try post_indices first (the field we asked for)
                raw_values = theme.get("post_indices", [])
                # Fallback to post_ids if LLM ignored our field name
                if not raw_values:
                    raw_values = theme.get("post_ids", [])

                for val in raw_values:
                    idx = self._parse_post_reference(val, index_to_post_id, post_id_to_index)
                    if idx is not None:
                        post_ids.append(index_to_post_id[idx])
                        indices_used.add(idx)
                    elif CLUSTERING_DEBUG:
                        logger.warning(f"[CLUSTERING DEBUG] Could not parse '{val}' in theme '{theme.get('theme_name', 'unknown')}'")

                themes_with_ids.append({
                    "theme_name": theme.get("theme_name", ""),
                    "description": theme.get("description", ""),
                    "product_area_id": theme.get("product_area_id"),
                    "post_ids": post_ids,
                })

            # Check for missing indices
            all_indices = set(range(len(posts)))
            missing_indices = all_indices - indices_used

            if CLUSTERING_DEBUG:
                logger.info(f"[CLUSTERING DEBUG] Batch: {len(indices_used)}/{len(posts)} posts assigned to themes")
                if missing_indices:
                    logger.warning(f"[CLUSTERING DEBUG] Missing indices: {sorted(missing_indices)}")
                else:
                    logger.info(f"[CLUSTERING DEBUG] All {len(posts)} posts assigned successfully")

            return themes_with_ids

        logger.warning(f"LLM returned unexpected result: {result}")
        return None

    async def _consolidate_themes(self, themes: list[dict]) -> list[dict]:
        """Consolidate discovered themes from multiple batches.

        Key insight: The LLM handles theme metadata merging only.
        Post IDs are combined programmatically based on the merge mapping.
        """
        # Build index -> post_ids map before sending to LLM
        theme_post_ids = {}
        for i, theme in enumerate(themes):
            theme_post_ids[i] = set(theme.get("post_ids", []))

        total_post_count = len(set().union(*theme_post_ids.values())) if theme_post_ids else 0

        if CLUSTERING_DEBUG:
            logger.info(f"[CLUSTERING DEBUG] Consolidation input: {len(themes)} themes, {total_post_count} unique post IDs")

        # Prepare themes for LLM (with indices, without post_ids to reduce complexity)
        themes_for_llm = []
        for i, theme in enumerate(themes):
            themes_for_llm.append({
                "index": i,
                "theme_name": theme.get("theme_name", ""),
                "description": theme.get("description", ""),
                "product_area_id": theme.get("product_area_id"),
                "post_count": len(theme.get("post_ids", [])),
            })

        themes_text = json.dumps(themes_for_llm, indent=2)
        prompt = CONSOLIDATION_PROMPT.format(
            themes_text=themes_text,
            theme_count_minus_one=len(themes) - 1
        )
        result = await self._call_llm(prompt)

        if result and "themes" in result:
            # Log raw LLM response for debugging
            if CLUSTERING_DEBUG:
                logger.info(f"[CLUSTERING DEBUG] Consolidation LLM returned {len(result['themes'])} themes")
                # Log first theme to see structure
                if result['themes']:
                    first_theme = result['themes'][0]
                    logger.info(f"[CLUSTERING DEBUG] First theme keys: {list(first_theme.keys())}")
                    logger.info(f"[CLUSTERING DEBUG] First theme merged_from: {first_theme.get('merged_from', 'NOT FOUND')}")

            # Programmatically combine post_ids based on merged_from mapping
            # Handle variations in field names the LLM might use
            final_themes = []
            indices_used = set()

            for consolidated in result["themes"]:
                # Try different field names the LLM might use
                merged_from = consolidated.get("merged_from", [])
                if not merged_from:
                    merged_from = consolidated.get("source_indices", [])
                if not merged_from:
                    merged_from = consolidated.get("original_indices", [])
                if not merged_from:
                    merged_from = consolidated.get("theme_indices", [])
                if not merged_from:
                    merged_from = consolidated.get("indices", [])

                # Collect all post_ids from merged themes
                combined_post_ids = set()
                for val in merged_from:
                    # Parse the index value robustly
                    idx = None
                    if isinstance(val, int):
                        idx = val
                    elif isinstance(val, str):
                        val = val.strip()
                        if val.isdigit():
                            idx = int(val)
                        else:
                            # Try to extract number from "Theme 0", "[0]", etc.
                            import re
                            match = re.search(r'\b(\d+)\b', val)
                            if match:
                                idx = int(match.group(1))

                    if idx is not None and idx in theme_post_ids:
                        combined_post_ids.update(theme_post_ids[idx])
                        indices_used.add(idx)

                if CLUSTERING_DEBUG and not merged_from:
                    logger.warning(f"[CLUSTERING DEBUG] Theme '{consolidated.get('theme_name', 'unknown')}' has NO merged_from. Keys: {list(consolidated.keys())}")

                final_themes.append({
                    "theme_name": consolidated.get("theme_name", ""),
                    "description": consolidated.get("description", ""),
                    "product_area_id": consolidated.get("product_area_id"),
                    "post_ids": list(combined_post_ids),
                })

                if CLUSTERING_DEBUG:
                    logger.info(f"[CLUSTERING DEBUG] Theme '{consolidated.get('theme_name', '')[:30]}': merged_from={merged_from}, post_count={len(combined_post_ids)}")

            # Handle any themes not included in consolidation (LLM missed them)
            missing_indices = set(range(len(themes))) - indices_used
            if missing_indices:
                logger.warning(f"[CLUSTERING] LLM consolidation missed {len(missing_indices)} theme indices: {sorted(missing_indices)}")
                # Add missing themes as-is
                for idx in missing_indices:
                    final_themes.append(themes[idx])

            if CLUSTERING_DEBUG:
                output_post_ids = set()
                for theme in final_themes:
                    output_post_ids.update(theme.get("post_ids", []))
                logger.info(f"[CLUSTERING DEBUG] Consolidation output: {len(final_themes)} themes, {len(output_post_ids)} unique post IDs")

                # Verify no posts were lost
                input_all = set().union(*theme_post_ids.values()) if theme_post_ids else set()
                if input_all != output_post_ids:
                    missing = input_all - output_post_ids
                    extra = output_post_ids - input_all
                    if missing:
                        logger.warning(f"[CLUSTERING DEBUG] Consolidation LOST {len(missing)} post IDs")
                    if extra:
                        logger.warning(f"[CLUSTERING DEBUG] Consolidation has {len(extra)} extra post IDs (shouldn't happen)")
                else:
                    logger.info(f"[CLUSTERING DEBUG] All {len(output_post_ids)} post IDs preserved through consolidation")

            return final_themes

        # Fallback: just take first 15 themes as-is
        logger.warning("[CLUSTERING] Consolidation failed, using first 15 themes")
        return themes[:15]

    async def _assign_posts_to_themes(self, themes: list[PainTheme], posts: list[Post]) -> dict | None:
        """Assign posts to existing themes (incremental mode).

        Uses indices instead of post IDs to avoid LLM corrupting/hallucinating IDs.
        Maps indices back to real post IDs after LLM response.
        """
        # Build bidirectional mappings
        index_to_post_id = {i: post.id for i, post in enumerate(posts)}
        post_id_to_index = {post.id: i for i, post in enumerate(posts)}

        themes_text = "\n".join([
            f"[Theme ID: {t.id}] {t.name}: {t.description or 'No description'}"
            for t in themes
        ])

        # Format posts with indices instead of IDs
        posts_text = "\n\n".join([
            f"[Post {i}]\nTitle: {post.title}\nBody: {post.body or '(no body)'}"
            for i, post in enumerate(posts)
        ])

        prompt = INCREMENTAL_ASSIGNMENT_PROMPT.format(
            themes_text=themes_text,
            posts_text=posts_text,
            post_count=len(posts),
            max_index=len(posts) - 1,
        )

        result = await self._call_llm(prompt)

        if result:
            # Map indices back to post IDs in assignments
            # Use robust parsing to handle various LLM output formats
            mapped_assignments = []
            for assignment in result.get("assignments", []):
                # Try post_index first, fallback to post_id
                val = assignment.get("post_index")
                if val is None:
                    val = assignment.get("post_id")

                idx = self._parse_post_reference(val, index_to_post_id, post_id_to_index)
                if idx is not None:
                    mapped_assignments.append({
                        "post_id": index_to_post_id[idx],
                        "theme_id": assignment.get("theme_id"),
                        "confidence": assignment.get("confidence", 1.0),
                    })

            # Map indices back to post IDs in new_themes
            mapped_new_themes = []
            for new_theme in result.get("new_themes", []):
                post_ids = []
                raw_values = new_theme.get("post_indices", [])
                if not raw_values:
                    raw_values = new_theme.get("post_ids", [])

                for val in raw_values:
                    idx = self._parse_post_reference(val, index_to_post_id, post_id_to_index)
                    if idx is not None:
                        post_ids.append(index_to_post_id[idx])

                mapped_new_themes.append({
                    "theme_name": new_theme.get("theme_name", ""),
                    "description": new_theme.get("description", ""),
                    "product_area_id": new_theme.get("product_area_id"),
                    "post_ids": post_ids,
                })

            return {
                "assignments": mapped_assignments,
                "new_themes": mapped_new_themes,
            }

        return None

    async def _call_llm(self, prompt: str) -> dict | None:
        """Call the configured LLM provider with rate limiting."""
        # Apply throttling to avoid rate limits
        if LLM_REQUEST_DELAY > 0:
            if CLUSTERING_DEBUG:
                logger.info(f"[CLUSTERING DEBUG] Waiting {LLM_REQUEST_DELAY}s before LLM request...")
            await asyncio.sleep(LLM_REQUEST_DELAY)

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
