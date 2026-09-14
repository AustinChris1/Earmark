import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // EARMARK_API=https://earmark-agent.onrender.com lets the UI be worked on against the live API.
    proxy: { "/api": { target: process.env.EARMARK_API ?? "http://localhost:3010", changeOrigin: true } },
    // The docs pages are imported ?raw from the repo root, outside this workspace.
    fs: { allow: [".."] },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
