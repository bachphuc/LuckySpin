import "server-only";
import { MongoClient } from "mongodb";

/**
 * One MongoClient per server process. In development the client is cached on
 * globalThis so hot reloads don't open a new connection pool each time.
 * The URI is read lazily so importing this module never throws at build time.
 */
const globalForMongo = globalThis as unknown as {
  _luckyspinMongo?: { uri: string; promise: Promise<MongoClient> };
};

export function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is not set. Add it to .env.local (see .env.example).");
  }

  const cached = globalForMongo._luckyspinMongo;
  if (cached && cached.uri === uri) return cached.promise;

  const client = new MongoClient(uri, {
    appName: "luckyspin",
    maxPoolSize: 10,
  });
  const promise = client.connect().catch((err) => {
    // Don't keep a rejected promise cached; allow the next request to retry.
    globalForMongo._luckyspinMongo = undefined;
    throw err;
  });
  globalForMongo._luckyspinMongo = { uri, promise };
  return promise;
}

/** Test helper: close and forget the cached client. */
export async function closeMongoClient(): Promise<void> {
  const cached = globalForMongo._luckyspinMongo;
  globalForMongo._luckyspinMongo = undefined;
  if (cached) {
    await (await cached.promise).close();
  }
}
