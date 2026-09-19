import { useEffect, useState } from "react";
import QRCode from "qrcode";

/**
 * Shown only when the page has no wallet of its own (a laptop, usually). The code is this exact
 * URL, personal parameters included, so the phone that scans it lands on the same share.
 */
export function PayQr() {
  const [src, setSrc] = useState("");
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(window.location.href, { width: 320, margin: 1, errorCorrectionLevel: "M" })
      .then((s) => !cancelled && setSrc(s))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  if (!src) return null;
  return (
    <div className="mt-4 flex items-center gap-4 rounded-xl p-3" style={{ border: "1px solid var(--line)" }}>
      <img src={src} alt="QR code for this pay page" width={112} height={112} className="rounded-lg" />
      <div className="min-w-0 text-sm" style={{ color: "var(--text-muted)" }}>
        <p className="font-semibold" style={{ color: "var(--text)" }}>
          No wallet in this browser.
        </p>
        <p className="mt-1 leading-relaxed">
          Scan this with the browser inside your phone's wallet (MetaMask, Rabby, Valora) and pay there.
        </p>
      </div>
    </div>
  );
}
