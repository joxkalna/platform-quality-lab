import express from "express";
import { loadConfig } from "./config";
import { classify } from "./llm";

const config = loadConfig();
export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-c" });
});

app.get("/ready", async (_req, res) => {
  try {
    const response = await fetch(`${config.llmEndpoint}/api/tags`, {
      signal: AbortSignal.timeout(2000),
    });
    if (response.ok) {
      res.json({ status: "ready", service: "service-c" });
    } else {
      res.status(503).json({ status: "not ready", reason: "llm unhealthy" });
    }
  } catch {
    res.status(503).json({ status: "not ready", reason: "llm unreachable" });
  }
});

app.post("/classify", async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string") {
    res.status(400).json({ error: "Request body must include a 'text' field (string)" });
    return;
  }

  try {
    const result = await classify(text, config);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    res.status(502).json({ error: message });
  }
});

if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`service-c listening on port ${config.port}`);
    console.log(`  LLM endpoint: ${config.llmEndpoint}`);
    console.log(`  Model: ${config.llmModel}`);
  });
}
