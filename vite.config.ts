import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
// Served at bklt.ai/h2h/ (proxied from the bklt-mvp project). Build output
// goes to dist/h2h so the deployment's file paths match the public URLs.
export const BASE = "/h2h/";

export default defineConfig(() => ({
  base: BASE,
  build: {
    outDir: "dist/h2h",
    emptyOutDir: true,
  },
  server: {
    host: true,
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
