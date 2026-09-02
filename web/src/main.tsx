import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Landing } from "./routes/Landing";
import { DrivePage } from "./routes/Drive";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/d/:id" element={<DrivePage />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
