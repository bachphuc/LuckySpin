import { randomUUID } from "node:crypto";
import { POST as createRoute } from "@/app/api/wheels/route";
import { GET as getRoute } from "@/app/api/wheels/[code]/route";
import { POST as spinRoute } from "@/app/api/wheels/[code]/spin/route";
import type { ApiResponse, CreateWheelResponse, SpinResponse, WheelResponse } from "@/types/wheel";

const BASE = "http://localhost:3000";

type Ctx<P extends string> = Parameters<typeof getRoute>[1] & { params: Promise<Record<P, string>> };
const ctx = (code: string) => ({ params: Promise.resolve({ code }) }) as Ctx<"code">;

export async function callCreate(body: unknown, headers: Record<string, string> = {}) {
  const res = await createRoute(
    new Request(`${BASE}/api/wheels`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
  );
  return { status: res.status, body: (await res.json()) as ApiResponse<CreateWheelResponse> };
}

export async function callGet(code: string) {
  const res = await getRoute(new Request(`${BASE}/api/wheels/${code}`), ctx(code));
  return { status: res.status, body: (await res.json()) as ApiResponse<WheelResponse> };
}

export async function callSpin(code: string, body: unknown, headers: Record<string, string> = {}) {
  const res = await spinRoute(
    new Request(`${BASE}/api/wheels/${code}/spin`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
    }),
    ctx(code) as never,
  );
  return { status: res.status, body: (await res.json()) as ApiResponse<SpinResponse> };
}

export function spinBody(name = "Alice", participantId = randomUUID(), requestId = randomUUID()) {
  return { participantId, participantName: name, requestId };
}

export async function createTestWheel(items: string[], name = "Test wheel"): Promise<string> {
  const { status, body } = await callCreate({ name, items });
  if (status !== 201 || !body.success) throw new Error(`create failed: ${JSON.stringify(body)}`);
  return body.data.code;
}
