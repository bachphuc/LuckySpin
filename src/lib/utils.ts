import { randomInt, randomUUID } from "node:crypto";
import { SHARE_CODE_ALPHABET, SHARE_CODE_LENGTH } from "@/constants/wheel";
import type { WheelItem } from "@/types/wheel";
export { parseItemLines } from "@/lib/items";

/** Cryptographically secure, unbiased share code (crypto.randomInt avoids modulo bias). */
export function generateShareCode(length: number = SHARE_CODE_LENGTH): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += SHARE_CODE_ALPHABET[randomInt(SHARE_CODE_ALPHABET.length)];
  }
  return code;
}

/** Each label becomes its own item with a unique id, even when labels repeat. */
export function buildWheelItems(labels: string[]): WheelItem[] {
  return labels.map((label) => ({ id: randomUUID(), label }));
}

/** Secure random index in [0, length). */
export function secureRandomIndex(length: number): number {
  return randomInt(length);
}
