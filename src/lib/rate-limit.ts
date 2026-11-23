import "server-only";
import { getRateLimitsCollection } from "@/lib/database";
import { Errors } from "@/lib/errors";
import { isDuplicateKeyError } from "@/lib/wheel-service";

export interface RateLimitRule {
  /** Bucket name, e.g. "create" or "spin". */
  scope: string;
  limit: number;
  windowMs: number;
}

export const RATE_LIMITS = {
  create: { scope: "create", limit: 10, windowMs: 60_000 },
  spin: { scope: "spin", limit: 60, windowMs: 60_000 },
} satisfies Record<string, RateLimitRule>;

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim() || "unknown";
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * Fixed-window counter stored in MongoDB (shared across serverless instances,
 * unlike an in-memory map). Old windows are removed by a TTL index.
 * Fails open: if the limiter itself errors, the request is allowed.
 */
export async function enforceRateLimit(request: Request, rule: RateLimitRule): Promise<void> {
  if (process.env.RATE_LIMIT_DISABLED === "1") return;

  const window = Math.floor(Date.now() / rule.windowMs);
  const key = `${rule.scope}:${getClientIp(request)}:${window}`;
  const expiresAt = new Date((window + 1) * rule.windowMs + 60_000);

  let count: number;
  try {
    count = await increment(key, expiresAt);
  } catch (error) {
    console.error("[luckyspin] rate limiter unavailable, allowing request", error);
    return;
  }
  if (count > rule.limit) throw Errors.rateLimited();
}

async function increment(key: string, expiresAt: Date): Promise<number> {
  const collection = await getRateLimitsCollection();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await collection.findOneAndUpdate(
        { _id: key },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
        { upsert: true, returnDocument: "after" },
      );
      return doc?.count ?? 1;
    } catch (error) {
      // Two concurrent upserts on a new key: one gets E11000, retry as an update.
      if (attempt === 0 && isDuplicateKeyError(error)) continue;
      throw error;
    }
  }
  return 1;
}
