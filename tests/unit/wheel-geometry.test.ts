import { describe, expect, it } from "vitest";
import { indexAtPointer, segmentColor, targetRotation } from "@/lib/wheel-geometry";

describe("targetRotation", () => {
  it("lands every index under the pointer, from any starting angle", () => {
    for (const count of [2, 3, 7, 12, 13, 100]) {
      for (const start of [0, 45.5, 359, 1234.7]) {
        for (let index = 0; index < count; index++) {
          for (const offset of [-0.35, 0, 0.35]) {
            const r = targetRotation(start, index, count, offset, 2);
            expect(indexAtPointer(r, count)).toBe(index);
            expect(r).toBeGreaterThanOrEqual(start + 720);
            expect(r).toBeLessThan(start + 1080);
          }
        }
      }
    }
  });
});

describe("segmentColor", () => {
  it("never gives neighbouring segments the same colour", () => {
    for (let count = 2; count <= 100; count++) {
      for (let i = 0; i < count; i++) {
        expect(segmentColor(i, count)).not.toBe(segmentColor((i + 1) % count, count));
      }
    }
  });
});
