import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// base "./" = semua path relatif, sehingga situs bisa di-host di subfolder
// GitHub Pages (https://<user>.github.io/<repo>/) tanpa konfigurasi tambahan.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    sourcemap: false, // jangan publikasikan source map di produksi
    outDir: "docs", // GitHub Pages: Settings → Pages → Branch main, folder /docs
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // Worker pdf.js berekstensi .mjs; ganti ke .js agar pasti dilayani
        // sebagai JavaScript oleh hosting statis mana pun.
        assetFileNames: (info) =>
          (info.names?.[0] ?? "").endsWith(".mjs") ? "assets/[name]-[hash].js" : "assets/[name]-[hash][extname]",
      },
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
