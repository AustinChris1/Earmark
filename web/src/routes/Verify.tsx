import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { animated } from "@react-spring/web";
import { BadgeCheck, ExternalLink, Loader2, ShieldCheck, TriangleAlert, Wallet } from "lucide-react";
import { createWalletClient, custom, getAddress } from "viem";
import { celo } from "viem/chains";
import { Shell } from "../components/Shell";
import "../lib/wallet";
import { useLift } from "../lib/springs";

type Status = {
  linked: boolean;
  address: string | null;
  verified: boolean;
  verifyUrl: string;
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
            <p className="text-xs uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>
              One time check
            </p>
            <h1 className="mt-2 font-display text-3xl leading-tight tracking-tight">Prove you are a real person</h1>
            <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              A drive names where money must land. This check is what stops anyone opening a fake school or landlord
              anonymously. Self reads a government document on your own device; Earmark only ever learns whether the
              check passed.
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
              <div className="mt-6 flex flex-col gap-3">
                <div className="rounded-xl p-4" style={{ border: "1px solid var(--line)" }}>
                  <p className="text-sm font-semibold">
                    Step 1 {status?.linked ? "· done" : ""}
                  </p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    {status?.linked
                      ? `Linked ${status.address?.slice(0, 6)}…${status.address?.slice(-4)}`
                      : "Link the wallet you will verify with. You sign a message, nothing is sent."}
                  </p>
                  {!status?.linked && (
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
                  )}
                </div>

                <div
                  className="rounded-xl p-4"
                  style={{ border: "1px solid var(--line)", opacity: step2Ready ? 1 : 0.55 }}
                >
                  <p className="text-sm font-semibold">Step 2</p>
                  <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                    Verify with Self using that same wallet. Self pays the gas and mints you a non transferable badge.
                  </p>
                  {step2Ready && status?.verifyUrl && (
                    <a
                      href={status.verifyUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
                      style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
                    >
                      Open Self <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {step2Ready && !status?.verifyUrl && (
                    <p className="mt-3 text-sm" style={{ color: "var(--pending)" }}>
                      The verification flow is not configured on this deployment yet.
                    </p>
                  )}
                </div>

                {step2Ready && (
                  <button
                    onClick={refresh}
                    className="text-sm underline underline-offset-4"
                    style={{ color: "var(--text-muted)" }}
                  >
                    I have finished with Self, check again
                  </button>
                )}
              </div>
            )}

            {message && (
              <p className="mt-4 text-sm" style={{ color: "var(--text-muted)" }}>
                {message}
              </p>
            )}
            {error && (
              <p className="mt-4 text-sm" style={{ color: "var(--pending)" }}>
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
