import type { CategoryType } from "../types/category";

type CategoryTypeBadgeProps = {
  type: CategoryType;
  compact?: boolean;
  dotOnly?: boolean;
};

export function categoryTypeLabel(type: CategoryType): "Ausgabe" | "Einnahme" {
  return type === "income" ? "Einnahme" : "Ausgabe";
}

export function CategoryTypeBadge({ type, compact = false, dotOnly = false }: CategoryTypeBadgeProps) {
  const label = categoryTypeLabel(type);
  return (
    <span
      aria-label={`Kategorieart: ${label}`}
      className={`category-type-badge category-type-badge--${type}${compact ? " category-type-badge--compact" : ""}${dotOnly ? " category-type-badge--dot-only" : ""}`}
    >
      <i aria-hidden="true" />
      {dotOnly ? null : <span>{label}</span>}
    </span>
  );
}
