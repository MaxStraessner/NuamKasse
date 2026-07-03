import type { Category } from "../types/category";

export type CategoryNode = Category & {
  children: Category[];
};

export function isRootCategory(category: Pick<Category, "parent_category_id">): boolean {
  return category.parent_category_id === null;
}

export function isSubcategory(category: Pick<Category, "parent_category_id">): boolean {
  return category.parent_category_id !== null;
}

export function buildCategoryTree(categories: Category[]): CategoryNode[] {
  const childrenByParent = new Map<number, Category[]>();
  const roots: Category[] = [];

  categories.forEach((category) => {
    if (category.parent_category_id === null) {
      roots.push(category);
      return;
    }
    const parentId = category.parent_category_id;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(category);
    childrenByParent.set(parentId, children);
  });

  const sortCategories = (items: Category[]) =>
    [...items].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id - b.id);

  return sortCategories(roots).map((root) => ({
    ...root,
    children: sortCategories(childrenByParent.get(root.id) ?? []),
  }));
}

export function getActiveChildren(categories: Category[], parentId: number): Category[] {
  return categories
    .filter((category) => category.parent_category_id === parentId && category.is_active)
    .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name) || a.id - b.id);
}

export function getCategoryPath(categories: Category[], category: Category): string {
  if (isRootCategory(category)) {
    return category.name;
  }
  const parent = categories.find((item) => item.id === category.parent_category_id);
  return parent ? `${parent.name} > ${category.name}` : category.name;
}
