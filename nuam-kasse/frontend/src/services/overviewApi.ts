import { apiRequest } from "./apiClient";
import type {
  CashPeriodOverview,
  OverviewExpenseFilters,
  PaginatedOverviewExpenses,
} from "../types/overview";

function toQuery(filters: OverviewExpenseFilters = {}) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  });
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function getCurrentOverview(): Promise<CashPeriodOverview> {
  return apiRequest<CashPeriodOverview>("/overview/current");
}

export function getCashPeriodOverview(cashPeriodId: number): Promise<CashPeriodOverview> {
  return apiRequest<CashPeriodOverview>(`/overview/cash-periods/${cashPeriodId}`);
}

export function getCashPeriodExpenses(
  cashPeriodId: number,
  filters: OverviewExpenseFilters = {},
): Promise<PaginatedOverviewExpenses> {
  return apiRequest<PaginatedOverviewExpenses>(
    `/overview/cash-periods/${cashPeriodId}/expenses${toQuery(filters)}`,
  );
}
