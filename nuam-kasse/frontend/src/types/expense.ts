import type { CashPeriodSummary } from "./cashPeriod";
import type { CategoryColorKey, CategoryIconKey } from "./category";

export type ExpenseCategory = {
  id: number;
  name: string;
  icon_key: CategoryIconKey;
  color_key: CategoryColorKey;
  parent_category_id: number | null;
};

export type ExpenseUser = {
  id: number;
  display_name: string;
};

export type Expense = {
  id: number;
  cash_period_id: number;
  category: ExpenseCategory;
  amount: string;
  currency: "THB";
  created_by: ExpenseUser;
  created_at: string;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: ExpenseUser | null;
  void_reason: string | null;
};

export type ExpenseCreate = {
  category_id: number;
  amount: string;
};

export type ExpenseVoid = {
  reason?: string | null;
};

export type ExpenseMutationResponse = {
  expense: Expense;
  summary: CashPeriodSummary;
};

export type ExpenseFilters = {
  limit?: number;
  offset?: number;
  category_id?: number;
  created_by_user_id?: number;
  include_voided?: boolean;
};
