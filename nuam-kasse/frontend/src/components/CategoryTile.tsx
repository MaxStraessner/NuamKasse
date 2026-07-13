import { isCategoryColorKey } from "../types/category";
import { CategoryVisual } from "./CategoryVisual";
import { CategoryTypeBadge } from "./CategoryTypeBadge";
import type { CategoryType } from "../types/category";

type CategoryTileProps = {
  category: {
    name: string;
    icon_key: string;
    color_key: string;
    image_url?: string | null;
    category_type?: CategoryType;
  };
  size?: "regular" | "compact";
  isDisabled?: boolean;
  showLabel?: boolean;
  onSelect?: () => void;
};

export function CategoryTile({
  category,
  size = "regular",
  isDisabled = false,
  showLabel = true,
  onSelect,
}: CategoryTileProps) {
  const colorKey = isCategoryColorKey(category.color_key) ? category.color_key : "gray";
  const className = `category-tile category-tile--${size}${showLabel ? "" : " category-tile--icon-only"}${isDisabled ? " category-tile--disabled" : ""}`;
  const content = (
    <>
      <CategoryVisual icon={category.icon_key} imageUrl={category.image_url} name={category.name} />
      {showLabel ? <strong>{category.name}</strong> : null}
      {showLabel && category.category_type ? <CategoryTypeBadge compact type={category.category_type} /> : null}
    </>
  );

  if (onSelect) {
    return (
      <button
        aria-label={`Kategorie ${category.name}`}
        className={className}
        data-category-color={colorKey}
        data-has-custom-image={category.image_url ? "true" : "false"}
        disabled={isDisabled}
        onClick={onSelect}
        type="button"
      >
        {content}
      </button>
    );
  }

  return (
    <div
      aria-label={`Kategorie ${category.name}`}
      className={className}
      data-category-color={colorKey}
      data-has-custom-image={category.image_url ? "true" : "false"}
      role="group"
    >
      {content}
    </div>
  );
}
