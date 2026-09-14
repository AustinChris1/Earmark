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
        <div className="mx-auto flex max-w-5xl items-center justify-between px-5 py-4">
          <Link to="/" aria-label="Earmark home" className="rounded-lg">
            <Wordmark />
          </Link>
          <nav className="flex items-center gap-1" aria-label="Site">
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
