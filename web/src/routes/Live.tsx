import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Shell } from "../components/Shell";
import { getStats } from "../lib/api";

/** Resolves to an open drive. /d/1 is a closed 0xdead wiring test and must not be shown. */
export function LivePage() {
  const nav = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getStats()
      .then((s) => {
        if (s.featured?.id) nav(`/d/${s.featured.id}`, { replace: true });
        else setError("No open drive on chain yet.");
      })
      .catch((e: Error) => setError(e.message));
  }, [nav]);

  return (
    <Shell>
      <main className="mx-auto max-w-lg px-5 py-16" style={{ color: "var(--text-muted)" }}>
        {error ? error : (
          <p className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Opening a live drive
          </p>
        )}
      </main>
    </Shell>
  );
}
