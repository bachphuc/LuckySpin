import { MongoMemoryServer } from "mongodb-memory-server";
import { closeMongoClient, getMongoClient } from "@/lib/mongodb";

let server: MongoMemoryServer | null = null;

/**
 * Starts an in-memory MongoDB unless TEST_MONGODB_URI is provided
 * (e.g. a local mongod or a dedicated Atlas test database).
 */
export async function startTestDb(dbName: string): Promise<void> {
  const external = process.env.TEST_MONGODB_URI;
  if (external) {
    process.env.MONGODB_URI = external;
  } else {
    server = await MongoMemoryServer.create();
    process.env.MONGODB_URI = server.getUri();
  }
  process.env.MONGODB_DB_NAME = `${dbName}_${Date.now()}`;
  process.env.RATE_LIMIT_DISABLED = "1";
}

export async function stopTestDb(): Promise<void> {
  try {
    const client = await getMongoClient();
    if (process.env.TEST_MONGODB_URI) {
      await client.db(process.env.MONGODB_DB_NAME).dropDatabase();
    }
  } catch {
    // ignore
  }
  await closeMongoClient();
  await server?.stop();
  server = null;
}
