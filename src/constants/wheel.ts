export const WHEEL_STATUS = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
} as const;

export const MIN_ITEMS = 2;
export const MAX_ITEMS = 100;
export const MAX_ITEM_LENGTH = 100;
export const MAX_WHEEL_NAME_LENGTH = 80;
export const MAX_PARTICIPANT_NAME_LENGTH = 40;

/** Public share code: 10 URL-safe base62 characters (~59 bits of entropy). */
export const SHARE_CODE_LENGTH = 10;
export const SHARE_CODE_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export const SHARE_CODE_PATTERN = /^[A-Za-z0-9]{10}$/;

/** How often the shared wheel page refreshes from the backend. */
export const POLL_INTERVAL_MS = 3000;

/** Max optimistic-concurrency retries for a single spin request. */
export const MAX_SPIN_ATTEMPTS = 25;

export const WHEELS_COLLECTION = "wheels";
export const RATE_LIMITS_COLLECTION = "rate_limits";

export const participantStorageKey = (code: string) =>
  `luckyspin:participant:${code}`;

export const SEGMENT_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#6366f1",
  "#a855f7",
  "#ec4899",
  "#84cc16",
  "#06b6d4",
  "#f43f5e",
] as const;
