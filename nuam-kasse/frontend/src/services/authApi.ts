import { apiRequest } from "./apiClient";
import type { User } from "../types/user";

export type LoginInput = {
  username: string;
  password: string;
};

export type ChangePasswordInput = {
  current_password: string;
  new_password: string;
  new_password_confirmation: string;
};

export function login(input: LoginInput): Promise<User> {
  return apiRequest<User>("/auth/login", { method: "POST", body: input });
}

export function logout(): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/logout", { method: "POST" });
}

export function fetchCurrentUser(): Promise<User> {
  return apiRequest<User>("/auth/me");
}

export function changePassword(input: ChangePasswordInput): Promise<{ message: string }> {
  return apiRequest<{ message: string }>("/auth/change-password", {
    method: "POST",
    body: input,
  });
}
