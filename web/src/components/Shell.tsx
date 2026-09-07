import { Link } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { Wordmark } from "../brand/Logo";
import { useTheme } from "../lib/theme";

export function Shell({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}>
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" aria-label="Earmark home">
            <Wordmark />
          </Link>
          <div className="flex items-center gap-3">
          <Link to="/app" className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            Drives
          </Link>
          <Link to="/docs" className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>
            Docs
          </Link>
          <button
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            className="surface rounded-full p-2 transition hover:opacity-80"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
          </div>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-5xl px-5 py-12 text-sm" style={{ color: "var(--text-muted)" }}>
        <div className="h-px w-full" style={{ background: "var(--line)" }} />
        <p className="pt-6">
          Earmark routes every contribution to the locked destination in the same transaction. The contract never holds a
          balance.
        </p>
        <p className="pt-2">Built on Celo for the Agents at Work Hackathon.</p>
      </footer>
    </div>
  );
}
