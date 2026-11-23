import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWheelSchema, ownerPasswordSchema, spinRequestSchema, updateWheelSchema } from "@/lib/validation";

const pw = { ownerPassword: "secret123", confirmPassword: "secret123" };

describe("createWheelSchema", () => {
  it("trims the name and items and drops empty items", () => {
    const r = createWheelSchema.parse({ ...pw, name: "  Draw  ", items: [" A ", "", "  ", "B"] });
    expect(r).toEqual({ name: "Draw", items: ["A", "B"], ...pw });
  });

  it("rejects missing, blank or too-long names", () => {
    expect(createWheelSchema.safeParse({ ...pw, items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ ...pw, name: "   ", items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ ...pw, name: "x".repeat(81), items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ ...pw, name: "x".repeat(80), items: ["A", "B"] }).success).toBe(true);
  });

  it("enforces 2..100 items after trimming", () => {
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: ["A", " "] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: [] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => `I${i}`);
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: many }).success).toBe(false);
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: many.slice(0, 100) }).success).toBe(true);
  });

  it("enforces 100 characters per item", () => {
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: ["A", "x".repeat(101)] }).success).toBe(false);
  });

  it("rejects non-string items", () => {
    expect(createWheelSchema.safeParse({ ...pw, name: "n", items: ["A", 2] }).success).toBe(false);
  });
});

describe("spinRequestSchema", () => {
  const valid = { participantId: randomUUID(), participantName: " Alice ", requestId: randomUUID() };

  it("accepts a valid body and trims the name", () => {
    expect(spinRequestSchema.parse(valid).participantName).toBe("Alice");
  });

  it("rejects blank or too-long names", () => {
    expect(spinRequestSchema.safeParse({ ...valid, participantName: "  " }).success).toBe(false);
    expect(spinRequestSchema.safeParse({ ...valid, participantName: "x".repeat(41) }).success).toBe(false);
  });

  it("requires UUID ids", () => {
    expect(spinRequestSchema.safeParse({ ...valid, participantId: "abc" }).success).toBe(false);
    expect(spinRequestSchema.safeParse({ ...valid, requestId: undefined }).success).toBe(false);
  });
});

describe("owner password", () => {
  it("requires 8..72 characters and does not trim", () => {
    expect(ownerPasswordSchema.safeParse("1234567").success).toBe(false);
    expect(ownerPasswordSchema.safeParse("12345678").success).toBe(true);
    expect(ownerPasswordSchema.safeParse("x".repeat(72)).success).toBe(true);
    expect(ownerPasswordSchema.safeParse("x".repeat(73)).success).toBe(false);
    expect(ownerPasswordSchema.parse("  spaced  ")).toBe("  spaced  ");
  });

  it("rejects passwords over bcrypt's 72-byte limit even if under 72 characters", () => {
    expect(ownerPasswordSchema.safeParse("é".repeat(36)).success).toBe(true); // 72 bytes
    expect(ownerPasswordSchema.safeParse("é".repeat(37)).success).toBe(false); // 74 bytes
  });

  it("requires a matching confirmation", () => {
    const r = createWheelSchema.safeParse({ name: "n", items: ["A", "B"], ownerPassword: "secret123", confirmPassword: "secret124" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toBe("Passwords do not match.");
  });

  it("rejects a password that only differs by surrounding spaces", () => {
    const r = createWheelSchema.safeParse({ name: "n", items: ["A", "B"], ownerPassword: "secret123 ", confirmPassword: "secret123" });
    expect(r.success).toBe(false);
  });
});

describe("updateWheelSchema", () => {
  it("needs at least one change", () => {
    expect(updateWheelSchema.safeParse({ ownerPassword: "x" }).success).toBe(false);
    expect(updateWheelSchema.safeParse({ ownerPassword: "x", name: "New" }).success).toBe(true);
  });
  it("rejects touching the same item twice", () => {
    const r = updateWheelSchema.safeParse({
      ownerPassword: "x",
      updateItems: [{ id: "a", label: "A" }],
      removeItemIds: ["a"],
    });
    expect(r.success).toBe(false);
  });
  it("trims labels and rejects empty ones", () => {
    expect(updateWheelSchema.parse({ ownerPassword: "x", addItems: [" Hat "] }).addItems).toEqual(["Hat"]);
    expect(updateWheelSchema.safeParse({ ownerPassword: "x", addItems: ["  "] }).success).toBe(false);
  });
});
