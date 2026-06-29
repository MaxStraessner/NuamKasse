import { apiRequest } from "./apiClient";
import type { Expense, ExpenseCreate, ExpenseFilters, ExpenseMutationResponse, ExpenseVoid } from "../types/expense";

function buildExpenseQuery(filters: ExpenseFilters = {}): string {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function createExpense(payload: ExpenseCreate): Promise<ExpenseMutationResponse> {
  return apiRequest<ExpenseMutationResponse>("/expenses", {
    method: "POST",
    body: payload,
  });
}

export function getCurrentExpenses(filters: ExpenseFilters = {}): Promise<Expense[]> {
  return apiRequest<Expense[]>(`/expenses/current${buildExpenseQuery(filters)}`);
}

export function getExpense(expenseId: number): Promise<Expense> {
  return apiRequest<Expense>(`/expenses/${expenseId}`);
}

export function voidExpense(expenseId: number, payload: ExpenseVoid = {}): Promise<ExpenseMutationResponse> {
  return apiRequest<ExpenseMutationResponse>(`/expenses/${expenseId}/void`, {
    method: "POST",
    body: payload,
  });
}
