import { describe, expect, it } from "vitest";
import { parseItemLines, validateItemLabels } from "@/lib/items";

describe("parseItemLines", () => {
  it("splits by newline and trims each line", () => {
    expect(parseItemLines("  Apple \nBanana\t\n Orange")).toEqual(["Apple", "Banana", "Orange"]);
  });

  it("ignores empty and whitespace-only lines", () => {
    expect(parseItemLines("\nApple\n\n   \nBanana\n\n")).toEqual(["Apple", "Banana"]);
  });

  it("handles Windows line endings", () => {
    expect(parseItemLines("Apple\r\nBanana\r\n")).toEqual(["Apple", "Banana"]);
  });

  it("keeps duplicates as separate entries", () => {
    expect(parseItemLines("Apple\nApple\nBanana")).toEqual(["Apple", "Apple", "Banana"]);
  });

  it("preserves inner whitespace and case", () => {
    expect(parseItemLines("  Big   Prize  ")).toEqual(["Big   Prize"]);
  });

  it("returns empty list for blank input", () => {
    expect(parseItemLines("   \n\n")).toEqual([]);
  });
});

describe("validateItemLabels", () => {
  it("rejects no items and a single item", () => {
    expect(validateItemLabels([])).toMatch(/at least/);
    expect(validateItemLabels(["A"])).toMatch(/at least 2/);
  });
  it("accepts 2..100 items", () => {
    expect(validateItemLabels(["A", "B"])).toBeNull();
    expect(validateItemLabels(Array.from({ length: 100 }, (_, i) => `I${i}`))).toBeNull();
  });
  it("rejects more than 100 items", () => {
    expect(validateItemLabels(Array.from({ length: 101 }, (_, i) => `I${i}`))).toMatch(/at most 100/);
  });
  it("rejects items over 100 characters", () => {
    expect(validateItemLabels(["A", "x".repeat(101)])).toMatch(/Item 2/);
    expect(validateItemLabels(["A", "x".repeat(100)])).toBeNull();
  });
});
