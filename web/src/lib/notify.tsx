import { useEffect, useState, type CSSProperties } from "react";
import { toast, Toaster } from "sonner";

/**
 * One place for what the site tells people when something happens: a wallet connects, a
 * transaction is signed, lands or fails, a drive opens or closes. Progress stays next to the
 * button that started it; the outcome is a toast, so it is seen wherever the page is scrolled.
 */

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/**
 * Wallets and viem fail with whole request dumps: calldata, arguments, library versions. A person
 * needs one sentence, so this keeps the first useful line and names the common cases plainly.
 */
export function friendlyError(e: unknown, fallback = "Something went wrong."): string {
  const err = (e ?? {}) as { code?: number; shortMessage?: string; message?: string; cause?: { code?: number } };
  const raw = String(err.shortMessage ?? err.message ?? (typeof e === "string" ? e : "") ?? "");
  const code = err.code ?? err.cause?.code;
  if (code === 4001 || /user (rejected|denied|cancel)|rejected the request|request rejected|cancelled|canceled/i.test(raw)) {
    return "You cancelled it in your wallet. Nothing was sent.";
  }
  if (/insufficient funds for (gas|intrinsic)|gas required exceeds/i.test(raw)) {
    return "Your wallet does not have enough for the network fee. Add a little CELO and try again.";
  }
  if (/already pending|-32002/i.test(raw)) return "Your wallet already has a request open. Check the wallet and finish or close it.";
  if (/Failed to fetch|NetworkError|HTTP request failed/i.test(raw)) return "The network did not answer. Check your connection and try again.";
  const cut = raw.split(/\s*(?:Request Arguments:|Request body:|Details:|Contract Call:|Version: viem|URL: )/)[0].trim();
  const text = cut.replace(/^Execution reverted with reason:\s*/i, "The transaction was refused: ");
  if (!text) return fallback;
  return text.length > 180 ? `${text.slice(0, 177)}…` : text;
}

const view = (explorer: string, hash: string, label = "Celoscan") => ({
  label,
  onClick: () => window.open(`${explorer}/tx/${hash}`, "_blank", "noopener,noreferrer"),
});

let announced: string | null = null;

export const notify = {
  /** Once per address per page load; reconnecting the same wallet stays quiet. */
  connected(address: string) {
    if (announced?.toLowerCase() === address.toLowerCase()) return;
    const first = announced === null;
    announced = address;
    toast.success(first ? "Wallet connected" : "Wallet switched", { id: "wallet", description: short(address) });
  },
  error(e: unknown, fallback?: string, opts: { explorer?: string; hash?: string; label?: string } = {}) {
    toast.error(friendlyError(e, fallback), {
      ...(opts.explorer && opts.hash ? { action: view(opts.explorer, opts.hash, opts.label) } : {}),
    });
  },
  success(title: string, description?: string, opts: { explorer?: string; hash?: string; label?: string } = {}) {
    toast.success(title, {
      description,
      ...(opts.explorer && opts.hash ? { action: view(opts.explorer, opts.hash, opts.label) } : {}),
    });
  },
  info(title: string, description?: string) {
    toast(title, { description });
  },

  /**
   * One toast that follows a transaction from the wallet prompt to the chain's answer, updating in
   * place rather than stacking a new toast for every step.
   */
  tx(title: string, explorer: string) {
    const id = toast.loading(title, { description: "Confirm in your wallet." });
    return {
      sent(hash: string) {
        toast.loading(title, { id, description: "Sent. Waiting for Celo to confirm it.", action: view(explorer, hash) });
      },
      done(doneTitle: string, description?: string, hash?: string) {
        toast.success(doneTitle, { id, description, ...(hash ? { action: view(explorer, hash) } : {}) });
      },
      failed(e: unknown, fallback?: string, hash?: string) {
        toast.error(friendlyError(e, fallback), { id, description: undefined, ...(hash ? { action: view(explorer, hash) } : {}) });
      },
      dismiss() {
        toast.dismiss(id);
      },
    };
  },
};

/** Follows the site's own light/dark switch, which lives on <html data-theme>. */
function useDocTheme(): "light" | "dark" {
  const read = (): "light" | "dark" => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  const [theme, setTheme] = useState(read);
  useEffect(() => {
    const o = new MutationObserver(() => setTheme(read()));
    o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => o.disconnect();
  }, []);
  return theme;
}

export function AppToaster() {
  const theme = useDocTheme();
  return (
    <Toaster
      theme={theme}
      position="top-center"
      closeButton
      offset={20}
      mobileOffset={12}
      visibleToasts={4}
      gap={10}
      style={
        {
          // Sonner's own variables, pointed at the site's tokens, so both themes match the page.
          "--normal-bg": "var(--bg-raised)",
          "--normal-text": "var(--text)",
          "--normal-border": "var(--line)",
          "--border-radius": "16px",
          fontFamily: "var(--font-sans)",
        } as CSSProperties
      }
      toastOptions={{ className: "earmark-toast", duration: 5000 }}
    />
  );
}
