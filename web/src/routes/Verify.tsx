import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { animated } from "@react-spring/web";
import { BadgeCheck, Check, ExternalLink, Loader2, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { createWalletClient, custom, getAddress } from "viem";
import { celo } from "viem/chains";
import { Shell } from "../components/Shell";
import "../lib/wallet";
import { useLift } from "../lib/springs";

type Status = {
  linked: boolean;
  address: string | null;
  verified: boolean;
  canVerify: boolean;
  enforced: boolean;
};

export function VerifyPage() {
  const tgId = new URLSearchParams(location.search).get("u") ?? "";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const linkBtn = useLift(2);

  const refresh = useCallback(async () => {
    if (!tgId) return;
    const r = await fetch(`/api/verify/status?u=${encodeURIComponent(tgId)}`);
    if (r.ok) setStatus(await r.json());
  }, [tgId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Self mints a one time verification link per person, so it is requested at the moment it is needed.
  async function startSelf() {
    setError("");
    setBusy(true);
    try {
      const r = await fetch("/api/verify/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ u: tgId }),
      });
      const body = await r.json();
      if (!r.ok || !body.url) throw new Error(body.error ?? "Could not start verification.");
      window.location.href = body.url;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function linkWallet() {
    setError("");
    setBusy(true);
    try {
      if (!window.ethereum) throw new Error("Open this page in MiniPay or another Celo wallet browser.");
      const [raw] = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const account = getAddress(raw);

      const nr = await fetch(`/api/verify/nonce?u=${encodeURIComponent(tgId)}`);
      if (!nr.ok) throw new Error("Could not start the link. Try again.");
      const { message: toSign } = (await nr.json()) as { message: string };

      setMessage("Sign the message in your wallet. It costs nothing.");
      const wallet = createWalletClient({ chain: celo, account, transport: custom(window.ethereum) });
      const signature = await wallet.signMessage({ account, message: toSign });

      const lr = await fetch("/api/verify/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ u: tgId, address: account, signature }),
      });
      const body = await lr.json();
      if (!lr.ok) throw new Error(body.error ?? "Could not link that wallet.");
      setMessage("Wallet linked.");
      await refresh();
    } catch (e) {
      const err = e as { shortMessage?: string; message?: string };
      setError(err.shortMessage ?? err.message ?? "Something went wrong.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  if (!tgId) {
    return (
      <Shell>
        <main className="mx-auto max-w-lg px-5 pb-16">
          <div className="surface mt-6 rounded-2xl p-6">
            <TriangleAlert className="h-5 w-5" style={{ color: "var(--pending)" }} />
            <p className="mt-3 font-semibold">Open this from the bot.</p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
              Send /verify to Earmark in Telegram and tap the button, so the link is tied to your account.
            </p>
          </div>
        </main>
      </Shell>
    );
  }

  const step2Ready = !!status?.linked;

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-5 pb-16">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="surface mt-6 rounded-2xl p-6">
            <h1 className="font-display text-3xl leading-tight tracking-tight">Prove you are a real person</h1>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              You do this once when Self accepts your document. A drive names where money must land, and this check
              is what stops anyone opening a fake school or landlord anonymously. Self reads a government document on
              your own device; Earmark only ever learns whether the check passed.
            </p>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Nigerian passports currently show Coming Soon in the Self app. You can still open a drive in Telegram
              without this step. If you have an NFC passport or ID from a country Self already supports, continue
              below.
            </p>

            {status?.verified ? (
              <div
                className="mt-6 flex items-start gap-3 rounded-xl p-4"
                style={{ background: "var(--accent-soft)" }}
              >
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} />
                <div className="min-w-0">
                  <p className="font-semibold" style={{ color: "var(--accent)" }}>
                    Verified
                  </p>
                  <p className="mt-1 break-all font-mono text-[11px]" style={{ color: "var(--text-muted)" }}>
                    {status.address}
                  </p>
                  <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
                    Go back to Telegram and open your drive.
                  </p>
                </div>
              </div>
            ) : (
              <ol className="mt-8">
                <Step n={1} done={!!status?.linked} title={status?.linked ? "Wallet linked" : "Link your wallet"} last={false}>
                  {status?.linked ? (
                    <p className="font-mono text-[12px]" style={{ color: "var(--text-muted)" }}>
                      {status.address?.slice(0, 6)}…{status.address?.slice(-4)}
                    </p>
                  ) : (
                    <>
                      <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                        The wallet you will verify with. You sign a message, nothing is sent.
                      </p>
                      <animated.button
                        {...linkBtn.bind}
                        onClick={linkWallet}
                        disabled={busy}
                        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[15px] font-semibold disabled:opacity-60"
                        style={{ ...linkBtn.style, background: "var(--brand)", color: "var(--brand-ink)" }}
                      >
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                        {busy ? "Check your wallet" : "Link my wallet"}
                      </animated.button>
                    </>
                  )}
                </Step>

                <Step n={2} done={false} title="Verify with Self" last dim={!step2Ready}>
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Same wallet. Self pays the gas and mints you a non transferable badge.
                  </p>
                  {step2Ready && status?.canVerify && (
                    <button
                      onClick={startSelf}
                      disabled={busy}
                      className="pressable mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60"
                      style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Open Self <ExternalLink className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {step2Ready && !status?.canVerify && (
                    <p className="mt-3 text-sm" style={{ color: "var(--danger)" }}>
                      The verification flow is not configured on this deployment yet.
                    </p>
                  )}
                  {step2Ready && (
                    <button
                      onClick={refresh}
                      className="mt-3 block rounded-lg text-sm underline underline-offset-4"
                      style={{ color: "var(--text-muted)" }}
                    >
                      I have finished with Self, check again
                    </button>
                  )}
                </Step>
              </ol>
            )}

            {message && (
              <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
                {message}
              </p>
            )}
            {error && (
              <p role="alert" className="mt-4 text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}

            {status && !status.enforced && (
              <p className="mt-6 flex items-start gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Verification is not being enforced on this deployment yet, so drives still open without it.
              </p>
            )}
          </div>
        </motion.div>
      </main>
    </Shell>
  );
}

function Step({
  n,
  title,
  done,
  dim = false,
  last,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  dim?: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="relative flex gap-4 transition-opacity" style={{ opacity: dim ? 0.5 : 1 }}>
      <div className="flex flex-col items-center">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-mono text-[12px] font-semibold"
          style={
            done
              ? { background: "var(--accent)", color: "var(--accent-ink)" }
              : { background: "var(--brand)", color: "var(--brand-ink)" }
          }
        >
          {done ? <Check className="h-3.5 w-3.5" /> : n}
        </span>
        {!last && <span className="w-px flex-1" style={{ background: "var(--line)" }} />}
      </div>
      <div className={`min-w-0 flex-1 ${last ? "" : "pb-7"}`}>
        <p className="pt-1 text-sm font-semibold">{title}</p>
        <div className="mt-1">{children}</div>
      </div>
    </li>
  );
}
