import { apiRequest } from "./apiClient";
import type { HealthCheck } from "../types/health";

export function fetchHealth(): Promise<HealthCheck> {
  return apiRequest<HealthCheck>("/health");
}
