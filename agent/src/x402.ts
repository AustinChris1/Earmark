import { randomUUID } from "node:crypto";
import type { RequestHandler, Request, Response } from "express";
import { paymentMiddlewareFromConfig } from "@x402/express";
import { HTTPFacilitatorClient, type HTTPRequestContext } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { formatUnits, parseUnits, type Address } from "viem";
import { env, tokenByAddress, X402_FACILITATOR, X402_NETWORK } from "./config.js";
import { account, contributeFromAgent, publicClient, readDrive, ERC20_ABI } from "./chain.js";
import { addIntent, getIntent, markForwarded, pendingIntents } from "./db.js";

const facilitator = new HTTPFacilitatorClient({
  url: X402_FACILITATOR,
  createAuthHeaders: async () => {
    // Only /settle requires the key; /verify and /supported are open.
    const h: Record<string, string> = env.X402_API_KEY ? { "X-API-Key": env.X402_API_KEY } : {};
    return { verify: h, settle: h, supported: h };
  },
});

function driveIdFrom(path: string): number {
  const m = /\/x402\/drive\/(\d+)/.exec(path);
  return m ? Number(m[1]) : 0;
}

// Resolves what this request must pay: the drive's own token, for the amount asked for in ?amt=.
async function quote(path: string, amt: string | undefined) {
  const id = driveIdFrom(path);
  if (!id) throw new Error("No drive id in path.");
  const drive = await readDrive(BigInt(id));
  if (drive.destination === "0x0000000000000000000000000000000000000000") throw new Error(`Drive ${id} does not exist.`);
  if (drive.closed) throw new Error(`Drive ${id} is closed.`);
  const token = tokenByAddress(drive.token);
  if (!token?.eip712) {
    throw new Error("This drive's token cannot settle over x402; the facilitator handles USDC, USDT and USAT.");
  }
  const remaining = drive.target > 0n ? drive.target - drive.raised : 0n;
  const human = amt ?? (remaining > 0n ? formatUnits(remaining, token.decimals) : "");
  if (!human) throw new Error("Pass ?amt= with the amount to pay.");
  const amount = parseUnits(human, token.decimals);
  if (amount <= 0n) throw new Error("Amount must be greater than zero.");
  if (remaining > 0n && amount > remaining) {
    throw new Error(`Drive ${id} only needs ${formatUnits(remaining, token.decimals)} ${token.symbol} more.`);
  }
  return { id, drive, token, amount };
}

// Validates the drive before the payment middleware prices it, so a bad id is a 400 and not a thrown 500.
export const x402Guard: RequestHandler = async (req, res, next) => {
  if (!/^\/x402\/drive\//.test(req.path)) return next();
  try {
    const raw = req.query.amt;
    await quote(req.path, typeof raw === "string" ? raw : undefined);
    next();
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

export function x402Middleware(): RequestHandler {
  const routes = {
    "GET /x402/drive/:id": {
      description: "Pay a share of an Earmark drive. The agent forwards it to the drive's locked destination.",
      mimeType: "application/json",
      serviceName: "Earmark",
      accepts: {
        scheme: "exact",
        network: X402_NETWORK,
        payTo: () => account.address,
        price: async (ctx: HTTPRequestContext) => {
          const raw = ctx.adapter.getQueryParam?.("amt");
          const { token, amount } = await quote(ctx.path, typeof raw === "string" ? raw : undefined);
          return {
            asset: token.address,
            amount: amount.toString(),
            extra: { name: token.eip712!.name, version: token.eip712!.version },
          };
        },
      },
    },
  };
  return paymentMiddlewareFromConfig(routes, facilitator, [
    { network: X402_NETWORK, server: new ExactEvmScheme() },
  ]);
}

// Runs only once the middleware has accepted payment; records the intent and lets the sweeper forward it.
export const x402Handler: RequestHandler = async (req: Request, res: Response) => {
  try {
    const raw = req.query.amt;
    const { id, drive, token, amount } = await quote(req.path, typeof raw === "string" ? raw : undefined);
    const payerName = typeof req.query.name === "string" && req.query.name ? req.query.name : "diaspora";
    const intentId = randomUUID();
    addIntent({ id: intentId, drive_id: id, token: drive.token, amount: amount.toString(), payer_name: payerName });
    const forwarded = await forwardIntent(intentId).catch(() => null);
    res.json({
      ok: true,
      drive: id,
      label: drive.label,
      destination: drive.destination,
      amount: formatUnits(amount, token.decimals),
      token: token.symbol,
      forwardedTx: forwarded,
      note: forwarded
        ? "Forwarded to the locked destination."
        : "Recorded; the agent forwards to the locked destination as soon as the settlement lands.",
    });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
};

// Forwards one recorded intent if the agent actually holds the funds. Idempotent: a forwarded intent is skipped.
async function forwardIntent(id: string): Promise<string | null> {
  const intent = getIntent(id);
  if (!intent || intent.forwarded_tx) return null;
  const amount = BigInt(intent.amount);
  const balance = await publicClient.readContract({
    address: intent.token as Address,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: [account.address],
  });
  if (balance < amount) return null;
  const hash = await contributeFromAgent(BigInt(intent.drive_id), intent.token as Address, amount, `x402:${intent.payer_name}`);
  markForwarded(id, hash);
  return hash;
}

// Retries any intent whose settlement landed after the response was sent.
export function startX402Sweeper() {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      for (const intent of pendingIntents()) {
        const hash = await forwardIntent(intent.id).catch((e) => {
          console.error("x402 forward:", (e as Error).message);
          return null;
        });
        if (hash) console.log(`x402 forwarded intent ${intent.id} -> ${hash}`);
      }
    } finally {
      running = false;
    }
  };
  void tick();
  return setInterval(tick, 20_000);
}
