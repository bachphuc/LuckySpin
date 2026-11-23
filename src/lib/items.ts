import { MAX_ITEMS, MAX_ITEM_LENGTH, MIN_ITEMS } from "@/constants/wheel";

/**
 * Shared (client + server) item helpers. Kept free of Node-only imports so the
 * browser bundle can use them for the home page preview.
 */

/** Split by newline, trim each line, drop empty lines, keep duplicates. */
export function parseItemLines(input: string): string[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Client-side mirror of the server rules, for instant feedback only. */
export function validateItemLabels(labels: string[]): string | null {
  if (labels.length === 0) return "Enter at least one item per line.";
  if (labels.length < MIN_ITEMS) return `Enter at least ${MIN_ITEMS} items.`;
  if (labels.length > MAX_ITEMS) return `Enter at most ${MAX_ITEMS} items (you have ${labels.length}).`;
  const tooLong = labels.findIndex((l) => l.length > MAX_ITEM_LENGTH);
  if (tooLong !== -1) {
    return `Item ${tooLong + 1} is longer than ${MAX_ITEM_LENGTH} characters.`;
  }
  return null;
}
