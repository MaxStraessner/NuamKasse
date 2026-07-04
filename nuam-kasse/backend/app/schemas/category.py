from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, computed_field


class CategoryCatalogItem(BaseModel):
    key: str
    label: str


class CategoryCatalogResponse(BaseModel):
    icons: list[CategoryCatalogItem]
    colors: list[CategoryCatalogItem]


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    icon_key: str = Field(min_length=1, max_length=40)
    color_key: str = Field(min_length=1, max_length=30)
    parent_category_id: int | None = None
    sort_order: int | None = Field(default=None, ge=1)


class CategoryUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=50)
    icon_key: str | None = Field(default=None, min_length=1, max_length=40)
    color_key: str | None = Field(default=None, min_length=1, max_length=30)
    parent_category_id: int | None = None
    is_active: bool | None = None


class CategoryRead(BaseModel):
    id: int
    user_id: int | None
    name: str
    icon_key: str
    color_key: str
    parent_category_id: int | None
    sort_order: int
    is_active: bool
    archived_at: datetime | None
    image_updated_at: datetime | None
    created_at: datetime
    updated_at: datetime

    @computed_field
    @property
    def has_custom_image(self) -> bool:
        return bool(getattr(self, "image_preview_path", None) and self.image_updated_at)

    @computed_field
    @property
    def image_url(self) -> str | None:
        if not self.has_custom_image:
            return None
        version = self.image_updated_at.isoformat()
        return f"/api/v1/categories/{self.id}/image?v={version}"

    image_preview_path: str | None = Field(default=None, exclude=True)

    model_config = ConfigDict(from_attributes=True)


class CategoryReorderRequest(BaseModel):
    category_ids: list[int] = Field(min_length=0)
    parent_category_id: int | None = None
