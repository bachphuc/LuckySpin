import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWheelsCollection } from "@/lib/database";
import { callCreate, callGet, callSpin, createTestWheel, spinBody } from "../helpers/api";
import { startTestDb, stopTestDb } from "../helpers/mongo";

beforeAll(() => startTestDb("luckyspin_api"));
afterAll(() => stopTestDb());

describe("POST /api/wheels", () => {
  it("creates a wheel and returns a share URL", async () => {
    const { status, body } = await callCreate({ name: "  Lucky Draw ", items: ["Apple", "", "Banana", " Apple "] });
    expect(status).toBe(201);
    if (!body.success) throw new Error("expected success");
    expect(body.data.name).toBe("Lucky Draw");
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(body.data.shareUrl).toMatch(new RegExp(`/w/${body.data.code}$`));

    const doc = await (await getWheelsCollection()).findOne({ code: body.data.code });
    expect(doc?.items.map((i) => i.label)).toEqual(["Apple", "Banana", "Apple"]);
    expect(new Set(doc?.items.map((i) => i.id)).size).toBe(3);
    expect(doc?.totalItems).toBe(3);
    expect(doc?.completedAt).toBeNull();
  });

  it("rejects invalid input with 400 INVALID_REQUEST", async () => {
    const cases: unknown[] = [
      { name: "x", items: ["only one"] },
      { name: "", items: ["A", "B"] },
      { name: "x".repeat(81), items: ["A", "B"] },
      { name: "x", items: ["A", "x".repeat(101)] },
      { name: "x", items: Array.from({ length: 101 }, (_, i) => `${i}`) },
      { name: "x" },
      "not json{",
    ];
    for (const c of cases) {
      const { status, body } = await callCreate(c);
      expect(status).toBe(400);
      expect(body.success).toBe(false);
      if (!body.success) expect(body.error.code).toBe("INVALID_REQUEST");
    }
  });
});

describe("GET /api/wheels/[code]", () => {
  it("returns public wheel data without internal fields", async () => {
    const code = await createTestWheel(["A", "B", "C"], "Public");
    const { status, body } = await callGet(code);
    expect(status).toBe(200);
    if (!body.success) throw new Error("expected success");
    expect(body.data).toMatchObject({
      code,
      name: "Public",
      status: "ACTIVE",
      totalItems: 3,
      remainingItems: 3,
      participants: [],
      results: [],
    });
    expect(body.data.items).toHaveLength(3);
    expect(body.data).not.toHaveProperty("_id");
  });

  it("returns 404 for unknown or malformed codes", async () => {
    for (const code of ["ZZZZZZZZZZ", "bad", "../../etc", "$where1234"]) {
      const { status, body } = await callGet(code);
      expect(status).toBe(404);
      if (!body.success) expect(body.error.code).toBe("WHEEL_NOT_FOUND");
    }
  });
});

describe("POST /api/wheels/[code]/spin", () => {
  it("awards an item, removes it and records the participant", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const req = spinBody("Alice");
    const { status, body } = await callSpin(code, req);
    expect(status).toBe(200);
    if (!body.success) throw new Error("expected success");
    expect(["A", "B", "C"]).toContain(body.data.result.itemLabel);
    expect(body.data.result.participantName).toBe("Alice");
    expect(body.data.remainingItems).toBe(2);
    expect(body.data.status).toBe("ACTIVE");

    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error("expected success");
    expect(wheel.body.data.items.map((i) => i.id)).not.toContain(body.data.result.itemId);
    expect(wheel.body.data.participants).toEqual([
      expect.objectContaining({ participantId: req.participantId, name: "Alice" }),
    ]);
    expect(wheel.body.data.results[0]).toMatchObject({ itemId: body.data.result.itemId, participantName: "Alice" });
    expect(wheel.body.data.results[0]).not.toHaveProperty("requestId");
  });

  it("returns 404 for an unknown wheel", async () => {
    const { status } = await callSpin("ZZZZZZZZZZ", spinBody());
    expect(status).toBe(404);
  });

  it("rejects invalid participant names and ids", async () => {
    const code = await createTestWheel(["A", "B"]);
    for (const body of [
      spinBody("   "),
      spinBody("x".repeat(41)),
      { ...spinBody(), participantId: "nope" },
      { ...spinBody(), requestId: undefined },
    ]) {
      const res = await callSpin(code, body);
      expect(res.status).toBe(400);
      if (!res.body.success) expect(res.body.error.code).toBe("INVALID_REQUEST");
    }
  });

  it("ignores any client-supplied winning item", async () => {
    const code = await createTestWheel(["A", "B", "C", "D", "E"]);
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    const wanted = wheel.body.data.items[0].id;
    const results = new Set<string>();
    // Even with itemId in the body, the server picks; over several spins we should see other items.
    for (let i = 0; i < 4; i++) {
      const { body } = await callSpin(code, { ...spinBody(`P${i}`), itemId: wanted, itemLabel: "A" });
      if (body.success) results.add(body.data.result.itemId);
    }
    expect(results.size).toBe(4);
  });

  it("returns 409 PARTICIPANT_ALREADY_SPUN on a second spin", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const participantId = randomUUID();
    expect((await callSpin(code, spinBody("Bob", participantId))).status).toBe(200);
    const second = await callSpin(code, spinBody("Bob", participantId));
    expect(second.status).toBe(409);
    if (!second.body.success) expect(second.body.error.code).toBe("PARTICIPANT_ALREADY_SPUN");
  });

  it("is idempotent for a repeated requestId", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const req = spinBody("Carol");
    const first = await callSpin(code, req);
    const retry = await callSpin(code, req);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    if (!first.body.success || !retry.body.success) throw new Error();
    expect(retry.body.data.result).toEqual(first.body.data.result);
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    expect(wheel.body.data.results).toHaveLength(1);
    expect(wheel.body.data.remainingItems).toBe(2);
  });

  it("rejects a requestId reused by a different participant", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const req = spinBody("Dan");
    await callSpin(code, req);
    const res = await callSpin(code, { ...req, participantId: randomUUID() });
    expect(res.status).toBe(400);
  });

  it("completes the wheel on the last item and then rejects spins", async () => {
    const code = await createTestWheel(["A", "A"]);
    const a = await callSpin(code, spinBody("P1"));
    const b = await callSpin(code, spinBody("P2"));
    if (!a.body.success || !b.body.success) throw new Error();
    expect(a.body.data.status).toBe("ACTIVE");
    expect(b.body.data.status).toBe("COMPLETED");
    expect(b.body.data.remainingItems).toBe(0);
    expect(a.body.data.result.itemId).not.toBe(b.body.data.result.itemId);

    const third = await callSpin(code, spinBody("P3"));
    expect(third.status).toBe(409);
    if (!third.body.success) expect(third.body.error.code).toBe("WHEEL_COMPLETED");

    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    expect(wheel.body.data.status).toBe("COMPLETED");
    expect(wheel.body.data.completedAt).not.toBeNull();
    expect(wheel.body.data.results).toHaveLength(2);
  });

  it("stores names that look like Mongo operators as plain text", async () => {
    const code = await createTestWheel(["$items", "$$ROOT"]);
    const res = await callSpin(code, spinBody("$participants"));
    if (!res.body.success) throw new Error(JSON.stringify(res.body));
    expect(["$items", "$$ROOT"]).toContain(res.body.data.result.itemLabel);
    expect(res.body.data.result.participantName).toBe("$participants");
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    expect(wheel.body.data.participants[0].name).toBe("$participants");
    expect(wheel.body.data.items).toHaveLength(1);
  });
});
