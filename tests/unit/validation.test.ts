import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createWheelSchema, spinRequestSchema } from "@/lib/validation";

describe("createWheelSchema", () => {
  it("trims the name and items and drops empty items", () => {
    const r = createWheelSchema.parse({ name: "  Draw  ", items: [" A ", "", "  ", "B"] });
    expect(r).toEqual({ name: "Draw", items: ["A", "B"] });
  });

  it("rejects missing, blank or too-long names", () => {
    expect(createWheelSchema.safeParse({ items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ name: "   ", items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ name: "x".repeat(81), items: ["A", "B"] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ name: "x".repeat(80), items: ["A", "B"] }).success).toBe(true);
  });

  it("enforces 2..100 items after trimming", () => {
    expect(createWheelSchema.safeParse({ name: "n", items: ["A", " "] }).success).toBe(false);
    expect(createWheelSchema.safeParse({ name: "n", items: [] }).success).toBe(false);
    const many = Array.from({ length: 101 }, (_, i) => `I${i}`);
    expect(createWheelSchema.safeParse({ name: "n", items: many }).success).toBe(false);
    expect(createWheelSchema.safeParse({ name: "n", items: many.slice(0, 100) }).success).toBe(true);
  });

  it("enforces 100 characters per item", () => {
    expect(createWheelSchema.safeParse({ name: "n", items: ["A", "x".repeat(101)] }).success).toBe(false);
  });

  it("rejects non-string items", () => {
    expect(createWheelSchema.safeParse({ name: "n", items: ["A", 2] }).success).toBe(false);
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
