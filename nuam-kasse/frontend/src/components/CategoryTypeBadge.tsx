import type { CategoryType } from "../types/category";

type CategoryTypeBadgeProps = {
  type: CategoryType;
  compact?: boolean;
};

export function categoryTypeLabel(type: CategoryType): "Ausgabe" | "Einnahme" {
  return type === "income" ? "Einnahme" : "Ausgabe";
}

export function CategoryTypeBadge({ type, compact = false }: CategoryTypeBadgeProps) {
  const label = categoryTypeLabel(type);
  return (
    <span
      aria-label={`Kategorieart: ${label}`}
      className={`category-type-badge category-type-badge--${type}${compact ? " category-type-badge--compact" : ""}`}
    >
      <i aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}
