import "server-only";
import type { Collection, Db } from "mongodb";
import { RATE_LIMITS_COLLECTION, WHEELS_COLLECTION } from "@/constants/wheel";
import { getMongoClient } from "@/lib/mongodb";
import type { WheelDocument } from "@/types/wheel";

export interface RateLimitDocument {
  _id: string;
  count: number;
  expiresAt: Date;
}

const globalForIndexes = globalThis as unknown as {
  _luckyspinIndexes?: Map<string, Promise<void>>;
};

export async function getDb(): Promise<Db> {
  const client = await getMongoClient();
  const db = client.db(process.env.MONGODB_DB_NAME || "luckyspin");
  await ensureIndexes(db);
  return db;
}

export async function getWheelsCollection(): Promise<Collection<WheelDocument>> {
  return (await getDb()).collection<WheelDocument>(WHEELS_COLLECTION);
}

export async function getRateLimitsCollection(): Promise<Collection<RateLimitDocument>> {
  return (await getDb()).collection<RateLimitDocument>(RATE_LIMITS_COLLECTION);
}

/**
 * Idempotent index creation, run once per process per database.
 * No TTL on wheels: the MVP keeps wheels indefinitely.
 */
function ensureIndexes(db: Db): Promise<void> {
  const map = (globalForIndexes._luckyspinIndexes ??= new Map());
  const key = db.databaseName;
  let pending = map.get(key);
  if (!pending) {
    pending = Promise.all([
      db.collection(WHEELS_COLLECTION).createIndex({ code: 1 }, { unique: true, name: "code_unique" }),
      db
        .collection(RATE_LIMITS_COLLECTION)
        .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0, name: "expiresAt_ttl" }),
    ]).then(() => undefined);
    pending.catch(() => map.delete(key));
    map.set(key, pending);
  }
  return pending;
}
