import "server-only";
import { AppError } from "@/lib/errors";
import type { ApiResponse } from "@/types/wheel";

const NO_STORE = { "Cache-Control": "no-store" };

export function ok<T>(data: T, status = 200): Response {
  return Response.json({ success: true, data } satisfies ApiResponse<T>, {
    status,
    headers: NO_STORE,
  });
}

/** Maps any thrown value to a safe JSON error. Details are only logged server-side. */
export function fail(error: unknown, extraHeaders?: Record<string, string>): Response {
  if (error instanceof AppError) {
    return Response.json(
      { success: false, error: { code: error.code, message: error.message } } satisfies ApiResponse<never>,
      { status: error.status, headers: { ...NO_STORE, ...extraHeaders } },
    );
  }
  console.error("[luckyspin] unexpected error", error);
  return Response.json(
    {
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Please try again." },
    } satisfies ApiResponse<never>,
    { status: 500, headers: NO_STORE },
  );
}

/** Parse a JSON body; malformed JSON becomes a 400 instead of a 500. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new AppError("INVALID_REQUEST", "Request body must be valid JSON.", 400);
  }
}
