import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWheelsCollection } from "@/lib/database";
import { callGet, callSpin, createTestWheel, spinBody } from "../helpers/api";
import { startTestDb, stopTestDb } from "../helpers/mongo";

beforeAll(() => startTestDb("luckyspin_concurrency"));
afterAll(() => stopTestDb());

describe("concurrent spins", () => {
  it("20 participants racing for 10 items: exactly 10 winners, no duplicates", async () => {
    // Duplicate labels on purpose: uniqueness must be by item id, not label.
    const labels = ["Gift", "Gift", "Gift", "Cup", "Cup", "Pen", "Hat", "Bag", "Mug", "Car"];
    const code = await createTestWheel(labels);
    const wheelBefore = await callGet(code);
    if (!wheelBefore.body.success) throw new Error();
    const allIds = wheelBefore.body.data.items.map((i) => i.id);

    const responses = await Promise.all(
      Array.from({ length: 20 }, (_, i) => callSpin(code, spinBody(`Player ${i}`))),
    );

    const ok = responses.filter((r) => r.status === 200);
    const rejected = responses.filter((r) => r.status !== 200);
    expect(ok).toHaveLength(10);
    expect(rejected).toHaveLength(10);
    for (const r of rejected) {
      expect(r.status).toBe(409);
      if (!r.body.success) expect(["WHEEL_COMPLETED", "NO_ITEMS_AVAILABLE"]).toContain(r.body.error.code);
    }

    const awarded = ok.map((r) => (r.body.success ? r.body.data.result.itemId : ""));
    expect(new Set(awarded).size).toBe(10);
    expect([...awarded].sort()).toEqual([...allIds].sort());

    const doc = await (await getWheelsCollection()).findOne({ code });
    expect(doc?.status).toBe("COMPLETED");
    expect(doc?.completedAt).toBeInstanceOf(Date);
    expect(doc?.items).toHaveLength(0);
    expect(doc?.participants).toHaveLength(10);
    expect(new Set(doc?.participants.map((p) => p.participantId)).size).toBe(10);
    expect(doc?.results).toHaveLength(10);
    expect(new Set(doc?.results.map((r) => r.itemId)).size).toBe(10);
  });

  it("10 simultaneous requests from one participant: one result only", async () => {
    const code = await createTestWheel(["A", "B", "C", "D", "E"]);
    const participantId = randomUUID();
    const responses = await Promise.all(
      Array.from({ length: 10 }, () => callSpin(code, spinBody("Eve", participantId))),
    );

    const ok = responses.filter((r) => r.status === 200);
    expect(ok).toHaveLength(1);
    for (const r of responses.filter((r) => r.status !== 200)) {
      expect(r.status).toBe(409);
      if (!r.body.success) expect(r.body.error.code).toBe("PARTICIPANT_ALREADY_SPUN");
    }

    const doc = await (await getWheelsCollection()).findOne({ code });
    expect(doc?.participants.filter((p) => p.participantId === participantId)).toHaveLength(1);
    expect(doc?.results).toHaveLength(1);
    expect(doc?.items).toHaveLength(4);
  });

  it("10 simultaneous retries of the same requestId all return the same result", async () => {
    const code = await createTestWheel(["A", "B", "C", "D", "E"]);
    const req = spinBody("Frank");
    const responses = await Promise.all(Array.from({ length: 10 }, () => callSpin(code, req)));

    const ok = responses.filter((r) => r.status === 200);
    // Racers that lost the write reload, find their requestId and get the stored result.
    expect(ok).toHaveLength(10);
    const itemIds = new Set(ok.map((r) => (r.body.success ? r.body.data.result.itemId : "")));
    expect(itemIds.size).toBe(1);

    const doc = await (await getWheelsCollection()).findOne({ code });
    expect(doc?.results).toHaveLength(1);
    expect(doc?.participants).toHaveLength(1);
    expect(doc?.items).toHaveLength(4);
  });

  it("stress: 5 wheels x 30 spinners in parallel never double-award", async () => {
    const codes = await Promise.all(
      Array.from({ length: 5 }, (_, w) => createTestWheel(Array.from({ length: 12 }, (_, i) => `W${w}-${i}`))),
    );
    const responses = await Promise.all(
      codes.flatMap((code) => Array.from({ length: 30 }, (_, i) => callSpin(code, spinBody(`S${i}`)).then((r) => ({ code, r })))),
    );
    for (const code of codes) {
      const mine = responses.filter((x) => x.code === code && x.r.status === 200);
      expect(mine).toHaveLength(12);
      const doc = await (await getWheelsCollection()).findOne({ code });
      expect(doc?.status).toBe("COMPLETED");
      expect(new Set(doc?.results.map((r) => r.itemId)).size).toBe(12);
    }
  });
});
