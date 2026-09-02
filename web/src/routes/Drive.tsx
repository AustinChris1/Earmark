import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ExternalLink, Loader2, Lock, TriangleAlert, Wallet } from "lucide-react";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatUnits,
  getAddress,
  http,
  parseAbi,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { toDataSuffix } from "@celo/attribution-tags";
import { Shell } from "../components/Shell";
import { getDrive, type Drive } from "../lib/api";

const EARMARK_ABI = parseAbi(["function contribute(uint256 id, uint256 amount, string memo)"]);
const ERC20_ABI = parseAbi([
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
]);

declare global {
  interface Window {
    ethereum?: {
      isMiniPay?: boolean;
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
    };
  }
}

type Stage = "idle" | "approving" | "paying" | "done" | "error";

export function DrivePage() {
  const { id } = useParams();
  const [drive, setDrive] = useState<Drive | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [message, setMessage] = useState("");
  const [txHash, setTxHash] = useState<Hex | null>(null);

  const query = new URLSearchParams(location.search);
  const tgId = query.get("u") ?? "";
  const tgName = query.get("n") ? decodeURIComponent(query.get("n")!) : "";

  const refresh = useCallback(() => {
    if (!id) return;
    getDrive(id, tgId)
      .then((d) => {
        setDrive(d);
        setLoadError(null);
      })
      .catch((e: Error) => setLoadError(e.message));
  }, [id, tgId]);

  useEffect(refresh, [refresh]);

  // Prefill: the instalment the API says is next, else an amount handed over in the link.
  useEffect(() => {
    if (!drive) return;
    const amt = query.get("amt");
    if (drive.you) setAmount(formatUnits(BigInt(drive.you.amount), drive.token.decimals));
    else if (amt) setAmount(amt);
  }, [drive]);

  const chain = useMemo(() => {
    if (!drive) return null;
    return defineChain({
      id: drive.chainId,
      name: drive.chainId === 42220 ? "Celo" : "Local",
      nativeCurrency: { name: "CELO", symbol: "CELO", decimals: 18 },
      rpcUrls: { default: { http: [drive.rpcUrl] } },
    });
  }, [drive]);

  const fmt = (v: bigint | string) =>
    drive
      ? `${Number(formatUnits(BigInt(v), drive.token.decimals)).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${drive.token.symbol}`
      : "";

  const raised = drive ? BigInt(drive.raised) : 0n;
  const target = drive ? BigInt(drive.target) : 0n;
  const remaining = target > raised ? target - raised : 0n;
  const pct = target > 0n ? Math.min(100, Number((raised * 1000n) / target) / 10) : 0;

  async function pay() {
    if (!drive || !chain) return;
    const value = parseUnits(amount || (remaining > 0n ? formatUnits(remaining, drive.token.decimals) : "0"), drive.token.decimals);
    if (value <= 0n) {
      setStage("error");
      setMessage("Enter an amount.");
      return;
    }
    if (!window.ethereum) {
      setStage("error");
      setMessage("Open this page inside MiniPay or another Celo wallet to pay.");
      return;
    }
    try {
      const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(raw);
      const pub = createPublicClient({ chain, transport: http(drive.rpcUrl) });
      const wallet = createWalletClient({ chain, account, transport: custom(window.ethereum) });
      const dataSuffix: Hex | undefined = drive.tag ? toDataSuffix(drive.tag) : undefined;
      const feeCurrency = drive.token.feeCurrency ?? undefined;
      const memo = tgId ? `tg:${tgId}:${tgName}` : tgName;

      const balance = await pub.readContract({ address: drive.token.address, abi: ERC20_ABI, functionName: "balanceOf", args: [account] });
      if (balance < value) throw new Error(`Your balance is ${fmt(balance)}, and this needs ${fmt(value)}.`);

      const allowance = await pub.readContract({
        address: drive.token.address,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [account, drive.earmark],
      });
      if (allowance < value) {
        setStage("approving");
        setMessage("Approve in your wallet, step 1 of 2.");
        const h = await wallet.writeContract({
          address: drive.token.address,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [drive.earmark, value],
          dataSuffix,
          feeCurrency,
        } as never);
        await pub.waitForTransactionReceipt({ hash: h });
      }
      setStage("paying");
      setMessage("Confirm the payment.");
      const hash = await wallet.writeContract({
        address: drive.earmark,
        abi: EARMARK_ABI,
        functionName: "contribute",
        args: [BigInt(drive.id), value, memo],
        dataSuffix,
        feeCurrency,
      } as never);
      setMessage("Sending it to the destination.");
      await pub.waitForTransactionReceipt({ hash });
      setTxHash(hash);
      setStage("done");
      setMessage("Paid. It landed at the destination.");
      setAmount("");
      refresh();
    } catch (e) {
      setStage("error");
      const err = e as { shortMessage?: string; message?: string };
      setMessage(err.shortMessage ?? err.message ?? "Something went wrong.");
    }
  }

  const busy = stage === "approving" || stage === "paying";

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-5 pb-16">
        {loadError && (
          <div className="surface mt-6 rounded-2xl p-6">
            <TriangleAlert className="h-5 w-5" style={{ color: "var(--pending)" }} />
            <p className="mt-3 font-semibold">This drive is not available.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              {loadError}
            </p>
          </div>
        )}

        {!drive && !loadError && (
          <div className="surface mt-6 flex items-center gap-3 rounded-2xl p-6" style={{ color: "var(--text-muted)" }}>
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading drive
          </div>
        )}

        {drive && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div className="surface mt-6 rounded-2xl p-6">
              <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                {drive.you ? `Instalment ${drive.you.seq} of ${drive.you.count}` : `Drive #${drive.id}`}
              </p>
              <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight">{drive.label}</h1>

              <div className="mt-5 flex items-start gap-2 rounded-xl p-3" style={{ background: "color-mix(in srgb, var(--accent) 10%, transparent)" }}>
                <Lock className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                    Pays only to this address
                  </p>
                  <p className="mt-0.5 break-all font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {drive.destination}
                  </p>
                </div>
              </div>

              {target > 0n && (
                <div className="mt-5">
                  <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--line)" }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: "var(--accent)" }}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <div className="mt-2 flex justify-between text-sm">
                    <span className="font-semibold">{fmt(raised)}</span>
                    <span style={{ color: "var(--text-muted)" }}>of {fmt(target)}</span>
                  </div>
                </div>
              )}

              {drive.closed ? (
                <p className="mt-6 text-sm" style={{ color: "var(--pending)" }}>
                  This drive is closed.
                </p>
              ) : (
                <div className="mt-6">
                  <label htmlFor="amt" className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {drive.you
                      ? `Instalment ${drive.you.seq} of ${drive.you.count}${tgName ? ` for ${tgName}` : ""}`
                      : `Your contribution${tgName ? ` as ${tgName}` : ""}`}
                  </label>
                  <div className="mt-2 flex items-center gap-2 rounded-xl px-3" style={{ border: "1px solid var(--line)" }}>
                    <input
                      id="amt"
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder={remaining > 0n ? formatUnits(remaining, drive.token.decimals) : "0.00"}
                      className="w-full bg-transparent py-3 text-lg outline-none"
                    />
                    <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                      {drive.token.symbol}
                    </span>
                  </div>

                  <button
                    onClick={pay}
                    disabled={busy}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-[15px] font-semibold transition disabled:opacity-60"
                    style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                    {busy ? "Confirm in your wallet" : "Pay now"}
                  </button>

                  <AnimatePresence>
                    {message && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="mt-3 flex items-start gap-2 text-sm"
                        style={{ color: stage === "error" ? "var(--pending)" : "var(--text-muted)" }}
                      >
                        {stage === "done" && <CheckCircle2 className="mt-0.5 h-4 w-4" style={{ color: "var(--accent)" }} />}
                        <span>{message}</span>
                      </motion.p>
                    )}
                  </AnimatePresence>

                  {txHash && (
                    <a
                      href={`${drive.explorer}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm underline underline-offset-4"
                      style={{ color: "var(--accent)" }}
                    >
                      View transaction <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              )}
            </div>

            {drive.payments.length > 0 && (
              <div className="surface mt-4 rounded-2xl p-6">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
                  Who has paid
                </p>
                <ul className="mt-3">
                  {drive.payments.map((p) => (
                    <motion.li
                      key={p.tx}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="flex items-center justify-between border-t py-2.5 text-sm first:border-t-0"
                      style={{ borderColor: "var(--line)" }}
                    >
                      <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" style={{ color: "var(--accent)" }} />
                        {p.name}
                      </span>
                      <span style={{ color: "var(--text-muted)" }}>{fmt(p.amount)}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </main>
    </Shell>
  );
}
