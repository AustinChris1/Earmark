import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { animated } from "@react-spring/web";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { Shell } from "../components/Shell";
import { FlowDiagram } from "../components/FlowDiagram";
import { Reveal } from "../components/Reveal";
import { Counter } from "../components/Counter";
import { useLift } from "../lib/springs";
import { getStats, type Stats } from "../lib/api";

const STEPS = [
  { title: "Name the obligation", body: <code className="text-[13px]">/new 450 USDT 0xSchool Term 1 fees for Chioma</code> },
  { title: "Split it", body: "Everyone gets their share and a one tap pay link." },
  { title: "Money moves once", body: "Each payment lands at the locked destination in the same transaction." },
  { title: "The chat keeps score", body: "Who paid, who is outstanding, all of it on chain." },
];

const AGENT_ID = 9806;
// Sourcify exact match of the deployed bytecode; the claim below is checkable there, not just stated.
const SOURCE_URL = "https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae";

// Every answer here describes what the contract and the pages actually do, not what we intend.
const FAQ: { q: string; a: React.ReactNode }[] = [
  {
    q: "Does Earmark ever hold my money?",
    a: "No. A payment is one transaction that moves tokens from your wallet to the locked destination. The contract has no balance to hold, so there is nothing for anyone to withdraw, freeze or sweep.",
  },
  {
    q: "Can the destination be changed after a drive opens?",
    a: "No. It is written once when the drive is created. There is no function to edit it, no owner and no upgrade path, and you can check that in the verified source rather than take our word for it.",
  },
  {
    q: "What if the person who opened the drive typed the wrong address?",
    a: "They can close the drive so nobody else pays it, then open a correct one. Money already sent is at that address and Earmark cannot pull it back, which is why every pay page shows the full destination with a Celoscan link before you confirm.",
  },
  {
    q: "What happens if a drive is full, closed, or past its date?",
    a: "The contract refuses the payment and nothing leaves your wallet. A payment that would push the total past the target is rejected, and a drive closes itself the moment the target is reached.",
  },
  {
    q: "Can I get a refund?",
    a: "Not from Earmark, because it never had the money. Each contribution is a direct payment to the payee, so a refund is between you and them, the same as any transfer.",
  },
  {
    q: "What does it cost?",
    a: "Earmark takes no fee. You pay Celo network gas, which is a fraction of a cent. Inside a wallet that supports fee abstraction the gas comes out of the stablecoin itself; in MetaMask it is paid in CELO.",
  },
  {
    q: "Which wallets and tokens work?",
    a: "Any Celo wallet with a browser or a connect button: MetaMask, Rabby, Valora and MiniPay's injected wallet. Twenty five Celo stablecoins are supported, including USDT, USDC, USAT, cNGN and the Mento local currencies. Earmark is not yet listed in MiniPay Discover, so MiniPay users open it in another Celo wallet for now.",
  },
  {
    q: "Can it pay my school's bank account?",
    a: "No. Earmark pays a wallet address. It guarantees the money reaches the account the group named; it does not guarantee that account belongs to an institution. If the payee is not on chain, somebody still carries the last step.",
  },
  {
    q: "Do I need Telegram?",
    a: "No. The bot is the easiest way for a group, but the dashboard opens, lists and pays drives from a browser with your own wallet, and another agent can pay a drive over x402 with no human at all.",
  },
  {
    q: "What if the bot or this site goes down?",
    a: "Your money is not affected. Funds only ever move through the verified contract on Celo, which anyone can call directly. The bot and the pages read the chain; they do not custody anything.",
  },
];

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function ProofLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group flex items-baseline justify-between gap-4 border-t py-3 text-sm first:border-t-0"
      style={{ borderColor: "var(--line)" }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="inline-flex items-center gap-1 font-mono text-[13px]" style={{ color: "var(--text)" }}>
        {value}
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: "var(--accent)" }} />
      </span>
    </a>
  );
}

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  const cta = useLift(2);

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  const hasActivity = !!stats && stats.payments > 0;

  return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid items-center gap-10 pt-12 pb-20 md:grid-cols-2 md:pt-20">
          <div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
              className="font-display text-5xl leading-[1.12] tracking-tight md:text-6xl"
            >
              Money that carries
              <br />
              <span className="highlight px-2">its destination.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1, ease: [0.23, 1, 0.32, 1] }}
              className="mt-6 max-w-md text-[15px] leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              A group chat pools for one named obligation. The agent can only pay the destination it was locked to, so
              nothing stops at a person on the way.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.18, ease: [0.23, 1, 0.32, 1] }}
              className="mt-8 flex flex-wrap items-center gap-4"
            >
              <animated.a
                {...cta.bind}
                style={{ ...cta.style, background: "var(--brand)", color: "var(--brand-ink)" }}
                href="https://t.me/Earmarked_bot"
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold"
              >
                Start a drive in your chat
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </animated.a>
              {stats?.featured && (
                <a href="/live" className="rounded-lg text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
                  See a live drive
                </a>
              )}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.23, 1, 0.32, 1] }}
            className="surface rounded-2xl p-4"
          >
            <FlowDiagram className="w-full" />
          </motion.div>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">Remittance breaks on arrival, not on FX.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <div className="surface h-full rounded-2xl p-6">
              <p className="font-semibold" style={{ color: "var(--pending)" }}>
                Sent to a person
              </p>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                The transfer succeeds. The school is still unpaid, the light is still off, and the treasurer has stopped
                answering.
              </p>
            </div>
            <div className="h-full rounded-2xl p-6" style={{ background: "var(--accent-soft)" }}>
              <p className="font-semibold" style={{ color: "var(--accent)" }}>
                Earmarked
              </p>
              <p className="mt-2 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                The destination is fixed before the first payment. Every share lands there directly, and the group can
                see it.
              </p>
            </div>
          </div>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">Four moves, inside the chat.</h2>
          <ol className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative pt-5">
                {/* The rail: a line the number sits on, so the sequence reads as one path. */}
                <span className="absolute top-0 left-0 h-px w-full" style={{ background: "var(--line)" }} />
                <span
                  className="absolute -top-3 left-0 flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                  style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
                >
                  {i + 1}
                </span>
                <Reveal delay={i * 0.08}>
                  <p className="font-semibold">{s.title}</p>
                  <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {s.body}
                  </p>
                </Reveal>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <div className="min-w-0">
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">No custody, by construction.</h2>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Three functions change state: <code className="text-[13px]">createDrive</code>,{" "}
                <code className="text-[13px]">contribute</code> and <code className="text-[13px]">close</code>. There is
                no withdraw, no owner and no upgrade path, so nobody can redirect a drive. The contract never holds a
                balance, so there is nothing to run away with.
              </p>
              <a
                href={SOURCE_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1 rounded text-sm underline underline-offset-4"
                style={{ color: "var(--accent)" }}
              >
                Read the verified source <ArrowUpRight className="h-3.5 w-3.5" />
              </a>
              <div className="mt-6 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {["Fee abstraction", "x402", "ERC-8004", "Attribution tags"].map((t) => (
                  <span key={t} className="surface rounded-full px-3 py-1">
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <Reveal delay={0.1} className="min-w-0">
              <pre
                className="max-w-full overflow-x-auto whitespace-pre-wrap wrap-break-word rounded-2xl p-4 text-[12px] leading-relaxed sm:whitespace-pre sm:p-5 sm:text-[12.5px]"
                style={{ background: "var(--bg-sunken)", border: "1px solid var(--line)", color: "var(--text-muted)" }}
              >
                <code>{`function contribute(uint256 id, uint256 amount, string memo) {
  Drive storage d = _drives[id];
  d.raised += amount;
  IERC20(d.token).safeTransferFrom(
    msg.sender,
    `}<span style={{ color: "var(--accent)", fontWeight: 600 }}>d.destination</span>{`,
    amount
  );
}`}</code>
              </pre>
            </Reveal>
          </div>
        </section>

        <section id="faq" className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">Questions people ask before they pay.</h2>
          <dl className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {FAQ.map((item) => (
              <div key={item.q} className="min-w-0">
                <dt className="font-semibold">{item.q}</dt>
                <dd className="mt-1.5 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {item.a}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {stats && (
          <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
            <div className="grid gap-8 md:grid-cols-2 md:items-start">
              <div>
                <h2 className="font-display text-3xl tracking-tight md:text-4xl">Live on Celo mainnet.</h2>
                <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {hasActivity ? (
                    <>
                      <Counter to={stats.payments} className="font-semibold" style={{ color: "var(--text)" }} />{" "}
                      {stats.payments === 1 ? "payment" : "payments"} from{" "}
                      <Counter to={stats.payers} className="font-semibold" style={{ color: "var(--text)" }} />{" "}
                      {stats.payers === 1 ? "person" : "people"} across{" "}
                      <Counter to={stats.drives} className="font-semibold" style={{ color: "var(--text)" }} />{" "}
                      {stats.drives === 1 ? "drive" : "drives"}, every one of them forwarded on arrival.
                    </>
                  ) : (
                    <>Not a testnet and not a demo mode. Every address below is real and can be checked.</>
                  )}
                </p>
              </div>
              <div className="surface rounded-2xl px-5 py-2">
                <ProofLink href={`https://celoscan.io/address/${stats.earmark}`} label="Contract" value={short(stats.earmark)} />
                <ProofLink href={SOURCE_URL} label="Source" value="verified, exact match" />
                <ProofLink href={`https://8004scan.io/agents/celo/${AGENT_ID}`} label="ERC-8004 agent" value={`#${AGENT_ID}`} />
                <ProofLink href={`https://celoscan.io/address/${stats.agent}`} label="Agent wallet" value={short(stats.agent)} />
                <ProofLink href="https://t.me/Earmarked_bot" label="Telegram" value="@Earmarked_bot" />
              </div>
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
