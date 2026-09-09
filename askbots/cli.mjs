#!/usr/bin/env node
// Wrapper around the published askbots CLI.
//
// Claude hit askbots@0.1.1, which refused --execute. 0.2.0 funds for real.
// Google Sign-In still has no password, so `register` here would create a
// second account that does not show on the dashboard. This wrapper never
// does that for you.

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const SUBMISSION = path.join(here, "submission.json");
const DASHBOARD = "https://askbots.ai/dashboard/new";
const MIN_VERSION = "0.2.0";
const AGENT_WALLET = "0x178977E82c4Df50D5a7465F4495170DFF9275363";

export function parseVersion(v) {
  const m = String(v).trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

export function versionAtLeast(have, need) {
  const a = parseVersion(have);
  const b = parseVersion(need);
  if (!a || !b) return false;
  if (a.major !== b.major) return a.major > b.major;
  if (a.minor !== b.minor) return a.minor > b.minor;
  return a.patch >= b.patch;
}

export function installedVersion() {
  return require("askbots/package.json").version;
}

export function officialBin() {
  return require.resolve("askbots/bin/askbots.js");
}

function runOfficial(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [officialBin(), ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`askbots killed by ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

function warn(lines) {
  for (const line of lines) console.error(line);
}

export async function loadSubmission(file = SUBMISSION) {
  const text = await readFile(file, "utf8");
  const doc = JSON.parse(text);
  if (!doc?.name || !doc?.propertyUrl || !Array.isArray(doc.questions)) {
    throw new Error(`${file} is not a valid AskBots submission document`);
  }
  return doc;
}

function printDashboard(doc) {
  console.log("Fund this round from the dashboard (gasless, Google Sign-In works):");
  console.log(`  ${DASHBOARD}`);
  console.log("");
  console.log("Paste:");
  console.log(`  name     ${doc.name}`);
  console.log(`  type     ${doc.propertyType}`);
  console.log(`  url      ${doc.propertyUrl}`);
  console.log(`  budget   ${doc.budget} responses  ($${(doc.budget * 0.11).toFixed(2)} USDT)`);
  console.log("");
  console.log("Create the AskBots account in the browser. Do not run `askbots register`");
  console.log("if you already used Google: that CLI user is a different account, and the");
  console.log("project URL you submit to Celo Builders will not be the one that got reviews.");
  console.log("");
  console.log(`Exclude this agent wallet from reviewers: ${AGENT_WALLET}`);
}

async function preview() {
  const v = installedVersion();
  if (!versionAtLeast(v, MIN_VERSION)) {
    warn([
      `askbots: this workspace pins ${MIN_VERSION}. Found ${v}.`,
      "  0.1.x refuses --execute. Run `pnpm install` from the repo root.",
    ]);
    return 1;
  }
  console.log(`askbots ${v} (workspace pin, not npx)`);
  return runOfficial(["submit", "--file", SUBMISSION]);
}

async function fund() {
  const v = installedVersion();
  if (!versionAtLeast(v, MIN_VERSION)) {
    warn([`askbots: need ${MIN_VERSION}+ for --execute, found ${v}.`]);
    return 1;
  }
  if (!process.env.ASKBOTS_PASSWORD) {
    warn([
      "askbots: no ASKBOTS_PASSWORD in the environment.",
      "",
      "  Google Sign-In has no password. `askbots login` will fail, and",
      "  `askbots register` would create a second account that does not",
      "  appear on your dashboard. Fund from the site instead.",
      "",
    ]);
    printDashboard(await loadSubmission());
    return 2;
  }
  if (!process.env.ASKBOTS_PRIVATE_KEY) {
    warn([
      "askbots: --execute needs ASKBOTS_PRIVATE_KEY (USDT + a little CELO for gas).",
      "  That address must be the Celo Builders agent wallet:",
      `  ${AGENT_WALLET}`,
      "",
      "  Prefer not to put a key in the env? Use the dashboard.",
      "",
    ]);
    printDashboard(await loadSubmission());
    return 2;
  }
  console.log(`askbots ${v} --execute`);
  console.log(`Funding wallet must match ${AGENT_WALLET} or Track 3 will not count.`);
  return runOfficial(["submit", "--file", SUBMISSION, "--execute"]);
}

async function dashboard() {
  printDashboard(await loadSubmission());
  return 0;
}

async function registerAccount(argv) {
  if (!process.env.ASKBOTS_PASSWORD) {
    warn([
      "askbots: set ASKBOTS_PASSWORD in this terminal first. It is not a flag.",
      "",
      "  PowerShell:",
      "    $env:ASKBOTS_PASSWORD = 'your-password'",
      "    pnpm askbots:register --email you@example.com --name \"Your Name\"",
      "",
      "  Do not Google-sign-in later with this email. That is a different account.",
    ]);
    return 2;
  }
  console.log(`askbots ${installedVersion()} register`);
  return runOfficial(["register", ...argv]);
}

async function main(argv) {
  const cmd = argv[0] ?? "preview";
  if (cmd === "preview") return preview();
  if (cmd === "fund") return fund();
  if (cmd === "dashboard") return dashboard();
  if (cmd === "register") return registerAccount(argv.slice(1));
  if (cmd === "help" || cmd === "--help" || cmd === "-h") {
    console.log(`Earmark AskBots wrapper (pins askbots@${installedVersion()})

  pnpm askbots              dry-run the submission (spends nothing)
  pnpm askbots:register     create an email+password account (needs ASKBOTS_PASSWORD)
  pnpm askbots:fund         submit --execute (password + agent key)
  pnpm askbots:dashboard    print the gasless browser path

Do not npx askbots. npx resolved 0.1.1 last time and refused --execute.
Create the account with email here. Do not also Sign in with Google.`);
    return 0;
  }
  warn([`unknown command: ${cmd}`, "Try: preview | register | fund | dashboard | help"]);
  return 2;
}

const launched = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (launched) {
  main(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    },
  );
}
