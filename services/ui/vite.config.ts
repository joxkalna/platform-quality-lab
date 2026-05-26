import react from "@vitejs/plugin-react";
import type { HttpProxy } from "vite";
import { defineConfig } from "vite";
import type { IncomingMessage, ServerResponse } from "node:http";

const onProxyError = (err: Error, _req: IncomingMessage, res: ServerResponse) => {
  if (!res.headersSent) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: `Proxy error: ${err.message}` }));
  }
};

const proxyOpts = (target: string, rewrite: (p: string) => string) => ({
  target,
  changeOrigin: true,
  rewrite,
  configure: (proxy: HttpProxy.Server) => {
    proxy.on("error", onProxyError as Parameters<HttpProxy.Server["on"]>[1]);
  },
});

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api-b": proxyOpts("http://localhost:3001", (p) => p.replace(/^\/api-b/, "")),
      "/api-c": proxyOpts("http://localhost:3002", (p) => p.replace(/^\/api-c/, "")),
      "/api": proxyOpts("http://localhost:3000", (p) => p.replace(/^\/api/, "")),
    },
  },
});
