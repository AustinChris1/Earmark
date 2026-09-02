import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Landmark, Lock, MessageSquare, Receipt, ShieldCheck, Users } from "lucide-react";
import { Shell } from "../components/Shell";
import { FlowDiagram } from "../components/FlowDiagram";
import { Reveal } from "../components/Reveal";
import { Counter } from "../components/Counter";
import { getStats, type Stats } from "../lib/api";

const STEPS = [
  { icon: MessageSquare, title: "Name the obligation", body: "/new 100 USDT 0xSchool Term 1 fees for Chioma" },
  { icon: Users, title: "Split it", body: "Everyone gets their share and a one tap pay link." },
  { icon: Lock, title: "Money moves once", body: "Each payment lands at the locked destination in the same transaction." },
  { icon: Receipt, title: "The chat keeps score", body: "Who paid, who is outstanding, all of it on chain." },
];

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5">
        <section className="grid items-center gap-10 pt-10 pb-20 md:grid-cols-2 md:pt-20">
          <div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs surface"
              style={{ color: "var(--text-muted)" }}
            >
              <ShieldCheck className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
              Celo Agents at Work
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="font-display text-5xl leading-[1.05] tracking-tight md:text-6xl"
            >
              Money that carries
              <br />
              its destination.
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.12 }}
              className="mt-5 max-w-md text-[15px] leading-relaxed"
              style={{ color: "var(--text-muted)" }}
            >
              A group chat pools for one named obligation. The agent can only pay the destination it was locked to, so
              nothing stops at a person on the way.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="mt-8 flex flex-wrap items-center gap-3"
            >
              <a
                href="https://t.me/"
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold transition"
                style={{ background: "var(--accent)", color: "var(--accent-ink)" }}
              >
                Start a drive in your chat
                <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
              </a>
              {stats && stats.drives > 0 && (
                <a href={`/d/${stats.drives}`} className="text-sm underline underline-offset-4" style={{ color: "var(--text-muted)" }}>
                  See a live drive
                </a>
              )}
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.7, delay: 0.15 }}
            className="surface rounded-2xl p-4"
          >
            <FlowDiagram className="w-full" />
          </motion.div>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <Reveal>
            <h2 className="font-display text-3xl tracking-tight md:text-4xl">Remittance breaks on arrival, not on FX.</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <Reveal delay={0.05}>
              <div className="surface h-full rounded-2xl p-6">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--pending)" }}>
                  Sent to a person
                </p>
                <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  The transfer succeeds. The school is still unpaid, the light is still off, and the treasurer has stopped
                  answering.
                </p>
              </div>
            </Reveal>
            <Reveal delay={0.12}>
              <div className="surface h-full rounded-2xl p-6">
                <p className="text-xs uppercase tracking-widest" style={{ color: "var(--accent)" }}>
                  Earmarked
                </p>
                <p className="mt-3 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  The destination is fixed before the first payment. Every share lands there directly, and the group can
                  see it.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <Reveal>
            <h2 className="font-display text-3xl tracking-tight md:text-4xl">Four moves, inside the chat.</h2>
          </Reveal>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <Reveal key={s.title} delay={i * 0.07}>
                <div className="surface flex h-full gap-4 rounded-2xl p-5">
                  <div
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                    style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", color: "var(--accent)" }}
                  >
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                      {s.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </section>

        <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
          <div className="grid gap-8 md:grid-cols-2 md:items-center">
            <Reveal>
              <h2 className="font-display text-3xl tracking-tight md:text-4xl">No custody, by construction.</h2>
              <p className="mt-4 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                There is no withdraw function and no admin key that can redirect a drive. The contract never holds a
                balance, so there is nothing to run away with.
              </p>
              <div className="mt-6 flex flex-wrap gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
                {["Fee abstraction", "x402", "ERC-8004", "Attribution tags"].map((t) => (
                  <span key={t} className="surface rounded-full px-3 py-1">
                    {t}
                  </span>
                ))}
              </div>
            </Reveal>
            <Reveal delay={0.1}>
              <pre
                className="surface overflow-x-auto rounded-2xl p-5 text-[12.5px] leading-relaxed"
                style={{ color: "var(--text-muted)" }}
              >
                <code>{`function contribute(uint256 id, uint256 amount, string memo) {
  Drive storage d = _drives[id];
  d.raised += amount;
  IERC20(d.token).safeTransferFrom(
    msg.sender,
    `}<span style={{ color: "var(--accent)" }}>d.destination</span>{`,
    amount
  );
}`}</code>
              </pre>
            </Reveal>
          </div>
        </section>

        {stats && (
          <section className="border-t py-16" style={{ borderColor: "var(--line)" }}>
            <div className="grid gap-4 sm:grid-cols-3">
              {[
                { label: "Drives", value: stats.drives, icon: Landmark },
                { label: "Payments", value: stats.payments, icon: Receipt },
                { label: "Distinct payers", value: stats.payers, icon: Users },
              ].map((s, i) => (
                <Reveal key={s.label} delay={i * 0.08}>
                  <div className="surface rounded-2xl p-6">
                    <s.icon className="h-5 w-5" style={{ color: "var(--accent)" }} />
                    <p className="mt-3 font-display text-4xl">
                      <Counter to={s.value} />
                    </p>
                    <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
                      {s.label}
                    </p>
                  </div>
                </Reveal>
              ))}
            </div>
          </section>
        )}
      </main>
    </Shell>
  );
}
