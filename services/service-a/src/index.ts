import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_B_URL = process.env.SERVICE_B_URL || "http://localhost:3001";

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-a" });
});

app.get("/ready", async (_req, res) => {
  try {
    const response = await fetch(`${SERVICE_B_URL}/health`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      res.json({ status: "ready", service: "service-a" });
    } else {
      res.status(503).json({ status: "not ready", reason: "service-b unhealthy" });
    }
  } catch {
    res.status(503).json({ status: "not ready", reason: "service-b unreachable" });
  }
});

app.get("/data", async (_req, res) => {
  try {
    const response = await fetch(`${SERVICE_B_URL}/info`, { signal: AbortSignal.timeout(3000) });
    const data = await response.json();
    res.json({ source: "service-a", downstream: data });
  } catch {
    res.status(502).json({ error: "Failed to reach service-b" });
  }
});

app.listen(PORT, () => {
  console.log(`service-a listening on port ${PORT}`);
});
