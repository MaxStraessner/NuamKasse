const fallbackApiBaseUrl = "/api/v1";

export const apiBaseUrl =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, "") || fallbackApiBaseUrl;

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const activeCashbookStorageKey = "nuam-kasse-active-cashbook";

export function getActiveCashbookId(): number | null {
  const value = window.localStorage.getItem(activeCashbookStorageKey);
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function setActiveCashbookId(cashbookId: number): void {
  window.localStorage.setItem(activeCashbookStorageKey, String(cashbookId));
}

function cashbookHeader(): Record<string, string> {
  const cashbookId = getActiveCashbookId();
  return cashbookId ? { "X-Cashbook-ID": String(cashbookId) } : {};
}

type ApiRequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
};

export async function apiRequest<TResponse>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TResponse> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const body = options.body;
  const isFormData = body instanceof FormData;
  const requestBody: BodyInit | undefined = isFormData
    ? body
    : body == null
      ? undefined
      : JSON.stringify(body);
  const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...cashbookHeader(),
      ...(body != null && !isFormData ? { "Content-Type": "application/json" } : {}),
    },
    body: requestBody,
  });

  if (!response.ok) {
    let message = `API request failed with ${response.status}`;
    try {
      const data = (await response.json()) as {
        detail?: string | { message?: string; code?: string };
      };
      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (data.detail?.message) {
        message = data.detail.message;
      }
    } catch {
      // Keep the generic message when the backend returned no JSON body.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return undefined as TResponse;
  }

  return (await response.json()) as TResponse;
}

export async function apiDownload(path: string): Promise<Blob> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const response = await fetch(`${apiBaseUrl}${normalizedPath}`, {
    credentials: "include",
    headers: {
      Accept: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ...cashbookHeader(),
    },
  });
  if (!response.ok) {
    let message = `API request failed with ${response.status}`;
    try {
      const data = (await response.json()) as { detail?: string | { message?: string } };
      message = typeof data.detail === "string" ? data.detail : data.detail?.message || message;
    } catch {
      // Keep the generic message when the backend returned no JSON body.
    }
    throw new ApiError(message, response.status);
  }
  return response.blob();
}
