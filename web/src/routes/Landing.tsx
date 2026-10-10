import { useEffect, useId, useState } from "react";
import { animated } from "@react-spring/web";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  ChevronDown,
  Globe2,
  GraduationCap,
  Home,
  Lock,
  MessagesSquare,
  Trophy,
  Users,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { Shell } from "../components/Shell";
import { FlowDiagram } from "../components/FlowDiagram";
import { Counter } from "../components/Counter";
import { useLift } from "../lib/springs";
import { getStats, type Stats } from "../lib/api";

const AGENT_ID = 9806;
const CONTRACT = "0x93316de31b4f891c56cf3b65a3f96aa6b04192ae";
const HACKATHON_URL = "https://celobuilders.xyz/hackathons/agents-at-work";
const SOURCE_URL = "https://repo.sourcify.dev/42220/0x93316DE31b4f891C56cf3b65A3f96AA6b04192Ae";
const BOT_URL = "https://t.me/Earmarked_bot";

// What a drive can pay, each with the photograph that says it faster than a sentence.
const BILLS: { img: string; alt: string; icon: LucideIcon; title: string; line: string; big?: boolean }[] = [
  {
    img: "/images/compound.webp",
    alt: "A house with washing drying out front",
    icon: Home,
    title: "Rent",
    line: "Locked to the landlord's wallet",
    big: true,
  },
  { img: "/images/meter.webp", alt: "A prepaid electricity meter on a wall", icon: Zap, title: "Light", line: "Earmark pays the meter itself" },
  { img: "/images/school.webp", alt: "Two smiling schoolboys in uniform", icon: GraduationCap, title: "School fees", line: "Straight to the school" },
  {
    img: "/images/buenos-aires.webp",
    alt: "A street in Buenos Aires with a fruit stand",
    icon: Globe2,
    title: "Airtime abroad",
    line: "A phone in 140+ countries",
  },
];

const STEPS: { icon: LucideIcon; title: string; line: string }[] = [
  { icon: MessagesSquare, title: "Name the bill", line: "In your group chat" },
  { icon: Users, title: "Everyone pays", line: "From a link, any wallet" },
  { icon: Lock, title: "It lands there", line: "And only there" },
];

// Each coin a share can be paid in, shown as the money people actually hold.
const COINS: { img: string; coin: string; money: string }[] = [
  { img: "/flags/ng.svg", coin: "cNGN", money: "Naira" },
  { img: "/flags/ar.svg", coin: "wARS", money: "Pesos" },
  { img: "/flags/br.svg", coin: "wBRL", money: "Reais" },
  { img: "/logos/tether.svg", coin: "USD₮", money: "Dollars" },
  { img: "/flags/us.svg", coin: "USA₮", money: "Dollars" },
];

const RAILS: { img: string; name: string; what: string }[] = [
  { img: "/logos/celo.png", name: "Celo", what: "Settles every share" },
  { img: "/logos/tether.svg", name: "Tether", what: "USD₮ and USA₮" },
  { img: "/logos/textile.svg", name: "Textile FX", what: "Swaps local money" },
  { img: "/logos/ripio.png", name: "Ripio", what: "Pesos and reais in and out" },
  { img: "/logos/abapay.png", name: "AbaPay", what: "Pays bills over x402" },
  { img: "/logos/telegram.svg", name: "Telegram", what: "Where the group lives" },
  { img: "/logos/minipay.png", name: "MiniPay", what: "Pay from the phone" },
  { img: "/logos/metamask.svg", name: "MetaMask", what: "Or any Celo wallet" },
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does Earmark hold the money?",
    a: "On a wallet drive, no: your payment goes to the locked address in the same transaction. On a bill drive, briefly: the pool waits in Earmark's wallet until the meter or phone is paid, then anything unused comes back.",
  },
  { q: "Can the destination change?", a: "No. It is written once. The contract has no owner and no withdraw." },
  { q: "What if the bill cannot be paid?", a: "Everyone who paid into that bill drive gets their share back." },
  {
    q: "Which money?",
    a: "A drive collects one coin. A USD₮ drive can also be paid in pesos, reais or naira; Earmark swaps them in.",
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
          <p className="max-w-[62ch] pb-5 text-[15px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
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

function BillTile({ bill, className = "" }: { bill: (typeof BILLS)[number]; className?: string }) {
  const Icon = bill.icon;
  return (
    <figure className={`tile group relative overflow-hidden rounded-2xl ${className}`}>
      <img
        src={bill.img}
        alt={bill.alt}
        loading="lazy"
        decoding="async"
        className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
        style={{ transitionTimingFunction: "var(--ease-out)" }}
      />
      {/* A scrim from the photo's own darkness, so the caption reads on any picture. */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/75 via-black/30 to-transparent" />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end gap-3 p-4 text-white md:p-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-2xl leading-none md:text-[1.75rem]">{bill.title}</span>
          <span className="mt-1 block text-[13px] text-white/85">{bill.line}</span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Landing() {
  const [stats, setStats] = useState<Stats | null>(null);
  const cta = useLift(2);
  const cta2 = useLift(2);
  const contract = stats?.earmark ?? CONTRACT;

  useEffect(() => {
    getStats().then(setStats).catch(() => setStats(null));
  }, []);

  return (
    <Shell>
      <main>
        {/* Hero: the promise on the left, the people and the mechanism on the right. */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pt-8 pb-20 md:grid-cols-[1fr_1.05fr] md:gap-10 md:pt-14 md:pb-28">
          <div className="max-w-xl">
            <h1 className="font-display text-[3.1rem] leading-[1.02] tracking-[-0.02em] text-balance md:text-[4.6rem]">
              Money that carries <span className="highlight px-2">its destination.</span>
            </h1>
            <p className="mt-6 max-w-sm text-[17px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Your group names one bill. Every share can only land where you locked it.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
              <animated.a
                {...cta.bind}
                style={{ ...cta.style, background: "var(--brand)", color: "var(--brand-ink)" }}
                href={BOT_URL}
                className="group inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-semibold shadow-[0_8px_20px_-10px_rgb(0_0_0/0.35)]"
              >
                Start in Telegram
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </animated.a>
              <a href="/app" className="rounded-lg text-[15px] font-medium underline underline-offset-4" style={{ color: "var(--text)" }}>
                Open a drive on the web
              </a>
            </div>
            <ul className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm" style={{ color: "var(--text-muted)" }}>
              <li className="flex items-center gap-2">
                <Trophy className="h-4 w-4" style={{ color: "var(--accent)" }} />
                Best Stablecoin Adoption
              </li>
              <li className="flex items-center gap-2">
                <img src="/logos/celo.png" alt="" className="h-4 w-4 rounded" />
                Live on Celo
              </li>
            </ul>
          </div>

          <div className="relative mx-auto w-full max-w-[34rem] md:mx-0 md:justify-self-end">
            <div className="overflow-hidden rounded-[1.75rem] shadow-[0_30px_60px_-30px_rgb(0_0_0/0.45)]">
              <img
                src="/images/friends.webp"
                alt="Two friends laughing over a phone"
                width={1800}
                height={1200}
                fetchPriority="high"
                className="aspect-[4/5] w-full object-cover object-[60%_center] md:aspect-[5/6]"
              />
            </div>
            <div
              className="absolute top-5 right-5 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold shadow-[0_8px_18px_-8px_rgb(0_0_0/0.4)]"
              style={{ background: "var(--bg-raised)", color: "var(--text)" }}
            >
              <Lock className="h-3.5 w-3.5" style={{ color: "var(--accent)" }} />
              Locked at creation
            </div>
            {/* The mechanism, alive: three shares, one locked place, a diversion that bounces off. */}
            <div
              className="absolute -bottom-10 left-3 w-[78%] rounded-2xl p-3 shadow-[0_24px_48px_-20px_rgb(0_0_0/0.5)] sm:left-5 md:-left-10 md:w-[72%]"
              style={{ background: "var(--bg-raised)" }}
            >
              <FlowDiagram className="w-full" large />
            </div>
          </div>
        </section>

        {/* What a drive can pay */}
        <section className="py-20" style={{ background: "var(--bg-sunken)" }}>
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-4xl tracking-[-0.02em] text-balance md:text-5xl">One bill. Everyone's share.</h2>
            <div className="mt-10 grid grid-cols-2 gap-3 md:h-[34rem] md:grid-cols-3 md:grid-rows-2 md:gap-4">
              <BillTile bill={BILLS[0]} className="col-span-2 h-72 md:col-span-1 md:row-span-2 md:h-auto" />
              <BillTile bill={BILLS[1]} className="h-56 md:h-auto" />
              <BillTile bill={BILLS[2]} className="h-56 md:h-auto" />
              <BillTile bill={BILLS[3]} className="col-span-2 h-56 md:h-auto" />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="font-display text-4xl tracking-[-0.02em] md:text-5xl">Three steps.</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-3 sm:gap-6">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex items-start gap-4 sm:flex-col sm:gap-5">
                  <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                    <Icon className="h-6 w-6" strokeWidth={2} />
                    <span
                      className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                      style={{ background: "var(--text)", color: "var(--bg)" }}
                      aria-hidden="true"
                    >
                      {i + 1}
                    </span>
                  </span>
                  <span>
                    <span className="block text-lg font-semibold">{s.title}</span>
                    <span className="mt-0.5 block text-[15px]" style={{ color: "var(--text-muted)" }}>
                      {s.line}
                    </span>
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Pay in your own money */}
        <section className="mx-auto max-w-6xl px-5 pb-20">
          <div className="grid items-center gap-10 overflow-hidden rounded-[1.75rem] md:grid-cols-2" style={{ background: "var(--accent-soft)" }}>
            <img
              src="/images/phone-yellow.webp"
              alt="A woman smiling at her phone"
              loading="lazy"
              decoding="async"
              className="h-72 w-full object-cover object-top md:h-full md:min-h-[26rem]"
            />
            <div className="px-6 pb-10 md:px-2 md:py-12 md:pr-12">
              <h2 className="font-display text-4xl tracking-[-0.02em] text-balance md:text-5xl">Pay in your own money.</h2>
              <p className="mt-3 text-[15px]" style={{ color: "var(--text-muted)" }}>
                Earmark swaps it into the drive's coin.
              </p>
              <ul className="mt-7 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {COINS.map((c) => (
                  <li key={c.coin} className="flex items-center gap-2.5 rounded-xl px-3 py-2.5" style={{ background: "var(--bg-raised)" }}>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-black/5">
                      <img src={c.img} alt="" className={c.img.includes("/flags/") ? "h-full w-full object-cover" : "h-5 w-5"} />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block text-sm font-semibold">{c.money}</span>
                      <span className="block text-xs tabular-nums" style={{ color: "var(--text-muted)" }}>
                        {c.coin}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* The rails it runs on */}
        <section className="border-y py-16" style={{ borderColor: "var(--line)" }}>
          <div className="mx-auto max-w-6xl px-5">
            <h2 className="font-display text-3xl tracking-[-0.02em] md:text-4xl">Built on open rails.</h2>
            <ul className="mt-8 grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4">
              {RAILS.map((r) => (
                <li key={r.name} className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white ring-1 ring-black/5">
                    <img src={r.img} alt="" className="h-7 w-7 object-contain" />
                  </span>
                  <span className="min-w-0 leading-tight">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="block text-[13px]" style={{ color: "var(--text-muted)" }}>
                      {r.what}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Questions people ask before they send money */}
        <section id="faq" className="mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 className="font-display text-4xl tracking-[-0.02em] md:text-5xl">Before you pay.</h2>
            <a href="/docs/faq" className="mt-4 inline-flex items-center gap-1 rounded text-sm underline underline-offset-4" style={{ color: "var(--accent)" }}>
              Every question <ArrowUpRight className="h-3.5 w-3.5" />
            </a>
          </div>
          <div className="border-b" style={{ borderColor: "var(--line)" }}>
            {FAQ.map((item) => (
              <FaqItem key={item.q} q={item.q} a={item.a} />
            ))}
          </div>
        </section>

        {/* Proof, then the one thing to do next */}
        <section className="mx-auto max-w-6xl px-5 pb-8">
          <div className="relative overflow-hidden rounded-[1.75rem] px-6 py-12 md:px-12 md:py-14" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
            <div className="grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-end">
              <div>
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Trophy className="h-4 w-4" /> Best Stablecoin Adoption, Celo Agents at Work
                </p>
                <h2 className="mt-4 font-display text-4xl leading-[1.05] tracking-[-0.02em] text-balance md:text-6xl">
                  Name the bill. Lock the place.
                </h2>
                {stats && stats.payments > 0 && (
                  <p className="mt-4 text-[15px]">
                    <Counter to={stats.payments} className="font-bold" /> {stats.payments === 1 ? "payment" : "payments"} from{" "}
                    <Counter to={stats.payers} className="font-bold" /> {stats.payers === 1 ? "person" : "people"} so far.
                  </p>
                )}
                <animated.a
                  {...cta2.bind}
                  style={{ ...cta2.style, background: "var(--brand-ink)", color: "var(--brand)" }}
                  href={BOT_URL}
                  className="group mt-8 inline-flex items-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-semibold"
                >
                  Start in Telegram
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </animated.a>
              </div>
              <ul className="grid gap-2 text-sm">
                {[
                  { href: `https://celoscan.io/address/${contract}`, label: "Contract", value: short(contract) },
                  { href: SOURCE_URL, label: "Source", value: "Verified, exact match" },
                  { href: `https://8004scan.io/agents/celo/${AGENT_ID}`, label: "Agent identity", value: `ERC-8004 #${AGENT_ID}` },
                  { href: HACKATHON_URL, label: "Award", value: "Celo Builders" },
                ].map((p) => (
                  <li key={p.label}>
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center justify-between gap-4 rounded-xl px-4 py-3 transition-colors"
                      style={{ background: "rgb(10 10 8 / 0.07)" }}
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <BadgeCheck className="h-4 w-4" /> {p.label}
                      </span>
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        {p.value}
                        <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>
    </Shell>
  );
}
