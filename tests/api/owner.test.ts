import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { getWheelsCollection } from "@/lib/database";
import {
  OWNER_PASSWORD,
  callCreate,
  callGet,
  callPatch,
  callRemoveSpin,
  callSpin,
  createBody,
  createTestWheel,
  spinBody,
} from "../helpers/api";
import { startTestDb, stopTestDb } from "../helpers/mongo";

beforeAll(() => startTestDb("luckyspin_owner"));
afterAll(() => stopTestDb());
afterEach(() => vi.restoreAllMocks());

async function wheelDoc(code: string) {
  const doc = await (await getWheelsCollection()).findOne({ code });
  if (!doc) throw new Error("missing wheel");
  return doc;
}

async function publicWheel(code: string) {
  const res = await callGet(code);
  if (!res.body.success) throw new Error("get failed");
  return res.body.data;
}

describe("owner password on create", () => {
  it("creates a wheel and stores only a bcrypt hash", async () => {
    const code = await createTestWheel(["A", "B"]);
    const doc = await wheelDoc(code);
    expect(doc.ownerPasswordHash).toMatch(/^\$2[aby]\$12\$/);
    expect(JSON.stringify(doc)).not.toContain(OWNER_PASSWORD);
  });

  it("rejects short, too long, missing and mismatched passwords", async () => {
    const cases = [
      { ...createBody(["A", "B"]), ownerPassword: "short", confirmPassword: "short" },
      { ...createBody(["A", "B"]), ownerPassword: "x".repeat(73), confirmPassword: "x".repeat(73) },
      { ...createBody(["A", "B"]), confirmPassword: "something else" },
      { name: "n", items: ["A", "B"] },
    ];
    for (const body of cases) {
      const res = await callCreate(body);
      expect(res.status).toBe(400);
      if (!res.body.success) expect(res.body.error.code).toBe("INVALID_REQUEST");
    }
  });

  it("keeps the password exactly as typed (no trimming)", async () => {
    const pw = "  padded pw  ";
    const res = await callCreate({ ...createBody(["A", "B"]), ownerPassword: pw, confirmPassword: pw });
    if (!res.body.success) throw new Error();
    const code = res.body.data.code;
    expect((await callPatch(code, { ownerPassword: "padded pw", name: "x" })).status).toBe(401);
    expect((await callPatch(code, { ownerPassword: pw, name: "x" })).status).toBe(200);
  });

  it("never exposes the hash in public responses", async () => {
    const code = await createTestWheel(["A", "B"]);
    const created = await callCreate(createBody(["A", "B"]));
    const get = await callGet(code);
    const patch = await callPatch(code, { ownerPassword: OWNER_PASSWORD, name: "Renamed" });
    for (const body of [created.body, get.body, patch.body]) {
      expect(JSON.stringify(body)).not.toMatch(/ownerPassword|\$2[aby]\$/);
    }
  });

  it("never logs the password, even on errors", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const secret = "super-secret-pw-123";
    const created = await callCreate({ ...createBody(["A", "B"]), ownerPassword: secret, confirmPassword: secret });
    if (!created.body.success) throw new Error();
    const code = created.body.data.code;
    await callCreate({ ...createBody(["A", "B"]), ownerPassword: secret, confirmPassword: "mismatch!!" });
    await callPatch(code, { ownerPassword: secret + "x", name: "n" });
    await callPatch(code, { ownerPassword: secret, name: "" });
    await callRemoveSpin(code, randomUUID(), secret + "x");
    // Force an unexpected (logged) server error while a password is in the request.
    const wheels = await getWheelsCollection();
    const spy = vi.spyOn(wheels.constructor.prototype, "findOneAndUpdate").mockRejectedValueOnce(new Error("boom"));
    const crashed = await callPatch(code, { ownerPassword: secret, name: "n2" });
    spy.mockRestore();
    expect(crashed.status).toBe(500);
    expect(JSON.stringify(crashed.body)).not.toContain("boom");

    const logged = spies.flatMap((s) => s.mock.calls).map((args) => args.map(String).join(" ")).join("\n");
    expect(logged).not.toContain(secret);
  });
});

describe("owner editing", () => {
  it("renames the wheel with the right password and rejects a wrong one", async () => {
    const code = await createTestWheel(["A", "B"], "Old");
    const bad = await callPatch(code, { ownerPassword: "wrong password", name: "New" });
    expect(bad.status).toBe(401);
    if (!bad.body.success) {
      expect(bad.body.error.code).toBe("INVALID_OWNER_PASSWORD");
      expect(bad.body.error.message).toBe("Incorrect owner password.");
    }
    expect((await publicWheel(code)).name).toBe("Old");

    const good = await callPatch(code, { ownerPassword: OWNER_PASSWORD, name: "  New  " });
    expect(good.status).toBe(200);
    expect((await publicWheel(code)).name).toBe("New");
  });

  it("returns 404 for an unknown wheel", async () => {
    expect((await callPatch("ZZZZZZZZZZ", { ownerPassword: OWNER_PASSWORD, name: "x" })).status).toBe(404);
  });

  it("adds, edits and removes available items by id (duplicates handled independently)", async () => {
    const code = await createTestWheel(["Apple", "Apple", "Banana"]);
    const before = await publicWheel(code);
    const [apple1, apple2, banana] = before.items;

    const res = await callPatch(code, {
      ownerPassword: OWNER_PASSWORD,
      addItems: ["Cherry", "Cherry"],
      updateItems: [{ id: apple2.id, label: "Green apple" }],
      removeItemIds: [apple1.id],
    });
    expect(res.status).toBe(200);
    const after = await publicWheel(code);
    expect(after.items.find((i) => i.id === apple1.id)).toBeUndefined();
    expect(after.items.find((i) => i.id === apple2.id)?.label).toBe("Green apple");
    expect(after.items.find((i) => i.id === banana.id)?.label).toBe("Banana");
    const cherries = after.items.filter((i) => i.label === "Cherry");
    expect(cherries).toHaveLength(2);
    expect(new Set(cherries.map((c) => c.id)).size).toBe(2);
    expect(after.totalItems).toBe(4);
    expect(after.remainingItems).toBe(4);
  });

  it("refuses to edit or remove an awarded item", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const spin = await callSpin(code, spinBody("Ann"));
    if (!spin.body.success) throw new Error();
    const awarded = spin.body.data.result.itemId;

    for (const body of [
      { ownerPassword: OWNER_PASSWORD, updateItems: [{ id: awarded, label: "Changed" }] },
      { ownerPassword: OWNER_PASSWORD, removeItemIds: [awarded] },
    ]) {
      const res = await callPatch(code, body);
      expect(res.status).toBe(409);
      if (!res.body.success) expect(res.body.error.code).toBe("ITEM_NOT_AVAILABLE");
    }
    const wheel = await publicWheel(code);
    expect(wheel.results[0].itemLabel).toBe(spin.body.data.result.itemLabel);
  });

  it("re-opens a completed wheel when items are added, completes it when all are removed", async () => {
    const code = await createTestWheel(["A", "B"]);
    await callSpin(code, spinBody("P1"));
    await callSpin(code, spinBody("P2"));
    expect((await publicWheel(code)).status).toBe("COMPLETED");

    await callPatch(code, { ownerPassword: OWNER_PASSWORD, addItems: ["C"] });
    let wheel = await publicWheel(code);
    expect(wheel.status).toBe("ACTIVE");
    expect(wheel.completedAt).toBeNull();
    expect(wheel.results).toHaveLength(2); // history kept
    expect(wheel.totalItems).toBe(3);

    // A new participant can spin; an existing one still can't.
    expect((await callSpin(code, spinBody("P3"))).status).toBe(200);
    wheel = await publicWheel(code);
    expect(wheel.status).toBe("COMPLETED");

    await callPatch(code, { ownerPassword: OWNER_PASSWORD, addItems: ["D", "E"] });
    const items = (await publicWheel(code)).items;
    await callPatch(code, { ownerPassword: OWNER_PASSWORD, removeItemIds: items.map((i) => i.id) });
    wheel = await publicWheel(code);
    expect(wheel.status).toBe("COMPLETED");
    expect(wheel.completedAt).not.toBeNull();
    expect(wheel.results).toHaveLength(3);
  });

  it("caps the wheel at 100 items including awarded ones", async () => {
    const code = await createTestWheel(Array.from({ length: 99 }, (_, i) => `I${i}`));
    await callSpin(code, spinBody("P"));
    const res = await callPatch(code, { ownerPassword: OWNER_PASSWORD, addItems: ["X", "Y"] });
    expect(res.status).toBe(400);
    expect((await callPatch(code, { ownerPassword: OWNER_PASSWORD, addItems: ["X"] })).status).toBe(200);
  });

  it("refuses to manage legacy wheels that have no owner password", async () => {
    const code = await createTestWheel(["A", "B"]);
    await (await getWheelsCollection()).updateOne({ code }, { $unset: { ownerPasswordHash: "" } });
    expect((await publicWheel(code)).ownerManaged).toBe(false);
    const res = await callPatch(code, { ownerPassword: OWNER_PASSWORD, name: "x" });
    expect(res.status).toBe(403);
    if (!res.body.success) expect(res.body.error.code).toBe("OWNER_NOT_CONFIGURED");
    // Participants can still use it.
    expect((await callSpin(code, spinBody("Legacy"))).status).toBe(200);
  });
});

describe("remove spin", () => {
  it("removes the result and participant, restores the item, and lets them spin again", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const participantId = randomUUID();
    const first = spinBody("Zoe", participantId);
    const spun = await callSpin(code, first);
    if (!spun.body.success) throw new Error();
    const itemId = spun.body.data.result.itemId;

    const removed = await callRemoveSpin(code, first.requestId);
    expect(removed.status).toBe(200);
    if (!removed.body.success) throw new Error();
    expect(removed.body.data).toEqual({
      removedResult: {
        requestId: first.requestId,
        participantId,
        participantName: "Zoe",
        itemId,
        itemLabel: spun.body.data.result.itemLabel,
      },
      remainingItems: 3,
      status: "ACTIVE",
    });

    const wheel = await publicWheel(code);
    expect(wheel.results).toHaveLength(0);
    expect(wheel.participants).toHaveLength(0);
    expect(wheel.items.filter((i) => i.id === itemId)).toHaveLength(1);
    expect(wheel.remainingItems).toBe(3);

    // Same participantId, new requestId: allowed again.
    const again = await callSpin(code, spinBody("Zoe", participantId));
    expect(again.status).toBe(200);
  });

  it("re-opens a completed wheel", async () => {
    const code = await createTestWheel(["A", "B"]);
    const a = spinBody("A");
    await callSpin(code, a);
    await callSpin(code, spinBody("B"));
    expect((await publicWheel(code)).status).toBe("COMPLETED");
    await callRemoveSpin(code, a.requestId);
    const wheel = await publicWheel(code);
    expect(wheel.status).toBe("ACTIVE");
    expect(wheel.completedAt).toBeNull();
    expect(wheel.remainingItems).toBe(1);
  });

  it("returns 404 for a missing result and 401 for a wrong password", async () => {
    const code = await createTestWheel(["A", "B"]);
    const req = spinBody("Q");
    await callSpin(code, req);
    expect((await callRemoveSpin(code, randomUUID())).status).toBe(404);
    expect((await callRemoveSpin(code, "not-a-uuid")).status).toBe(404);
    const bad = await callRemoveSpin(code, req.requestId, "wrong password");
    expect(bad.status).toBe(401);
    expect((await publicWheel(code)).results).toHaveLength(1);
  });

  it("does not restore the item twice", async () => {
    const code = await createTestWheel(["A", "B", "C"]);
    const req = spinBody("R");
    await callSpin(code, req);
    expect((await callRemoveSpin(code, req.requestId)).status).toBe(200);
    expect((await callRemoveSpin(code, req.requestId)).status).toBe(404);
    const wheel = await publicWheel(code);
    expect(wheel.items).toHaveLength(3);
    expect(new Set(wheel.items.map((i) => i.id)).size).toBe(3);
  });
});
