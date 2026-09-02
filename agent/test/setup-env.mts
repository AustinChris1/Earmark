import { rmSync } from "node:fs";

// Imported first by the tests so they never touch a real database or need a funded key.
const FILE = "./earmark-dbtest.db";

process.env.DATABASE_URL = `file:${FILE}`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.AGENT_PRIVATE_KEY ??= "0x0000000000000000000000000000000000000000000000000000000000000001";
process.env.EARMARK_ADDRESS ??= "";

// Start from an empty database so a rerun is not tripped by rows the last run inserted.
for (const suffix of ["", "-journal", "-wal", "-shm"]) {
  rmSync(`${FILE}${suffix}`, { force: true });
}
