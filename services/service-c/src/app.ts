import express from "express";
import { loadConfig } from "./config";
import { classify } from "./llm";
import { classifyMock } from "./mock";

const LLM_MOCK = process.env.LLM_MOCK === "true";

const config = LLM_MOCK
  ? { port: 3002, llmEndpoint: "", llmModel: "mock", llmTemperature: 0, llmTimeout: 10000 }
  : loadConfig();

export const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "service-c" });
});

app.get("/ready", async (_req, res) => {
  if (LLM_MOCK) {
    res.json({ status: "ready", service: "service-c", mode: "mock" });
    return;
  }

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
    const result = LLM_MOCK ? classifyMock(text) : await classify(text, config);
    res.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Classification failed";
    res.status(502).json({ error: message });
  }
});
