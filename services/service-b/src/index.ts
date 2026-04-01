import express from "express";

const app = express();
const PORT = process.env.PORT || 3001;

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-b" });
});

app.get("/info", (_req, res) => {
  res.json({ service: "service-b", timestamp: Date.now(), data: { version: "1.0.0" } });
});

app.listen(PORT, () => {
  console.log(`service-b listening on port ${PORT}`);
});
