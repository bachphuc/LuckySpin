// Run the app against a throwaway in-memory MongoDB (no Atlas needed).
// Data is lost when this process exits. Usage: npm run dev:memory [-- --port 3001]
import { spawn } from "node:child_process";
import { MongoMemoryServer } from "mongodb-memory-server";

const mongo = await MongoMemoryServer.create();
console.log(`[dev:memory] in-memory MongoDB at ${mongo.getUri()}`);

const child = spawn("npx", ["next", "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: mongo.getUri(), MONGODB_DB_NAME: "luckyspin" },
});

const shutdown = async (code = 0) => {
  child.kill("SIGTERM");
  await mongo.stop();
  process.exit(code);
};
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
child.on("exit", (code) => shutdown(code ?? 0));
