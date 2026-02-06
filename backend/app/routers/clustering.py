from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from collections import defaultdict

from app.database import get_db
from app.models import ProductArea, PainTheme, PostThemeMapping, ClusteringRun, Post, Analysis
from app.schemas import (
    PainThemeResponse,
    PainThemeUpdate,
    ClusteringRunCreate,
    ClusteringRunResponse,
    HeatmapCell,
    HeatmapRow,
    HeatmapResponse,
    ThemePostSummary,
    ThemeDetailResponse,
    ProductAreaTag,
)
from app.auth import require_registered_user, require_contributor_write

router = APIRouter(
    prefix="/api/clustering",
    tags=["clustering"],
    dependencies=[Depends(require_registered_user)],
)


@router.post("/run", response_model=ClusteringRunResponse)
def trigger_clustering_run(
    request: ClusteringRunCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Trigger a new clustering run (full or incremental). Requires contributor access."""
    # Create new clustering run record with "pending" status first
    clustering_run = ClusteringRun(
        run_type=request.run_type,
        status="pending",
    )
    db.add(clustering_run)
    db.commit()
    db.refresh(clustering_run)

    # Now check if any OTHER run is running (atomic check after our insert)
    # This prevents race condition: if two requests create pending runs simultaneously,
    # both will see the other's pending/running status and one will fail
    existing_running = (
        db.query(ClusteringRun)
        .filter(ClusteringRun.status.in_(["running", "pending"]))
        .filter(ClusteringRun.id != clustering_run.id)
        .first()
    )
    if existing_running:
        # Another run exists - delete ours and fail
        db.delete(clustering_run)
        db.commit()
        raise HTTPException(
            status_code=409, detail="A clustering run is already in progress"
        )

    # Safe to proceed - update to running
    clustering_run.status = "running"
    db.commit()
    db.refresh(clustering_run)

    # Schedule the clustering job in background
    from app.services.clustering_service import clustering_service
    background_tasks.add_task(
        clustering_service.run_clustering,
        clustering_run.id,
        request.run_type,
    )

    return ClusteringRunResponse(
        id=clustering_run.id,
        started_at=clustering_run.started_at,
        completed_at=clustering_run.completed_at,
        status=clustering_run.status,
        run_type=clustering_run.run_type,
        posts_processed=clustering_run.posts_processed,
        themes_created=clustering_run.themes_created,
        themes_updated=clustering_run.themes_updated,
        error_message=clustering_run.error_message,
    )


@router.post("/recalculate-severity")
def recalculate_severity(
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Recalculate severity for all active themes based on post sentiments. Requires contributor access."""
    from app.services.clustering_service import clustering_service

    active_themes = db.query(PainTheme).filter(PainTheme.is_active == True).all()

    updated_count = 0
    for theme in active_themes:
        old_severity = theme.severity
        new_severity = clustering_service._calculate_severity_from_sentiments(db, theme.id)
        if old_severity != new_severity:
            theme.severity = new_severity
            updated_count += 1

    db.commit()

    return {
        "message": f"Recalculated severity for {len(active_themes)} themes",
        "updated": updated_count,
    }


@router.get("/status", response_model=ClusteringRunResponse | None)
def get_clustering_status(db: Session = Depends(get_db)):
    """Get the status of the most recent clustering run."""
    latest_run = (
        db.query(ClusteringRun)
        .order_by(desc(ClusteringRun.started_at))
        .first()
    )
    if not latest_run:
        return None

    return ClusteringRunResponse(
        id=latest_run.id,
        started_at=latest_run.started_at,
        completed_at=latest_run.completed_at,
        status=latest_run.status,
        run_type=latest_run.run_type,
        posts_processed=latest_run.posts_processed,
        themes_created=latest_run.themes_created,
        themes_updated=latest_run.themes_updated,
        error_message=latest_run.error_message,
    )


@router.post("/cancel")
def cancel_stuck_run(
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Cancel any stuck 'running' clustering runs. Requires contributor access."""
    from datetime import datetime

    stuck_runs = db.query(ClusteringRun).filter(ClusteringRun.status == "running").all()

    if not stuck_runs:
        return {"message": "No running clustering jobs found", "cancelled": 0}

    for run in stuck_runs:
        run.status = "failed"
        run.error_message = "Manually cancelled - stuck run"
        run.completed_at = datetime.utcnow()

    db.commit()

    return {"message": f"Cancelled {len(stuck_runs)} stuck clustering run(s)", "cancelled": len(stuck_runs)}


@router.get("/themes", response_model=list[PainThemeResponse])
def list_themes(
    product_area_ids: list[int] | None = Query(None, description="Filter themes by product areas of their posts"),
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List discovered pain themes with post counts and product area tags.

    Product area tags are computed from the posts in each theme (not from theme.product_area_id).
    Use product_area_ids to filter themes that have posts in specific product areas.
    """
    query = db.query(PainTheme)

    if not include_inactive:
        query = query.filter(PainTheme.is_active == True)

    themes = query.order_by(desc(PainTheme.severity), PainTheme.name).all()

    # Get product area names
    product_areas = {pa.id: pa.name for pa in db.query(ProductArea).all()}

    # Get all theme-post mappings
    theme_post_ids = defaultdict(list)
    for mapping in db.query(PostThemeMapping).all():
        theme_post_ids[mapping.theme_id].append(mapping.post_id)

    # Get latest analysis for each post to get product_area_id
    # Subquery for max analysis ID per post
    latest_analysis_subq = (
        db.query(Analysis.post_id, func.max(Analysis.id).label("max_id"))
        .group_by(Analysis.post_id)
        .subquery()
    )

    # Get all latest analyses with product_area_id
    latest_analyses = (
        db.query(Analysis.post_id, Analysis.product_area_id)
        .join(latest_analysis_subq, Analysis.id == latest_analysis_subq.c.max_id)
        .all()
    )

    # Map post_id -> product_area_id
    post_product_areas = {a.post_id: a.product_area_id for a in latest_analyses}

    # Compute product area tags for each theme
    theme_pa_tags = {}
    for theme_id, post_ids in theme_post_ids.items():
        pa_counts = defaultdict(int)
        for post_id in post_ids:
            pa_id = post_product_areas.get(post_id)
            if pa_id is not None:
                pa_counts[pa_id] += 1
        theme_pa_tags[theme_id] = pa_counts

    # If filtering by product_area_ids, get themes that have posts in those areas
    filtered_theme_ids = None
    if product_area_ids:
        filtered_theme_ids = set()
        for theme_id, pa_counts in theme_pa_tags.items():
            if any(pa_id in pa_counts for pa_id in product_area_ids):
                filtered_theme_ids.add(theme_id)

    result = []
    for theme in themes:
        # Skip if filtering and this theme doesn't have matching posts
        if filtered_theme_ids is not None and theme.id not in filtered_theme_ids:
            continue

        # Build product area tags for this theme
        pa_counts = theme_pa_tags.get(theme.id, {})
        pa_tags = [
            ProductAreaTag(
                id=pa_id,
                name=product_areas.get(pa_id, "Unknown"),
                post_count=count
            )
            for pa_id, count in sorted(pa_counts.items(), key=lambda x: -x[1])
        ]

        post_count = len(theme_post_ids.get(theme.id, []))

        result.append(
            PainThemeResponse(
                id=theme.id,
                name=theme.name,
                description=theme.description,
                severity=theme.severity,
                product_area_id=theme.product_area_id,
                is_active=theme.is_active,
                created_at=theme.created_at,
                updated_at=theme.updated_at,
                post_count=post_count,
                product_area_name=product_areas.get(theme.product_area_id) if theme.product_area_id else None,
                product_area_tags=pa_tags,
            )
        )

    return result


@router.get("/themes/{theme_id}", response_model=ThemeDetailResponse)
def get_theme_detail(theme_id: int, db: Session = Depends(get_db)):
    """Get a specific theme with its associated posts."""
    theme = db.query(PainTheme).filter(PainTheme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    # Get product area names map
    product_areas = {pa.id: pa.name for pa in db.query(ProductArea).all()}

    # Get posts for this theme
    post_mappings = (
        db.query(PostThemeMapping, Post)
        .join(Post, PostThemeMapping.post_id == Post.id)
        .filter(PostThemeMapping.theme_id == theme_id)
        .order_by(desc(Post.created_utc))
        .all()
    )

    # Get latest analysis for each post (sentiment and product_area_id)
    post_analyses = {}
    for mapping, post in post_mappings:
        latest_analysis = (
            db.query(Analysis)
            .filter(Analysis.post_id == post.id)
            .order_by(desc(Analysis.analyzed_at))
            .first()
        )
        if latest_analysis:
            post_analyses[post.id] = {
                "sentiment": latest_analysis.sentiment,
                "product_area_id": latest_analysis.product_area_id,
            }

    # Compute product area tags for this theme
    pa_counts = defaultdict(int)
    for post_id, analysis_data in post_analyses.items():
        pa_id = analysis_data.get("product_area_id")
        if pa_id is not None:
            pa_counts[pa_id] += 1

    pa_tags = [
        ProductAreaTag(
            id=pa_id,
            name=product_areas.get(pa_id, "Unknown"),
            post_count=count
        )
        for pa_id, count in sorted(pa_counts.items(), key=lambda x: -x[1])
    ]

    posts = [
        ThemePostSummary(
            id=post.id,
            title=post.title,
            author=post.author,
            created_utc=post.created_utc,
            sentiment=post_analyses.get(post.id, {}).get("sentiment"),
            confidence=mapping.confidence,
            product_area_id=post_analyses.get(post.id, {}).get("product_area_id"),
            product_area_name=product_areas.get(
                post_analyses.get(post.id, {}).get("product_area_id")
            ) if post_analyses.get(post.id, {}).get("product_area_id") else None,
        )
        for mapping, post in post_mappings
    ]

    # Get product area name for theme's assigned product area
    product_area_name = None
    if theme.product_area_id:
        product_area_name = product_areas.get(theme.product_area_id)

    return ThemeDetailResponse(
        id=theme.id,
        name=theme.name,
        description=theme.description,
        severity=theme.severity,
        product_area_id=theme.product_area_id,
        is_active=theme.is_active,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
        post_count=len(posts),
        product_area_name=product_area_name,
        product_area_tags=pa_tags,
        posts=posts,
    )


@router.put("/themes/{theme_id}", response_model=PainThemeResponse)
def update_theme(
    theme_id: int,
    updates: PainThemeUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_contributor_write),
):
    """Update a pain theme (name, description, severity, product area). Requires contributor access."""
    theme = db.query(PainTheme).filter(PainTheme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    if updates.name is not None:
        theme.name = updates.name
    if updates.description is not None:
        theme.description = updates.description
    if updates.severity is not None:
        theme.severity = updates.severity
    if updates.product_area_id is not None:
        # Verify product area exists
        if updates.product_area_id != 0:  # 0 means unassign
            product_area = db.query(ProductArea).filter(ProductArea.id == updates.product_area_id).first()
            if not product_area:
                raise HTTPException(status_code=404, detail="Product area not found")
        theme.product_area_id = updates.product_area_id if updates.product_area_id != 0 else None
    if updates.is_active is not None:
        theme.is_active = updates.is_active

    db.commit()
    db.refresh(theme)

    post_count = (
        db.query(func.count(PostThemeMapping.id))
        .filter(PostThemeMapping.theme_id == theme_id)
        .scalar()
    )

    product_area_name = None
    if theme.product_area_id:
        product_area = db.query(ProductArea).filter(ProductArea.id == theme.product_area_id).first()
        if product_area:
            product_area_name = product_area.name

    return PainThemeResponse(
        id=theme.id,
        name=theme.name,
        description=theme.description,
        severity=theme.severity,
        product_area_id=theme.product_area_id,
        is_active=theme.is_active,
        created_at=theme.created_at,
        updated_at=theme.updated_at,
        post_count=post_count,
        product_area_name=product_area_name,
    )


@router.get("/heatmap", response_model=HeatmapResponse)
def get_heatmap(db: Session = Depends(get_db)):
    """Get aggregated heatmap data (product area x theme x post count).

    Product areas are determined by post-level classification (from analysis.product_area_id),
    not by theme.product_area_id. This means a theme can appear in multiple product area rows
    if its posts span different product areas.
    """
    # Get all active product areas
    product_areas = (
        db.query(ProductArea)
        .filter(ProductArea.is_active == True)
        .order_by(ProductArea.display_order, ProductArea.name)
        .all()
    )
    pa_names = {pa.id: pa.name for pa in product_areas}

    # Get all active themes
    active_themes = {
        t.id: t for t in db.query(PainTheme).filter(PainTheme.is_active == True).all()
    }

    # Get all post-theme mappings for active themes
    mappings = (
        db.query(PostThemeMapping)
        .filter(PostThemeMapping.theme_id.in_(active_themes.keys()))
        .all()
    )

    # Get latest analysis for each post to get product_area_id
    latest_analysis_subq = (
        db.query(Analysis.post_id, func.max(Analysis.id).label("max_id"))
        .group_by(Analysis.post_id)
        .subquery()
    )
    latest_analyses = (
        db.query(Analysis.post_id, Analysis.product_area_id)
        .join(latest_analysis_subq, Analysis.id == latest_analysis_subq.c.max_id)
        .all()
    )
    post_product_areas = {a.post_id: a.product_area_id for a in latest_analyses}

    # Group by (product_area_id, theme_id) -> count of posts
    # Structure: {product_area_id: {theme_id: post_count}}
    pa_theme_counts = defaultdict(lambda: defaultdict(int))
    for mapping in mappings:
        pa_id = post_product_areas.get(mapping.post_id)  # Can be None
        pa_theme_counts[pa_id][mapping.theme_id] += 1

    # Build rows for each product area
    rows = []
    total_themes_in_heatmap = 0
    total_posts = 0
    theme_ids_seen = set()

    for pa in product_areas:
        theme_counts = pa_theme_counts.get(pa.id, {})
        if not theme_counts:
            continue

        pa_themes = []
        for theme_id, post_count in theme_counts.items():
            theme = active_themes.get(theme_id)
            if theme:
                pa_themes.append(
                    HeatmapCell(
                        theme_id=theme.id,
                        theme_name=theme.name,
                        severity=theme.severity,
                        post_count=post_count,
                        product_area_id=pa.id,
                        product_area_name=pa.name,
                    )
                )
                theme_ids_seen.add(theme_id)

        if pa_themes:
            row_total = sum(t.post_count for t in pa_themes)
            rows.append(
                HeatmapRow(
                    product_area_id=pa.id,
                    product_area_name=pa.name,
                    themes=sorted(pa_themes, key=lambda x: (-x.severity, -x.post_count)),
                    total_posts=row_total,
                )
            )
            total_themes_in_heatmap += len(pa_themes)
            total_posts += row_total

    # Add "Uncategorized" row for posts without product_area_id
    uncategorized_counts = pa_theme_counts.get(None, {})
    if uncategorized_counts:
        uncategorized_themes = []
        for theme_id, post_count in uncategorized_counts.items():
            theme = active_themes.get(theme_id)
            if theme:
                uncategorized_themes.append(
                    HeatmapCell(
                        theme_id=theme.id,
                        theme_name=theme.name,
                        severity=theme.severity,
                        post_count=post_count,
                        product_area_id=None,
                        product_area_name="Uncategorized",
                    )
                )
                theme_ids_seen.add(theme_id)

        if uncategorized_themes:
            row_total = sum(t.post_count for t in uncategorized_themes)
            rows.append(
                HeatmapRow(
                    product_area_id=None,
                    product_area_name="Uncategorized",
                    themes=sorted(uncategorized_themes, key=lambda x: (-x.severity, -x.post_count)),
                    total_posts=row_total,
                )
            )
            total_themes_in_heatmap += len(uncategorized_themes)
            total_posts += row_total

    # Get latest clustering run
    latest_run = (
        db.query(ClusteringRun)
        .filter(ClusteringRun.status == "completed")
        .order_by(desc(ClusteringRun.completed_at))
        .first()
    )

    last_run_response = None
    if latest_run:
        last_run_response = ClusteringRunResponse(
            id=latest_run.id,
            started_at=latest_run.started_at,
            completed_at=latest_run.completed_at,
            status=latest_run.status,
            run_type=latest_run.run_type,
            posts_processed=latest_run.posts_processed,
            themes_created=latest_run.themes_created,
            themes_updated=latest_run.themes_updated,
            error_message=latest_run.error_message,
        )

    # Calculate unclustered posts count
    total_posts_in_db = db.query(func.count(Post.id)).scalar()
    clustered_post_ids = db.query(PostThemeMapping.post_id).distinct()
    clustered_count = clustered_post_ids.count()
    unclustered_count = total_posts_in_db - clustered_count

    # Total unique themes is the count of distinct themes seen across all rows
    total_unique_themes = len(theme_ids_seen)

    return HeatmapResponse(
        rows=rows,
        total_themes=total_unique_themes,
        total_posts=total_posts,
        unclustered_count=unclustered_count,
        last_clustering_run=last_run_response,
    )
