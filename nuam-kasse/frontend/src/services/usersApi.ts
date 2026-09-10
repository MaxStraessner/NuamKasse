import { apiRequest } from "./apiClient";
import type {
  AdminAuditLog,
  CashbookAccessOption,
  User,
  UserCashbookAccessInput,
  UserCreateInput,
  UserUpdateInput,
} from "../types/user";

export function listUsers(): Promise<User[]> {
  return apiRequest<User[]>("/users");
}

export function createUser(input: UserCreateInput): Promise<User> {
  return apiRequest<User>("/users", { method: "POST", body: input });
}

export function updateUser(id: number, input: UserUpdateInput): Promise<User> {
  return apiRequest<User>(`/users/${id}`, { method: "PATCH", body: input });
}

export function resetUserPassword(
  id: number,
  input: { new_password: string; new_password_confirmation: string },
): Promise<{ message: string }> {
  return apiRequest<{ message: string }>(`/users/${id}/reset-password`, {
    method: "POST",
    body: input,
  });
}

export function listCashbookAccessOptions(): Promise<CashbookAccessOption[]> {
  return apiRequest<CashbookAccessOption[]>("/users/access-options");
}

export function updateUserAccess(
  id: number,
  cashbookAccesses: UserCashbookAccessInput[],
): Promise<User> {
  return apiRequest<User>(`/users/${id}/access`, {
    method: "PUT",
    body: { cashbook_accesses: cashbookAccesses },
  });
}

export function listUserAuditLog(id: number): Promise<AdminAuditLog[]> {
  return apiRequest<AdminAuditLog[]>(`/users/audit-log?target_user_id=${id}&limit=50`);
}
