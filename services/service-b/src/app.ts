import express from "express";

export const app = express();

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-b" });
});

app.get("/info", (_req, res) => {
  res.json({ service: "service-b", timestamp: Date.now(), data: { version: "1.0.0" } });
});
