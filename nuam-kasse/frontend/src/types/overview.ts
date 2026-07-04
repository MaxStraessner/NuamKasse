import type { CashPeriodStatus } from "./cashPeriod";

export type OverviewCashPeriod = {
  id: number;
  name: string;
  status: CashPeriodStatus;
  start_date: string;
  end_date: string | null;
  currency: "THB";
};

export type OverviewSummary = {
  cash_period: OverviewCashPeriod;
  opening_amount: string;
  spent_amount: string;
  remaining_amount: string;
  expense_count: number;
  active_expense_count: number;
  voided_expense_count: number;
};

export type CategorySummary = {
  category_id: number;
  category_name: string;
  icon_key: string;
  color_key: string;
  has_custom_image?: boolean;
  image_url?: string | null;
  image_updated_at?: string | null;
  expense_count: number;
  total_amount: string;
  percentage_of_spending: string;
};

export type UserSummary = {
  user_id: number;
  display_name: string;
  expense_count: number;
  total_amount: string;
  percentage_of_spending: string;
};

export type OverviewExpenseUser = {
  id: number;
  display_name: string;
};

export type OverviewExpenseCategory = {
  id: number;
  name: string;
  icon_key: string;
  color_key: string;
  parent_category_id: number | null;
  has_custom_image?: boolean;
  image_url?: string | null;
  image_updated_at?: string | null;
};

export type OverviewExpense = {
  id: number;
  cash_period_id: number;
  category: OverviewExpenseCategory;
  amount: string;
  currency: "THB";
  created_by: OverviewExpenseUser;
  created_at: string;
  is_voided: boolean;
  voided_at: string | null;
  voided_by: OverviewExpenseUser | null;
  void_reason: string | null;
};

export type CashPeriodOverview = {
  summary: OverviewSummary;
  categories: CategorySummary[];
  users: UserSummary[];
  recent_expenses: OverviewExpense[];
};

export type OverviewExpenseSort = "created_at_desc" | "created_at_asc" | "amount_desc" | "amount_asc";

export type OverviewExpenseFilters = {
  category_id?: number;
  created_by_user_id?: number;
  date_from?: string;
  date_to?: string;
  include_voided?: boolean;
  limit?: number;
  offset?: number;
  sort?: OverviewExpenseSort;
};

export type PaginatedOverviewExpenses = {
  items: OverviewExpense[];
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
};
