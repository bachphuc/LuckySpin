import { describe, expect, it } from "vitest";
import { SHARE_CODE_LENGTH, SHARE_CODE_PATTERN } from "@/constants/wheel";
import { buildWheelItems, generateShareCode } from "@/lib/utils";

describe("generateShareCode", () => {
  it("produces URL-safe codes of the configured length", () => {
    for (let i = 0; i < 500; i++) {
      const code = generateShareCode();
      expect(code).toHaveLength(SHARE_CODE_LENGTH);
      expect(code).toMatch(SHARE_CODE_PATTERN);
      expect(encodeURIComponent(code)).toBe(code);
    }
  });

  it("is effectively unique", () => {
    const codes = new Set(Array.from({ length: 10_000 }, () => generateShareCode()));
    expect(codes.size).toBe(10_000);
  });
});

describe("buildWheelItems", () => {
  it("assigns a unique id to every item, including duplicate labels", () => {
    const items = buildWheelItems(["Apple", "Apple", "Banana"]);
    expect(items.map((i) => i.label)).toEqual(["Apple", "Apple", "Banana"]);
    expect(new Set(items.map((i) => i.id)).size).toBe(3);
    for (const item of items) expect(item.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
