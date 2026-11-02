import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { DrivePage } from "./routes/Drive";
import { LivePage } from "./routes/Live";
import { VerifyPage } from "./routes/Verify";
import { AppPage } from "./routes/App";
import { DocsPage } from "./routes/Docs";
import { discoverWallet } from "./lib/wallet";
import { AppToaster, notify } from "./lib/notify";
import { getAddress } from "viem";
import "./index.css";

discoverWallet();

// The wallet's own events, whichever page is open.
window.ethereum?.on?.("accountsChanged", (accounts) => {
  const [a] = (accounts as string[]) ?? [];
  if (a) notify.connected(getAddress(a));
  else notify.info("Wallet disconnected");
});
window.ethereum?.on?.("chainChanged", (id) => {
  if (Number(id) !== 42220) notify.info("Your wallet left Celo", "Earmark will ask to switch back when you pay.");
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/live" element={<LivePage />} />
        <Route path="/d/:id" element={<DrivePage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:page" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
    <AppToaster />
  </StrictMode>,
);
