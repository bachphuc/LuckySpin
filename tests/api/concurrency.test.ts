import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWheelsCollection } from "@/lib/database";
import { OWNER_PASSWORD, callGet, callPatch, callRemoveSpin, callSpin, createTestWheel, spinBody } from "../helpers/api";
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

describe("concurrent owner operations", () => {
  async function invariants(code: string, allIds: string[]) {
    const doc = await (await getWheelsCollection()).findOne({ code });
    if (!doc) throw new Error();
    const available = doc.items.map((i) => i.id);
    const awarded = doc.results.map((r) => r.itemId);
    // Every item is in exactly one place: available or awarded, never both, never twice.
    expect(new Set([...available, ...awarded]).size).toBe(available.length + awarded.length);
    expect([...available, ...awarded].sort()).toEqual([...allIds].sort());
    // One active result per participant, and participants match results.
    const resultPids = doc.results.map((r) => r.participantId);
    expect(new Set(resultPids).size).toBe(resultPids.length);
    expect(doc.participants.map((p) => p.participantId).sort()).toEqual([...resultPids].sort());
    // Status consistent with remaining items.
    expect(doc.status).toBe(available.length === 0 ? "COMPLETED" : "ACTIVE");
    expect(doc.completedAt === null).toBe(doc.status === "ACTIVE");
    return doc;
  }

  it("10 concurrent removals of the same result: one succeeds, item restored once", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    const allIds = wheel.body.data.items.map((i) => i.id);
    const req = spinBody("Solo");
    await callSpin(code, req);

    const responses = await Promise.all(Array.from({ length: 10 }, () => callRemoveSpin(code, req.requestId)));
    expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
    expect(responses.filter((r) => r.status === 404)).toHaveLength(9);
    const doc = await invariants(code, allIds);
    expect(doc.items).toHaveLength(3);
  });

  it("spins racing with removals (including the removed participant re-spinning) stay consistent", async () => {
    const code = await createTestWheel(Array.from({ length: 6 }, (_, i) => `Prize ${i}`));
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    const allIds = wheel.body.data.items.map((i) => i.id);

    // 4 people spin first.
    const early = Array.from({ length: 4 }, (_, i) => spinBody(`Early ${i}`));
    for (const r of early) expect((await callSpin(code, r)).status).toBe(200);

    // Then, all at once: owner removes those 4 spins, the same 4 people spin again,
    // and 8 newcomers spin. Only 6 items exist.
    const ops = [
      ...early.map((r) => callRemoveSpin(code, r.requestId).then((res) => ({ kind: "remove", res }))),
      ...early.map((r) =>
        callSpin(code, spinBody(r.participantName, r.participantId)).then((res) => ({ kind: "respin", res })),
      ),
      ...Array.from({ length: 8 }, (_, i) =>
        callSpin(code, spinBody(`New ${i}`)).then((res) => ({ kind: "new", res })),
      ),
    ];
    const results = await Promise.all(ops);
    expect(results.filter((r) => r.kind === "remove").every((r) => r.res.status === 200)).toBe(true);
    for (const r of results) expect([200, 409]).toContain(r.res.status);

    const doc = await invariants(code, allIds);
    // No participant has more than one active result; nobody "early" kept their old requestId.
    for (const r of early) expect(doc.results.some((x) => x.requestId === r.requestId)).toBe(false);
  });

  it("owner edits racing with spins never edit or remove an awarded item", async () => {
    const code = await createTestWheel(Array.from({ length: 10 }, (_, i) => `I${i}`));
    const wheel = await callGet(code);
    if (!wheel.body.success) throw new Error();
    const ids = wheel.body.data.items.map((i) => i.id);

    const ops = await Promise.all([
      ...Array.from({ length: 8 }, (_, i) => callSpin(code, spinBody(`S${i}`))),
      ...ids.slice(0, 5).map((id) => callPatch(code, { ownerPassword: OWNER_PASSWORD, removeItemIds: [id] })),
      ...ids.slice(5).map((id) => callPatch(code, { ownerPassword: OWNER_PASSWORD, updateItems: [{ id, label: "Edited" }] })),
    ]);
    for (const r of ops) expect([200, 409]).toContain(r.status);

    const doc = await (await getWheelsCollection()).findOne({ code });
    if (!doc) throw new Error();
    const awarded = doc.results.map((r) => r.itemId);
    const available = doc.items.map((i) => i.id);
    expect(new Set([...awarded, ...available]).size).toBe(awarded.length + available.length);
    // Removed items were never awarded afterwards, and awarded items were never removed.
    const removeOks = ops.slice(8, 13).map((r, i) => (r.status === 200 ? ids[i] : null)).filter(Boolean);
    for (const id of removeOks) expect(awarded).not.toContain(id);
    // Each awarded result's label matches what was in the wheel when it was won.
    for (const r of doc.results) expect(r.itemLabel === "Edited" || /^I\d$/.test(r.itemLabel)).toBe(true);
    expect(doc.status).toBe(available.length === 0 ? "COMPLETED" : "ACTIVE");
  });
});
