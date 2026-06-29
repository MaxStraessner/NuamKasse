import { apiRequest } from "./apiClient";
import type {
  Category,
  CategoryCatalog,
  CategoryCreate,
  CategoryUpdate,
} from "../types/category";

export function getCategories(includeInactive = false): Promise<Category[]> {
  const query = includeInactive ? "?include_inactive=true" : "";
  return apiRequest<Category[]>(`/categories${query}`);
}

export function getCategoryCatalog(): Promise<CategoryCatalog> {
  return apiRequest<CategoryCatalog>("/categories/catalog");
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

export function reorderCategories(categoryIds: number[]): Promise<Category[]> {
  return apiRequest<Category[]>("/categories/reorder", {
    method: "PUT",
    body: { category_ids: categoryIds },
  });
}
