import type {
  ApiErrorCode,
  ApiResponse,
  CreateWheelResponse,
  RemoveSpinResponse,
  SpinResponse,
  WheelResponse,
} from "@/types/wheel";

export class ApiClientError extends Error {
  constructor(
    public readonly code: ApiErrorCode | "NETWORK_ERROR",
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (error) {
    if ((error as Error)?.name === "AbortError") throw error;
    throw new ApiClientError("NETWORK_ERROR", "Network error. Check your connection.", 0);
  }

  let body: ApiResponse<T> | null = null;
  try {
    body = (await res.json()) as ApiResponse<T>;
  } catch {
    // fall through
  }
  if (body?.success) return body.data;
  if (body && !body.success) {
    throw new ApiClientError(body.error.code, body.error.message, res.status);
  }
  throw new ApiClientError("INTERNAL_SERVER_ERROR", "Unexpected server response.", res.status);
}

export function fetchWheel(code: string, signal?: AbortSignal) {
  return request<WheelResponse>(`/api/wheels/${encodeURIComponent(code)}`, { signal });
}

export function createWheel(name: string, items: string[], ownerPassword: string, confirmPassword: string) {
  return request<CreateWheelResponse>("/api/wheels", {
    method: "POST",
    body: JSON.stringify({ name, items, ownerPassword, confirmPassword }),
  });
}

export interface WheelEdit {
  name?: string;
  addItems?: string[];
  updateItems?: { id: string; label: string }[];
  removeItemIds?: string[];
}

/** Owner: password is sent with every management request (no stored session). */
export function updateWheel(code: string, ownerPassword: string, edit: WheelEdit) {
  return request<WheelResponse>(`/api/wheels/${encodeURIComponent(code)}`, {
    method: "PATCH",
    body: JSON.stringify({ ownerPassword, ...edit }),
  });
}

export function removeSpin(code: string, requestId: string, ownerPassword: string) {
  return request<RemoveSpinResponse>(
    `/api/wheels/${encodeURIComponent(code)}/results/${encodeURIComponent(requestId)}`,
    { method: "DELETE", body: JSON.stringify({ ownerPassword }) },
  );
}

/**
 * Spin with the same requestId on network failure, so a dropped response
 * can be retried without risking a second award.
 */
export async function spinWheel(
  code: string,
  body: { participantId: string; participantName: string; requestId: string },
  retries = 2,
): Promise<SpinResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await request<SpinResponse>(`/api/wheels/${encodeURIComponent(code)}/spin`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    } catch (error) {
      const retryable =
        error instanceof ApiClientError &&
        (error.code === "NETWORK_ERROR" || error.code === "SPIN_CONFLICT" || error.status >= 500);
      if (!retryable || attempt >= retries) throw error;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}
