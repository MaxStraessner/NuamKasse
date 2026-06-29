import type { Category } from "../types/category";
import { isCategoryColorKey } from "../types/category";
import { getCategoryIcon } from "./categoryIconMap";

type CategoryTileProps = {
  category: Pick<Category, "name" | "icon_key" | "color_key">;
  size?: "regular" | "compact";
  isDisabled?: boolean;
  onSelect?: () => void;
};

export function CategoryTile({
  category,
  size = "regular",
  isDisabled = false,
  onSelect,
}: CategoryTileProps) {
  const Icon = getCategoryIcon(category.icon_key);
  const colorKey = isCategoryColorKey(category.color_key) ? category.color_key : "gray";
  const className = `category-tile category-tile--${size}${isDisabled ? " category-tile--disabled" : ""}`;
  const content = (
    <>
      <span className="category-tile__icon" aria-hidden="true">
        <Icon strokeWidth={2.35} />
      </span>
      <strong>{category.name}</strong>
    </>
  );

  if (onSelect) {
    return (
      <button
        aria-label={`Kategorie ${category.name}`}
        className={className}
        data-category-color={colorKey}
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
      role="group"
    >
      {content}
    </div>
  );
}
