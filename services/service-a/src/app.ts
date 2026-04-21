import express from "express";

const SERVICE_B_URL = process.env.SERVICE_B_URL ?? "";
const SERVICE_C_URL = process.env.SERVICE_C_URL ?? "";

export const app = express();
app.use(express.json());

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

app.post("/classify", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Request body must include a 'text' field (string)" });
    return;
  }

  try {
    const response = await fetch(`${SERVICE_C_URL}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json();
    res.json({ source: "service-a", classification: data });
  } catch {
    res.status(502).json({ error: "Failed to reach service-c" });
  }
});
