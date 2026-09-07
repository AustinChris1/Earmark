import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { DrivePage } from "./routes/Drive";
import { VerifyPage } from "./routes/Verify";
import { AppPage } from "./routes/App";
import { DocsPage } from "./routes/Docs";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/d/:id" element={<DrivePage />} />
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/app" element={<AppPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/docs/:page" element={<DocsPage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
