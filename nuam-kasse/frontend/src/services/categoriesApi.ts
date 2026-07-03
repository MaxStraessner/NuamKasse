import { apiRequest } from "./apiClient";
import type {
  Category,
  CategoryCatalog,
  CategoryCreate,
  CategoryUpdate,
} from "../types/category";

export function getCategories(includeInactive = false): Promise<Category[]> {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<unknown>(`/categories${query}`).then((data) => (
    Array.isArray(data) ? data as Category[] : []
  ));
}

export function getCategoryCatalog(): Promise<CategoryCatalog> {
  return apiRequest<unknown>("/categories/catalog").then((data) => {
    if (
      data
      && typeof data === "object"
      && Array.isArray((data as Partial<CategoryCatalog>).icons)
      && Array.isArray((data as Partial<CategoryCatalog>).colors)
    ) {
      return data as CategoryCatalog;
    }
    return { icons: [], colors: [] };
  });
}

export function createCategory(payload: CategoryCreate): Promise<Category> {
  return apiRequest<Category>("/categories", {
    method: "POST",
    body: payload,
  });
}

export function updateCategory(categoryId: number, payload: CategoryUpdate): Promise<Category> {
  return apiRequest<Category>(`/categories/${categoryId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function archiveCategory(categoryId: number): Promise<Category> {
  return apiRequest<Category>(`/categories/${categoryId}/archive`, {
    method: "POST",
  });
}

export function restoreCategory(categoryId: number): Promise<Category> {
  return apiRequest<Category>(`/categories/${categoryId}/restore`, {
    method: "POST",
  });
}

export function deleteCategory(categoryId: number): Promise<void> {
  return apiRequest<void>(`/categories/${categoryId}`, {
    method: "DELETE",
  });
}

export function reorderCategories(categoryIds: number[], parentCategoryId: number | null = null): Promise<Category[]> {
  return apiRequest<Category[]>("/categories/reorder", {
    method: "PUT",
    body: { category_ids: categoryIds, parent_category_id: parentCategoryId },
  });
}
