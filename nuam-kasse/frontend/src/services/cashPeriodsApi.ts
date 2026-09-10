import { apiDownload, apiRequest } from "./apiClient";
import type {
  CashPeriod,
  CashPeriodArchiveItem,
  CashPeriodCloseResult,
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

export function listCashPeriods(status?: CashPeriodStatus): Promise<CashPeriodArchiveItem[]> {
  const query = status ? `?status=${status}` : "";
  return apiRequest<CashPeriodArchiveItem[]>(`/cash-periods${query}`);
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

export function closeCashPeriod(cashPeriodId: number, endDate?: string): Promise<CashPeriodCloseResult> {
  return apiRequest<CashPeriodCloseResult>(`/cash-periods/${cashPeriodId}/close`, {
    method: "POST",
    body: { end_date: endDate || null },
  });
}

export function startCashPeriod(payload: { name?: string; start_date?: string } = {}): Promise<CashPeriod> {
  return apiRequest<CashPeriod>("/cash-periods/start", {
    method: "POST",
    body: payload,
  });
}

export function downloadCashPeriodExport(cashPeriodId: number): Promise<Blob> {
  return apiDownload(`/cash-periods/${cashPeriodId}/export.xlsx`);
}
