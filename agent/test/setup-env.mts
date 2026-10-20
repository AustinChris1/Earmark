import { readdirSync, rmSync } from "node:fs";

// Imported first by the tests so they never touch a real database or need a funded key.
// Each test file runs in its own process, in parallel, so each gets its own database: on Windows
// one process cannot delete a file another still has open, and a shared file failed with EPERM.
const FILE = `./earmark-dbtest-${process.pid}.db`;
const SUFFIXES = ["", "-journal", "-wal", "-shm"];

process.env.DATABASE_URL = `file:${FILE}`;
process.env.DATABASE_AUTH_TOKEN = "";
process.env.AGENT_PRIVATE_KEY ??= "0x0000000000000000000000000000000000000000000000000000000000000001";
process.env.EARMARK_ADDRESS ??= "";

function clean() {
  for (const suffix of SUFFIXES) {
    try {
      rmSync(`${FILE}${suffix}`, { force: true });
    } catch {
      // still open in this process at exit on Windows; the next run starts from a fresh name anyway
    }
  }
}

// Sweep databases earlier runs left behind; one still open by a parallel test just stays put.
for (const f of readdirSync(".")) {
  if (!f.startsWith("earmark-dbtest-")) continue;
  try {
    rmSync(f, { force: true });
  } catch {
    // in use by another test process right now
  }
}
clean();
process.on("exit", clean);
