import { useEffect, useId, useState } from "react";
import { animated } from "@react-spring/web";
import { ArrowRight, ArrowUpRight, ChevronDown } from "lucide-react";
import { Shell } from "../components/Shell";
import { FlowDiagram } from "../components/FlowDiagram";
import { Counter } from "../components/Counter";
import { useLift } from "../lib/springs";
import { getStats, type Stats } from "../lib/api";

const AGENT_ID = 9806;
const CONTRACT = "0x93316de31b4f891c56cf3b65a3f96aa6b04192ae";
const AGENT = "0x178977E82c4Df50D5a7465F4495170DFF9275363";
const HACKATHON_URL = "https://celobuilders.xyz/hackathons/agents-at-work";
const SOURCE_URL = "https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae";

const STEPS = [
  { title: "Name it in the chat", body: "One bill, one locked place." },
  { title: "Everyone pays a share", body: "A link, any amount still open." },
  { title: "It lands only there", body: "Nobody on the way can redirect it." },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does Earmark hold the money?",
    a: "On a wallet drive, no. Your payment goes to the locked address in the same transaction. On a bill drive, yes, briefly: the pool sits in Earmark's wallet until the meter or the phone is paid, then anything unused comes back.",
  },
  {
    q: "Can the destination change?",
    a: "No. It is written once. The contract has no owner and no withdraw.",
  },
  {
    q: "What if the bill cannot be paid?",
    a: "Everyone who paid that bill drive gets their share back.",
  },
  {
    q: "Which money?",
    a: "A drive collects one coin: USD₮, USA₮, or cNGN. A USD₮ drive can also be paid in pesos, reais, or naira. Earmark swaps those in.",
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="border-t" style={{ borderColor: "var(--line)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-6 rounded-lg py-4 text-left text-[15px] font-semibold"
      >
        <span>{q}</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 transition-transform duration-200"
          style={{ color: "var(--accent)", transform: open ? "rotate(180deg)" : "none" }}
        />
      </button>
      <div
        id={id}
        className="grid transition-[grid-template-rows] duration-200"
        style={{ gridTemplateRows: open ? "1fr" : "0fr", transitionTimingFunction: "var(--ease-out)" }}
      >
        <div className="min-h-0 overflow-hidden">
          <p className="max-w-[68ch] pb-5 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {a}
          </p>
        </div>
      </div>
    </div>
  );
}

function short(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function ProofLink({ href, label, value }: { href: string; label: string; value: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="group grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1 border-t py-3 text-sm first:border-t-0"
      style={{ borderColor: "var(--line)" }}
    >
      <span style={{ color: "var(--text-muted)" }}>{label}</span>
      <span className="inline-flex items-center justify-end gap-1 text-right font-mono text-[13px] wrap-break-word" style={{ color: "var(--text)" }}>
        {value}
        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" style={{ color: "var(--accent)" }} />
      </span>
    </a>
  );
}

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  const cta = useLift(2);
  const contract = stats?.earmark ?? CONTRACT;
  const agent = stats?.agent ?? AGENT;

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5">
        <section className="max-w-xl pt-14 pb-16 md:pt-20">
          <h1 className="font-display text-5xl leading-[1.08] tracking-tight md:text-6xl">
            Money that carries
            <br />
            <span className="highlight px-1.5">its destination.</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            A group names one bill. Every share can only reach the place they locked.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
            <animated.a
              {...cta.bind}
              style={{ ...cta.style, background: "var(--brand)", color: "var(--brand-ink)" }}
              href="https://t.me/Earmarked_bot"
              className="group inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-sm font-semibold"
            >
              Start in Telegram
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </animated.a>
            <a href="/app" className="rounded-lg text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
              Or open a drive here
            </a>
          </div>
        </section>

        <section className="border-t py-14" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">How a drive works.</h2>
          <div className="mt-8 grid items-center gap-10 md:grid-cols-2">
            <FlowDiagram className="w-full" />
            <ol className="grid gap-8">
            {STEPS.map((step, i) => (
              <li key={step.title} className="relative pt-5">
                <span className="absolute top-0 left-0 h-px w-full" style={{ background: "var(--line)" }} />
                <span
                  className="absolute -top-3 left-0 flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold"
                  style={{ background: "var(--brand)", color: "var(--brand-ink)" }}
                >
                  {i + 1}
                </span>
                <p className="font-semibold">{step.title}</p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {step.body}
                </p>
              </li>
            ))}
            </ol>
          </div>
        </section>

        <section id="faq" className="border-t py-14" style={{ borderColor: "var(--line)" }}>
          <h2 className="font-display text-3xl tracking-tight md:text-4xl">Before you pay.</h2>
          <div className="mt-6 max-w-3xl border-b" style={{ borderColor: "var(--line)" }}>
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
          <a
            href="/docs/faq"
            className="mt-5 inline-flex items-center gap-1 rounded text-sm underline underline-offset-4"
            style={{ color: "var(--accent)" }}
          >
            The longer answers <ArrowUpRight className="h-3.5 w-3.5" />
          </a>
        </section>

        <section className="border-t py-14" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-8 md:grid-cols-2 md:items-start">
            <div>
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">On Celo.</h2>
              {stats && stats.payments > 0 && (
                <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  <Counter to={stats.payments} className="font-semibold" style={{ color: "var(--text)" }} />{" "}
                  {stats.payments === 1 ? "payment" : "payments"} from{" "}
                  <Counter to={stats.payers} className="font-semibold" style={{ color: "var(--text)" }} />{" "}
                  {stats.payers === 1 ? "person" : "people"}.
                </p>
              )}
            </div>
            <div>
              <ProofLink href={HACKATHON_URL} label="Award" value="Stablecoin Adoption" />
              <ProofLink href={`https://celoscan.io/address/${contract}`} label="Contract" value={short(contract)} />
              <ProofLink href={SOURCE_URL} label="Source" value="verified, exact match" />
              <ProofLink href={`https://8004scan.io/agents/celo/${AGENT_ID}`} label="Agent" value={`#${AGENT_ID}`} />
              <ProofLink href={`https://celoscan.io/address/${agent}`} label="Agent wallet" value={short(agent)} />
              <ProofLink href="https://t.me/Earmarked_bot" label="Telegram" value="@Earmarked_bot" />
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}
