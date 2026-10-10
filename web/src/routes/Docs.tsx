import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion, useScroll, useSpring } from "framer-motion";
import { marked } from "marked";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Clock,
  Cpu,
  HelpCircle,
  ListTree,
  Shield,
  Sparkles,
  Workflow,
  X,
  type LucideIcon,
} from "lucide-react";
import { Shell } from "../components/Shell";

// The site renders the repo's own docs, so the two can never drift apart.
import overview from "../../../docs/README.md?raw";
import howItWorks from "../../../docs/how-it-works.md?raw";
import usage from "../../../docs/usage.md?raw";
import architecture from "../../../docs/architecture.md?raw";
import faq from "../../../docs/faq.md?raw";
import privacy from "../../../docs/privacy.md?raw";

type Page = { slug: string; title: string; blurb: string; icon: LucideIcon; cover?: string; body: string };

const PAGES: Page[] = [
  { slug: "", title: "Overview", blurb: "What Earmark is, and the one limit worth knowing.", icon: Sparkles, cover: "/images/friends.webp", body: overview },
  { slug: "how-it-works", title: "How it works", blurb: "What happens to a payment, from the chat to the meter.", icon: Workflow, cover: "/images/compound.webp", body: howItWorks },
  { slug: "usage", title: "Using it", blurb: "The buttons, the website, and how to test it.", icon: BookOpen, cover: "/images/phone-yellow.webp", body: usage },
  { slug: "architecture", title: "Architecture", blurb: "The contract, the agent, and how held money is kept safe.", icon: Cpu, cover: "/images/meter.webp", body: architecture },
  { slug: "faq", title: "FAQ", blurb: "What people ask before they send money.", icon: HelpCircle, cover: "/images/house-chat.webp", body: faq },
  { slug: "privacy", title: "Privacy and terms", blurb: "What Earmark keeps, and what is public on the chain.", icon: Shield, body: privacy },
];

// Heading text arrives HTML-escaped ("don&#39;t"); the outline shows it as written.
function decode(s: string): string {
  const t = document.createElement("textarea");
  t.innerHTML = s;
  return t.value;
}

const slugify = (s: string) =>
  s
    .replace(/<[^>]+>/g, "")
    .replace(/&[a-z#0-9]+;/gi, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * Markdown to the page: the leading # title moves into the cover, each ## gets an anchor for the
 * outline, and links between the markdown files become routes.
 */
function render(body: string) {
  const md = body.replace(/^# .*\n+/, "");
  const toc: { id: string; text: string }[] = [];
  const html = (marked.parse(md, { async: false }) as string)
    .replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
      const id = slugify(inner);
      toc.push({ id, text: decode(inner.replace(/<[^>]+>/g, "")) });
      return `<h2 id="${id}"><a href="#${id}" class="anchor">${inner}</a></h2>`;
    })
    .replace(/<table>/g, '<div class="table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>")
    .replace(/href="\.\/README\.md"/g, 'href="/docs"')
    .replace(/href="\.\/([a-z-]+)\.md"/g, 'href="/docs/$1"')
    .replace(/href="([a-z-]+)\.md"/g, 'href="/docs/$1"')
    .replace(/<a href="(https?:[^"]+)"/g, '<a href="$1" target="_blank" rel="noreferrer"');
  const words = md.split(/\s+/).length;
  return { html, toc, minutes: Math.max(1, Math.round(words / 220)) };
}

const href = (p: Page) => (p.slug ? `/docs/${p.slug}` : "/docs");

function PageList({ current, onPick }: { current: Page; onPick?: () => void }) {
  return (
    <ul className="grid gap-0.5">
      {PAGES.map((p) => {
        const active = p.slug === current.slug;
        const Icon = p.icon;
        return (
          <li key={p.slug || "overview"}>
            <Link
              to={href(p)}
              onClick={onPick}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] transition-colors"
              style={{
                background: active ? "var(--accent-soft)" : "transparent",
                color: active ? "var(--accent)" : "var(--text-muted)",
                fontWeight: active ? 600 : 500,
              }}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {p.title}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Outline({ toc, active, onPick }: { toc: { id: string; text: string }[]; active: string; onPick?: () => void }) {
  if (!toc.length) return null;
  return (
    <ul className="grid gap-0.5 border-l" style={{ borderColor: "var(--line)" }}>
      {toc.map((h) => (
        <li key={h.id}>
          <a
            href={`#${h.id}`}
            onClick={onPick}
            className="-ml-px block border-l-2 py-1.5 pl-3 text-sm leading-snug transition-colors"
            style={{
              borderColor: h.id === active ? "var(--accent)" : "transparent",
              color: h.id === active ? "var(--text)" : "var(--text-muted)",
              fontWeight: h.id === active ? 600 : 400,
            }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function DocsPage() {
  const { page } = useParams();
  const current = PAGES.find((p) => p.slug === (page ?? "")) ?? PAGES[0];
  const index = PAGES.indexOf(current);
  const prev = PAGES[index - 1];
  const next = PAGES[index + 1];
  const { html, toc, minutes } = useMemo(() => render(current.body), [current]);
  const [drawer, setDrawer] = useState(false);
  const [active, setActive] = useState("");
  const still = useReducedMotion();

  // How far through the page the reader is, as a line under the bar.
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 32, restDelta: 0.001 });

  useEffect(() => {
    window.scrollTo({ top: 0 });
    setDrawer(false);
  }, [current.slug]);

  // The section being read is the last heading that has scrolled past the bars.
  // Headings are looked up on every pass: the article's DOM can be replaced while the page is open.
  useEffect(() => {
    if (!toc.length) return;
    const pick = () => {
      let id = toc[0].id;
      for (const h of toc) {
        const e = document.getElementById(h.id);
        if (e && e.getBoundingClientRect().top < 140) id = h.id;
      }
      setActive(id);
    };
    pick();
    window.addEventListener("scroll", pick, { passive: true });
    return () => window.removeEventListener("scroll", pick);
  }, [toc]);

  // The drawer owns the screen while it is open: no scrolling underneath, Escape closes it.
  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawer(false);
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [drawer]);

  const Icon = current.icon;

  return (
    <Shell>
      {/* Phone: the docs bar stays pinned under the header, so the contents are one tap away anywhere. */}
      <div
        className="sticky top-[3.6rem] z-20 border-b backdrop-blur-md sm:top-16 md:hidden"
        style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", borderColor: "var(--line)" }}
      >
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          aria-controls="docs-drawer"
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
            <ListTree className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
              Docs
            </span>
            <span className="block truncate text-[15px] font-semibold">
              {toc.find((h) => h.id === active)?.text ?? current.title}
            </span>
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--accent)" }}>
            Contents
          </span>
        </button>
        <motion.div className="h-0.5 origin-left" style={{ scaleX: progress, background: "var(--accent)" }} />
      </div>

      {/* Desktop keeps the same progress line, under the header. */}
      <motion.div
        aria-hidden="true"
        className="fixed inset-x-0 top-0 z-40 hidden h-0.5 origin-left md:block"
        style={{ scaleX: progress, background: "var(--accent)" }}
      />

      <AnimatePresence>
        {drawer && (
          <>
            <motion.div
              key="scrim"
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "rgb(0 0 0 / 0.45)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDrawer(false)}
            />
            <motion.aside
              key="drawer"
              id="docs-drawer"
              role="dialog"
              aria-modal="true"
              aria-label="Docs contents"
              className="fixed inset-y-0 left-0 z-50 flex w-[86vw] max-w-sm flex-col overflow-y-auto p-5 shadow-[12px_0_40px_-12px_rgb(0_0_0/0.4)] md:hidden"
              style={{ background: "var(--bg-raised)" }}
              initial={still ? { opacity: 0 } : { x: "-100%" }}
              animate={still ? { opacity: 1 } : { x: 0 }}
              exit={still ? { opacity: 0 } : { x: "-100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 40 }}
            >
              <div className="flex items-center justify-between">
                <p className="font-display text-2xl">Docs</p>
                <button type="button" onClick={() => setDrawer(false)} aria-label="Close contents" className="pressable -m-2 rounded-full p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="mt-5">
                <PageList current={current} onPick={() => setDrawer(false)} />
              </div>
              {toc.length > 0 && (
                <div className="mt-7">
                  <p className="mb-2 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                    On this page
                  </p>
                  <Outline toc={toc} active={active} onPick={() => setDrawer(false)} />
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="mx-auto grid max-w-6xl gap-10 px-5 pt-6 pb-20 md:grid-cols-[13rem_minmax(0,1fr)] md:pt-10 xl:grid-cols-[13rem_minmax(0,1fr)_12rem]">
        <nav aria-label="Docs" className="hidden md:block">
          <div className="sticky top-24">
            <PageList current={current} />
          </div>
        </nav>

        <div className="min-w-0">
          <motion.header
            key={`cover-${current.slug}`}
            initial={still ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
            className="relative overflow-hidden rounded-[1.5rem]"
            style={{ background: current.cover ? "#0a0a08" : "var(--accent-soft)" }}
          >
            {current.cover && (
              <>
                <img src={current.cover} alt="" className="absolute inset-0 h-full w-full object-cover opacity-80" />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/35 to-black/10" />
              </>
            )}
            <div className={`relative flex min-h-[12rem] flex-col justify-end p-6 md:min-h-[15rem] md:p-8 ${current.cover ? "text-white" : ""}`}>
              <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl" style={{ background: "var(--brand)", color: "var(--brand-ink)" }}>
                <Icon className="h-5 w-5" />
              </span>
              <h1 className="font-display text-4xl leading-none tracking-[-0.02em] md:text-5xl">{current.title}</h1>
              <p className={`mt-2 max-w-md text-[15px] ${current.cover ? "text-white/85" : ""}`} style={current.cover ? undefined : { color: "var(--text-muted)" }}>
                {current.blurb}
              </p>
              <p className={`mt-3 flex items-center gap-1.5 text-xs ${current.cover ? "text-white/75" : ""}`} style={current.cover ? undefined : { color: "var(--text-muted)" }}>
                <Clock className="h-3.5 w-3.5" /> {minutes} min read
              </p>
            </div>
          </motion.header>

          <motion.article
            key={current.slug}
            initial={still ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="prose-earmark docs-article mt-8 max-w-[72ch]"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <nav aria-label="Next and previous" className="mt-14 grid gap-3 sm:grid-cols-2">
            {prev ? (
              <Link to={href(prev)} className="pressable surface group rounded-2xl p-4">
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  <ArrowLeft className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" /> Previous
                </span>
                <span className="mt-1 block font-semibold">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link to={href(next)} className="pressable surface group rounded-2xl p-4 text-right">
                <span className="flex items-center justify-end gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  Next <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block font-semibold">{next.title}</span>
              </Link>
            )}
          </nav>
        </div>

        <aside aria-label="On this page" className="hidden xl:block">
          {toc.length > 0 && (
            <div className="sticky top-24">
              <p className="mb-3 text-xs font-semibold tracking-wide uppercase" style={{ color: "var(--text-muted)" }}>
                On this page
              </p>
              <Outline toc={toc} active={active} />
            </div>
          )}
        </aside>
      </main>
    </Shell>
  );
}
