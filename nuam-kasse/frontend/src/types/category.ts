export const categoryIconKeys = [
  "utensils",
  "shopping-cart",
  "heart-pulse",
  "pill",
  "zap",
  "landmark",
  "wallet",
  "gift",
  "plane",
  "bike",
  "car",
  "car-taxi-front",
  "hotel",
  "house",
  "cake",
  "baby",
  "shirt",
  "school",
  "fuel",
  "phone",
  "wifi",
  "wrench",
  "paw-print",
  "coffee",
  "bus",
  "train",
  "circle-ellipsis",
] as const;

export const categoryColorKeys = [
  "orange",
  "green",
  "blue",
  "red",
  "purple",
  "pink",
  "teal",
  "yellow",
  "indigo",
  "gray",
] as const;

export type CategoryIconKey = (typeof categoryIconKeys)[number];
export type CategoryColorKey = (typeof categoryColorKeys)[number];

export type Category = {
  id: number;
  name: string;
  icon_key: CategoryIconKey;
  color_key: CategoryColorKey;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryCreate = {
  name: string;
  icon_key: CategoryIconKey;
  color_key: CategoryColorKey;
};

export type CategoryUpdate = Partial<{
  name: string;
  icon_key: CategoryIconKey;
  color_key: CategoryColorKey;
  is_active: boolean;
}>;

export type CategoryCatalogItem = {
  key: string;
  label: string;
};

export type CategoryCatalog = {
  icons: CategoryCatalogItem[];
  colors: CategoryCatalogItem[];
};

export function isCategoryIconKey(value: string): value is CategoryIconKey {
  return categoryIconKeys.includes(value as CategoryIconKey);
}

export function isCategoryColorKey(value: string): value is CategoryColorKey {
  return categoryColorKeys.includes(value as CategoryColorKey);
}
