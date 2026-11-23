import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { RATE_LIMITS } from "@/lib/rate-limit";
import { callCreate } from "../helpers/api";
import { startTestDb, stopTestDb } from "../helpers/mongo";

beforeAll(async () => {
  await startTestDb("luckyspin_ratelimit");
  delete process.env.RATE_LIMIT_DISABLED;
});
afterAll(() => stopTestDb());

describe("rate limiting", () => {
  it("returns 429 after the create limit is exceeded for one IP, other IPs unaffected", async () => {
    const body = { name: "RL", items: ["A", "B"] };
    const ip = { "x-forwarded-for": "203.0.113.7, 10.0.0.1" };
    const statuses = [];
    for (let i = 0; i < RATE_LIMITS.create.limit + 2; i++) {
      statuses.push((await callCreate(body, ip)).status);
    }
    expect(statuses.slice(0, RATE_LIMITS.create.limit).every((s) => s === 201)).toBe(true);
    const last = await callCreate(body, ip);
    expect(last.status).toBe(429);
    if (!last.body.success) expect(last.body.error.code).toBe("RATE_LIMITED");

    expect((await callCreate(body, { "x-forwarded-for": "198.51.100.1" })).status).toBe(201);
  });
});
