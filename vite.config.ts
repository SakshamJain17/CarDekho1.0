import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig(({ mode }) => ({
  base: "./",
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  server: { proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } } },
  preview: { proxy: { "/api": { target: "http://127.0.0.1:8000", changeOrigin: true } } },
  build: {
    outDir: "dist",
    rollupOptions: { input: (mode === "performance" ? { performance: fileURLToPath(new URL("./performance/index.html", import.meta.url)), presenter: fileURLToPath(new URL("./presenter/index.html", import.meta.url)) } : { main: fileURLToPath(new URL("./index.html", import.meta.url)), ai: fileURLToPath(new URL("./ai/index.html", import.meta.url)), performance: fileURLToPath(new URL("./performance/index.html", import.meta.url)), presenter: fileURLToPath(new URL("./presenter/index.html", import.meta.url)) }) as Record<string, string> },
  },
}));
