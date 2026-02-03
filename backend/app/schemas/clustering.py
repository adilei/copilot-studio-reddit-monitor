from pydantic import BaseModel, Field
from datetime import datetime
from typing import Literal


# Product Area schemas
class ProductAreaBase(BaseModel):
    name: str
    description: str | None = None
    display_order: int = 0
    is_active: bool = True


class ProductAreaCreate(ProductAreaBase):
    pass


class ProductAreaUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    display_order: int | None = None
    is_active: bool | None = None


class ProductAreaResponse(ProductAreaBase):
    id: int
    created_at: datetime
    updated_at: datetime
    theme_count: int = 0

    class Config:
        from_attributes = True


# Product Area Tag (computed from posts in a theme)
class ProductAreaTag(BaseModel):
    """Tag showing product area distribution for a theme's posts."""
    id: int
    name: str
    post_count: int  # How many posts in this theme have this product area


# Pain Theme schemas
class PainThemeBase(BaseModel):
    name: str
    description: str | None = None
    severity: int = Field(default=3, ge=1, le=5)
    product_area_id: int | None = None
    is_active: bool = True


class PainThemeCreate(PainThemeBase):
    post_ids: list[str] = []  # For assigning posts during creation


class PainThemeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    severity: int | None = Field(default=None, ge=1, le=5)
    product_area_id: int | None = None
    is_active: bool | None = None


class PainThemeResponse(PainThemeBase):
    id: int
    created_at: datetime
    updated_at: datetime
    post_count: int = 0
    product_area_name: str | None = None
    # Computed from posts in this theme - shows product area distribution
    product_area_tags: list[ProductAreaTag] = []

    class Config:
        from_attributes = True


# Post Theme Mapping schemas
class PostThemeMappingBase(BaseModel):
    post_id: str
    theme_id: int
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)


class PostThemeMappingCreate(PostThemeMappingBase):
    pass


class PostThemeMappingResponse(PostThemeMappingBase):
    id: int
    assigned_at: datetime

    class Config:
        from_attributes = True


# Clustering Run schemas
class ClusteringRunBase(BaseModel):
    run_type: Literal["full", "incremental"] = "incremental"


class ClusteringRunCreate(ClusteringRunBase):
    pass


class ClusteringRunResponse(BaseModel):
    id: int
    started_at: datetime
    completed_at: datetime | None = None
    status: str
    run_type: str
    posts_processed: int
    themes_created: int
    themes_updated: int
    error_message: str | None = None

    class Config:
        from_attributes = True


# Heatmap schemas
class HeatmapCell(BaseModel):
    """Single cell in the heatmap."""
    theme_id: int
    theme_name: str
    severity: int
    post_count: int
    product_area_id: int | None = None
    product_area_name: str | None = None


class HeatmapRow(BaseModel):
    """Row in the heatmap (one product area)."""
    product_area_id: int | None = None
    product_area_name: str
    themes: list[HeatmapCell] = []
    total_posts: int = 0


class HeatmapResponse(BaseModel):
    """Full heatmap data."""
    rows: list[HeatmapRow] = []
    total_themes: int = 0
    total_posts: int = 0
    unclustered_count: int = 0
    last_clustering_run: ClusteringRunResponse | None = None


# Theme with posts response
class ThemePostSummary(BaseModel):
    """Summary of a post for theme detail view."""
    id: str
    title: str
    author: str
    created_utc: datetime
    sentiment: str | None = None
    confidence: float = 1.0
    product_area_id: int | None = None
    product_area_name: str | None = None


class ThemeDetailResponse(PainThemeResponse):
    """Theme with associated posts."""
    posts: list[ThemePostSummary] = []
