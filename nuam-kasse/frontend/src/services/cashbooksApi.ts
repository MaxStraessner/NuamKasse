import { apiRequest } from "./apiClient";
import type {
  Cashbook,
  CashbookMemberCandidate,
  CashbookMembership,
} from "../types/cashbook";

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
