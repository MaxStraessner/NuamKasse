import { apiRequest } from "./apiClient";
import type {
  CashPeriod,
  CashPeriodCreate,
  CashPeriodStatus,
  CashPeriodSummary,
  CashPeriodUpdate,
} from "../types/cashPeriod";

export function getCurrentCashPeriod(): Promise<CashPeriod> {
  return apiRequest<CashPeriod>("/cash-periods/current");
}

export function getCurrentCashPeriodSummary(): Promise<CashPeriodSummary> {
  return apiRequest<CashPeriodSummary>("/cash-periods/current/summary");
}

export function listCashPeriods(status?: CashPeriodStatus): Promise<CashPeriod[]> {
  const query = status ? `?status=${status}` : "";
  return apiRequest<CashPeriod[]>(`/cash-periods${query}`);
}

export function createCashPeriod(payload: CashPeriodCreate): Promise<CashPeriod> {
  return apiRequest<CashPeriod>("/cash-periods", {
    method: "POST",
    body: payload,
  });
}

export function updateCashPeriod(cashPeriodId: number, payload: CashPeriodUpdate): Promise<CashPeriod> {
  return apiRequest<CashPeriod>(`/cash-periods/${cashPeriodId}`, {
    method: "PATCH",
    body: payload,
  });
}

export function closeCashPeriod(cashPeriodId: number, endDate?: string): Promise<CashPeriod> {
  return apiRequest<CashPeriod>(`/cash-periods/${cashPeriodId}/close`, {
    method: "POST",
    body: { end_date: endDate || null },
  });
}
