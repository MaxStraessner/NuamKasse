import { apiRequest } from "./apiClient";
import type {
  Cashbook,
  CashbookCreate,
  CashbookListItem,
  CashbookMemberCandidate,
  CashbookMembership,
} from "../types/cashbook";
import type { CashPeriod, CashPeriodCloseResult } from "../types/cashPeriod";

export function listCashbooks(): Promise<CashbookListItem[]> {
  return apiRequest<CashbookListItem[]>("/cashbooks");
}

export function createCashbook(payload: CashbookCreate): Promise<Cashbook> {
  return apiRequest<Cashbook>("/cashbooks", { method: "POST", body: payload });
}

export function closeCashbook(
  cashbookId: number,
  endDate: string,
): Promise<CashPeriodCloseResult> {
  return apiRequest<CashPeriodCloseResult>(`/cashbooks/${cashbookId}/close`, {
    method: "POST",
    body: { end_date: endDate },
  });
}

export function reopenCashbook(
  cashbookId: number,
  startDate?: string,
): Promise<CashPeriod> {
  return apiRequest<CashPeriod>(`/cashbooks/${cashbookId}/reopen`, {
    method: "POST",
    body: startDate ? { start_date: startDate } : {},
  });
}

export function getCurrentCashbook(): Promise<Cashbook> {
  return apiRequest<Cashbook>("/cashbooks/current");
}

export function listCashbookMembers(): Promise<CashbookMembership[]> {
  return apiRequest<CashbookMembership[]>("/cashbooks/current/members");
}

export function listCashbookMemberCandidates(): Promise<CashbookMemberCandidate[]> {
  return apiRequest<CashbookMemberCandidate[]>("/cashbooks/current/member-candidates");
}

export function addCashbookMember(userId: number): Promise<CashbookMembership> {
  return apiRequest<CashbookMembership>("/cashbooks/current/members", {
    method: "POST",
    body: { user_id: userId },
  });
}

export function removeCashbookMember(userId: number): Promise<void> {
  return apiRequest<void>(`/cashbooks/current/members/${userId}`, { method: "DELETE" });
}
