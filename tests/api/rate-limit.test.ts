import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_FAILURE_LIMITS, RATE_LIMITS } from "@/lib/rate-limit";
import { OWNER_PASSWORD, callCreate, callPatch, createBody } from "../helpers/api";
import { startTestDb, stopTestDb } from "../helpers/mongo";

beforeAll(async () => {
  await startTestDb("luckyspin_ratelimit");
  delete process.env.RATE_LIMIT_DISABLED;
});
afterAll(() => stopTestDb());

describe("rate limiting", () => {
  it("returns 429 after the create limit is exceeded for one IP, other IPs unaffected", async () => {
    const body = createBody(["A", "B"], "RL");
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

describe("owner password brute-force protection", () => {
  it("blocks an IP after repeated wrong passwords, even for the right one; other IPs still work", async () => {
    const created = await callCreate(createBody(["A", "B"], "BF"), { "x-forwarded-for": "192.0.2.50" });
    if (!created.body.success) throw new Error();
    const code = created.body.data.code;
    const attacker = { "x-forwarded-for": "192.0.2.66" };
    for (let i = 0; i < OWNER_FAILURE_LIMITS.perIp.limit; i++) {
      expect((await callPatch(code, { ownerPassword: `guess-${i}-xx`, name: "x" }, attacker)).status).toBe(401);
    }
    expect((await callPatch(code, { ownerPassword: "another guess", name: "x" }, attacker)).status).toBe(429);
    expect((await callPatch(code, { ownerPassword: OWNER_PASSWORD, name: "x" }, attacker)).status).toBe(429);
    expect((await callPatch(code, { ownerPassword: OWNER_PASSWORD, name: "x" }, { "x-forwarded-for": "192.0.2.51" })).status).toBe(200);
  });
});
