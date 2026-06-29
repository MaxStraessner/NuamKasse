import { apiRequest } from "./apiClient";
import type { User, UserCreateInput, UserUpdateInput } from "../types/user";

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
