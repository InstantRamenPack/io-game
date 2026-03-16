import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

const clientRoot = dirname(fileURLToPath(import.meta.url));
const sharedRoot = resolve(clientRoot, "../../packages/shared/src");
const backendTarget =
  process.env.VITE_BACKEND_TARGET ?? "http://127.0.0.1:3000";

export default defineConfig({
  root: clientRoot,
  resolve: {
    alias: {
      "@client": resolve(clientRoot, "src"),
      "@shared": sharedRoot,
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    fs: {
      allow: [clientRoot, sharedRoot],
    },
    proxy: {
      "/runtime-config": {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      "/healthz": {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
      },
      "/ws": {
        target: backendTarget,
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
