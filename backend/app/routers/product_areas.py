from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import ProductArea, PainTheme
from app.schemas import (
    ProductAreaCreate,
    ProductAreaUpdate,
    ProductAreaResponse,
)

router = APIRouter(prefix="/api/product-areas", tags=["product-areas"])


@router.get("", response_model=list[ProductAreaResponse])
def list_product_areas(
    include_inactive: bool = False,
    db: Session = Depends(get_db),
):
    """List all product areas."""
    query = db.query(ProductArea)
    if not include_inactive:
        query = query.filter(ProductArea.is_active == True)

    product_areas = query.order_by(ProductArea.display_order, ProductArea.name).all()

    # Get theme counts for each product area
    theme_counts = dict(
        db.query(PainTheme.product_area_id, func.count(PainTheme.id))
        .filter(PainTheme.is_active == True)
        .group_by(PainTheme.product_area_id)
        .all()
    )

    result = []
    for pa in product_areas:
        result.append(
            ProductAreaResponse(
                id=pa.id,
                name=pa.name,
                description=pa.description,
                display_order=pa.display_order,
                is_active=pa.is_active,
                created_at=pa.created_at,
                updated_at=pa.updated_at,
                theme_count=theme_counts.get(pa.id, 0),
            )
        )

    return result


@router.post("", response_model=ProductAreaResponse)
def create_product_area(
    product_area: ProductAreaCreate,
    db: Session = Depends(get_db),
):
    """Create a new product area."""
    # Check for existing name
    existing = (
        db.query(ProductArea)
        .filter(ProductArea.name == product_area.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=400, detail="Product area with this name already exists"
        )

    db_product_area = ProductArea(
        name=product_area.name,
        description=product_area.description,
        display_order=product_area.display_order,
        is_active=product_area.is_active,
    )
    db.add(db_product_area)
    db.commit()
    db.refresh(db_product_area)

    return ProductAreaResponse(
        id=db_product_area.id,
        name=db_product_area.name,
        description=db_product_area.description,
        display_order=db_product_area.display_order,
        is_active=db_product_area.is_active,
        created_at=db_product_area.created_at,
        updated_at=db_product_area.updated_at,
        theme_count=0,
    )


@router.get("/{product_area_id}", response_model=ProductAreaResponse)
def get_product_area(product_area_id: int, db: Session = Depends(get_db)):
    """Get a specific product area."""
    product_area = db.query(ProductArea).filter(ProductArea.id == product_area_id).first()
    if not product_area:
        raise HTTPException(status_code=404, detail="Product area not found")

    theme_count = (
        db.query(func.count(PainTheme.id))
        .filter(PainTheme.product_area_id == product_area_id, PainTheme.is_active == True)
        .scalar()
    )

    return ProductAreaResponse(
        id=product_area.id,
        name=product_area.name,
        description=product_area.description,
        display_order=product_area.display_order,
        is_active=product_area.is_active,
        created_at=product_area.created_at,
        updated_at=product_area.updated_at,
        theme_count=theme_count,
    )


@router.put("/{product_area_id}", response_model=ProductAreaResponse)
def update_product_area(
    product_area_id: int,
    updates: ProductAreaUpdate,
    db: Session = Depends(get_db),
):
    """Update a product area."""
    product_area = db.query(ProductArea).filter(ProductArea.id == product_area_id).first()
    if not product_area:
        raise HTTPException(status_code=404, detail="Product area not found")

    # Check for duplicate name if name is being changed
    if updates.name is not None and updates.name != product_area.name:
        existing = (
            db.query(ProductArea)
            .filter(ProductArea.name == updates.name, ProductArea.id != product_area_id)
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=400, detail="Product area with this name already exists"
            )
        product_area.name = updates.name

    if updates.description is not None:
        product_area.description = updates.description
    if updates.display_order is not None:
        product_area.display_order = updates.display_order
    if updates.is_active is not None:
        product_area.is_active = updates.is_active

    db.commit()
    db.refresh(product_area)

    theme_count = (
        db.query(func.count(PainTheme.id))
        .filter(PainTheme.product_area_id == product_area_id, PainTheme.is_active == True)
        .scalar()
    )

    return ProductAreaResponse(
        id=product_area.id,
        name=product_area.name,
        description=product_area.description,
        display_order=product_area.display_order,
        is_active=product_area.is_active,
        created_at=product_area.created_at,
        updated_at=product_area.updated_at,
        theme_count=theme_count,
    )


@router.delete("/{product_area_id}")
def delete_product_area(product_area_id: int, db: Session = Depends(get_db)):
    """Deactivate a product area (soft delete)."""
    product_area = db.query(ProductArea).filter(ProductArea.id == product_area_id).first()
    if not product_area:
        raise HTTPException(status_code=404, detail="Product area not found")

    product_area.is_active = False
    db.commit()

    return {"message": "Product area deactivated"}


@router.post("/{product_area_id}/activate")
def activate_product_area(product_area_id: int, db: Session = Depends(get_db)):
    """Reactivate a deactivated product area."""
    product_area = db.query(ProductArea).filter(ProductArea.id == product_area_id).first()
    if not product_area:
        raise HTTPException(status_code=404, detail="Product area not found")

    product_area.is_active = True
    db.commit()

    return {"message": "Product area activated"}
