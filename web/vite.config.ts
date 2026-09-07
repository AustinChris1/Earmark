import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { "/api": "http://localhost:3010" },
    // The docs pages are imported ?raw from the repo root, outside this workspace.
    fs: { allow: [".."] },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
