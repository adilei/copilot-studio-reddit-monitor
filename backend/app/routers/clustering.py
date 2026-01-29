from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

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
)
from app.auth import get_current_user

router = APIRouter(
    prefix="/api/clustering",
    tags=["clustering"],
    dependencies=[Depends(get_current_user)],
)


@router.post("/run", response_model=ClusteringRunResponse)
def trigger_clustering_run(
    request: ClusteringRunCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Trigger a new clustering run (full or incremental)."""
    # Check if a clustering run is already in progress
    existing_run = (
        db.query(ClusteringRun)
        .filter(ClusteringRun.status == "running")
        .first()
    )
    if existing_run:
        raise HTTPException(
            status_code=409, detail="A clustering run is already in progress"
        )

    # Create new clustering run record
    clustering_run = ClusteringRun(
        run_type=request.run_type,
        status="running",
    )
    db.add(clustering_run)
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
def recalculate_severity(db: Session = Depends(get_db)):
    """Recalculate severity for all active themes based on post sentiments."""
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


@router.get("/themes", response_model=list[PainThemeResponse])
def list_themes(
    product_area_id: int | None = None,
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List discovered pain themes with post counts."""
    query = db.query(PainTheme)

    if product_area_id is not None:
        query = query.filter(PainTheme.product_area_id == product_area_id)
    if not include_inactive:
        query = query.filter(PainTheme.is_active == True)

    themes = query.order_by(desc(PainTheme.severity), PainTheme.name).all()

    # Get post counts for each theme
    post_counts = dict(
        db.query(PostThemeMapping.theme_id, func.count(PostThemeMapping.id))
        .group_by(PostThemeMapping.theme_id)
        .all()
    )

    # Get product area names
    product_areas = {pa.id: pa.name for pa in db.query(ProductArea).all()}

    result = []
    for theme in themes:
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
                post_count=post_counts.get(theme.id, 0),
                product_area_name=product_areas.get(theme.product_area_id) if theme.product_area_id else None,
            )
        )

    return result


@router.get("/themes/{theme_id}", response_model=ThemeDetailResponse)
def get_theme_detail(theme_id: int, db: Session = Depends(get_db)):
    """Get a specific theme with its associated posts."""
    theme = db.query(PainTheme).filter(PainTheme.id == theme_id).first()
    if not theme:
        raise HTTPException(status_code=404, detail="Theme not found")

    # Get posts for this theme
    post_mappings = (
        db.query(PostThemeMapping, Post)
        .join(Post, PostThemeMapping.post_id == Post.id)
        .filter(PostThemeMapping.theme_id == theme_id)
        .order_by(desc(Post.created_utc))
        .all()
    )

    # Get sentiment from latest analysis for each post
    post_sentiments = {}
    for mapping, post in post_mappings:
        latest_analysis = (
            db.query(Analysis)
            .filter(Analysis.post_id == post.id)
            .order_by(desc(Analysis.analyzed_at))
            .first()
        )
        if latest_analysis:
            post_sentiments[post.id] = latest_analysis.sentiment

    posts = [
        ThemePostSummary(
            id=post.id,
            title=post.title,
            author=post.author,
            created_utc=post.created_utc,
            sentiment=post_sentiments.get(post.id),
            confidence=mapping.confidence,
        )
        for mapping, post in post_mappings
    ]

    # Get product area name
    product_area_name = None
    if theme.product_area_id:
        product_area = db.query(ProductArea).filter(ProductArea.id == theme.product_area_id).first()
        if product_area:
            product_area_name = product_area.name

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
        posts=posts,
    )


@router.put("/themes/{theme_id}", response_model=PainThemeResponse)
def update_theme(
    theme_id: int,
    updates: PainThemeUpdate,
    db: Session = Depends(get_db),
):
    """Update a pain theme (name, description, severity, product area)."""
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
    """Get aggregated heatmap data (product area x theme x post count)."""
    # Get all active product areas
    product_areas = (
        db.query(ProductArea)
        .filter(ProductArea.is_active == True)
        .order_by(ProductArea.display_order, ProductArea.name)
        .all()
    )

    # Get all active themes with their post counts
    themes_with_counts = (
        db.query(
            PainTheme,
            func.count(PostThemeMapping.id).label("post_count")
        )
        .outerjoin(PostThemeMapping, PainTheme.id == PostThemeMapping.theme_id)
        .filter(PainTheme.is_active == True)
        .group_by(PainTheme.id)
        .all()
    )

    # Get product area names map
    pa_names = {pa.id: pa.name for pa in product_areas}

    # Build rows for each product area
    rows = []
    total_themes = 0
    total_posts = 0

    for pa in product_areas:
        # Get themes for this product area
        pa_themes = [
            HeatmapCell(
                theme_id=theme.id,
                theme_name=theme.name,
                severity=theme.severity,
                post_count=count,
                product_area_id=pa.id,
                product_area_name=pa.name,
            )
            for theme, count in themes_with_counts
            if theme.product_area_id == pa.id
        ]

        if pa_themes:  # Only include rows with themes
            row_total = sum(t.post_count for t in pa_themes)
            rows.append(
                HeatmapRow(
                    product_area_id=pa.id,
                    product_area_name=pa.name,
                    themes=sorted(pa_themes, key=lambda x: (-x.severity, -x.post_count)),
                    total_posts=row_total,
                )
            )
            total_themes += len(pa_themes)
            total_posts += row_total

    # Add "Uncategorized" row for themes without product area
    uncategorized_themes = [
        HeatmapCell(
            theme_id=theme.id,
            theme_name=theme.name,
            severity=theme.severity,
            post_count=count,
            product_area_id=None,
            product_area_name="Uncategorized",
        )
        for theme, count in themes_with_counts
        if theme.product_area_id is None
    ]

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
        total_themes += len(uncategorized_themes)
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

    return HeatmapResponse(
        rows=rows,
        total_themes=total_themes,
        total_posts=total_posts,
        last_clustering_run=last_run_response,
    )
