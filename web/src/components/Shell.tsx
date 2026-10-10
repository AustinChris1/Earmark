import { Link, NavLink } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { Wordmark } from "../brand/Logo";
import { useTheme } from "../lib/theme";

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className="rounded-lg px-2 py-1 text-sm font-medium transition-colors"
      style={({ isActive }) => ({ color: isActive ? "var(--text)" : "var(--text-muted)" })}
    >
      {children}
    </NavLink>
  );
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { theme, toggle } = useTheme();
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 backdrop-blur-md" style={{ background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-5 sm:py-4">
          <Link to="/" aria-label="Earmark home" className="min-w-0 rounded-lg">
            <Wordmark className="gap-2 [&_.font-display]:text-[1.35rem] sm:[&_.font-display]:text-[1.6rem]" />
          </Link>
          <nav className="flex shrink-0 items-center gap-0.5 sm:gap-1" aria-label="Site">
            <NavItem to="/app">Drives</NavItem>
            <NavItem to="/docs">Docs</NavItem>
            <button
              onClick={toggle}
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              className="surface pressable ml-2 rounded-full p-2"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </nav>
        </div>
      </header>
      {children}
      <footer className="mx-auto max-w-6xl px-5 pt-12 pb-10 text-sm" style={{ color: "var(--text-muted)" }}>
        <div className="h-px w-full" style={{ background: "var(--line)" }} />
        <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 pt-6">
          <Wordmark className="gap-2 [&_.font-display]:text-[1.35rem]" />
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Footer">
            <a href="https://t.me/Earmarked_bot" className="rounded hover:underline">Telegram</a>
            <Link to="/app" className="rounded hover:underline">Drives</Link>
            <Link to="/docs" className="rounded hover:underline">Docs</Link>
            <Link to="/docs/faq" className="rounded hover:underline">FAQ</Link>
            <Link to="/docs/privacy" className="rounded hover:underline">Privacy</Link>
          </nav>
        </div>
        <p className="max-w-[68ch] pt-5 text-[13px]">
          A wallet drive pays the locked address in the same transaction. A bill drive holds the pool only until the
          provider is paid. Photographs from Unsplash.
        </p>
      </footer>
    </div>
  );
}
