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

export async function getAllCashPeriodExpenses(cashPeriodId: number) {
  const pageSize = 100;
  const items: PaginatedOverviewExpenses["items"] = [];
  let offset = 0;

  while (true) {
    const page = await getCashPeriodExpenses(cashPeriodId, {
      include_voided: false,
      limit: pageSize,
      offset,
      sort: "created_at_asc",
    });
    items.push(...page.items);
    if (!page.has_more || page.items.length === 0) {
      return items;
    }
    offset = page.offset + page.items.length;
  }
}
