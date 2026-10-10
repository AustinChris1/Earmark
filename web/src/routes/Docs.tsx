import { useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { marked } from "marked";
import { Shell } from "../components/Shell";

// The site renders the repo's own docs, so the two can never drift apart.
import overview from "../../../docs/README.md?raw";
import howItWorks from "../../../docs/how-it-works.md?raw";
import usage from "../../../docs/usage.md?raw";
import architecture from "../../../docs/architecture.md?raw";
import faq from "../../../docs/faq.md?raw";

const PAGES = [
  { slug: "", title: "Overview", body: overview },
  { slug: "how-it-works", title: "How it works", body: howItWorks },
  { slug: "usage", title: "Using it", body: usage },
  { slug: "architecture", title: "Architecture", body: architecture },
  { slug: "faq", title: "FAQ", body: faq },
] as const;

// Links between the markdown files must become routes, and the repo's own headings become anchors.
function rewrite(html: string): string {
  return html
    .replace(/href="\.\/README\.md"/g, 'href="/docs"')
    .replace(/href="\.\/([a-z-]+)\.md"/g, 'href="/docs/$1"')
    .replace(/href="([a-z-]+)\.md"/g, 'href="/docs/$1"');
}

export function DocsPage() {
  const { page } = useParams();
  const navigate = useNavigate();
  const current = PAGES.find((p) => p.slug === (page ?? "")) ?? PAGES[0];

  const html = useMemo(() => rewrite(marked.parse(current.body, { async: false }) as string), [current]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [current.slug]);

  return (
    <Shell>
      <main className="mx-auto max-w-5xl px-5 pb-20">
        <div className="pt-8">
          <h1 className="font-display text-4xl tracking-tight">Docs</h1>
        </div>

        <div className="mt-8 grid gap-8 md:grid-cols-[13rem_minmax(0,1fr)] md:items-start">
          <nav className="flex flex-wrap gap-2 md:sticky md:top-24 md:flex-col">
            {PAGES.map((p) => {
              const active = p.slug === current.slug;
              return (
                <button
                  key={p.slug || "overview"}
                  onClick={() => navigate(p.slug ? `/docs/${p.slug}` : "/docs")}
                  className="pressable rounded-xl px-3 py-2 text-left text-sm"
                  style={{
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {p.title}
                </button>
              );
            })}
          </nav>

          <motion.article
            key={current.slug}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="prose-earmark min-w-0"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </main>
    </Shell>
  );
}
