import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { defineConfig } from "vite";

function parseIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (rawValue === undefined) {
    return fallback;
  }

  const parsedValue = Number(rawValue);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new Error(
      `[vite] invalid ${name} value "${rawValue}". Expected a positive integer.`,
    );
  }

  return parsedValue;
}

const clientRoot = dirname(fileURLToPath(import.meta.url));
const sharedRoot = resolve(clientRoot, "../../packages/shared/src");
const serverHost = process.env.VITE_HOST ?? "0.0.0.0";
const serverPort = parseIntegerEnv("VITE_PORT", 5173);
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
    host: serverHost,
    port: serverPort,
    strictPort: true,
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
