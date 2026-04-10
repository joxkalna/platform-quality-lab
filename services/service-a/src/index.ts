import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_B_URL = process.env.SERVICE_B_URL || "http://localhost:3001";

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-a" });
});

app.get("/data", async (_req, res) => {
  try {
    const response = await fetch(`${SERVICE_B_URL}/info`);
    const data = await response.json();
    res.json({ source: "service-a", downstream: data });
  } catch {
    res.status(502).json({ error: "Failed to reach service-b" });
  }
});

app.listen(PORT, () => {
  console.log(`service-a listening on port ${PORT}`);
});
