import { isCategoryColorKey } from "../types/category";
import { getCategoryIcon } from "./categoryIconMap";

type CategoryTileProps = {
  category: {
    name: string;
    icon_key: string;
    color_key: string;
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
  const Icon = getCategoryIcon(category.icon_key);
  const colorKey = isCategoryColorKey(category.color_key) ? category.color_key : "gray";
  const className = `category-tile category-tile--${size}${showLabel ? "" : " category-tile--icon-only"}${isDisabled ? " category-tile--disabled" : ""}`;
  const content = (
    <>
      <span className="category-tile__icon" aria-hidden="true">
        <Icon strokeWidth={2.35} />
      </span>
      {showLabel ? <strong>{category.name}</strong> : null}
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
