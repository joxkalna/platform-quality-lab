import { app } from "./app";
import { loadConfig } from "./config";

const LLM_MOCK = process.env.LLM_MOCK === "true";
const port = parseInt(process.env.PORT || "3002", 10);

if (!LLM_MOCK) {
  const config = loadConfig();
  app.listen(config.port, () => {
    console.log(`service-c listening on port ${config.port}`);
    console.log(`  LLM endpoint: ${config.llmEndpoint}`);
    console.log(`  Model: ${config.llmModel}`);
  });
} else {
  app.listen(port, () => {
    console.log(`service-c listening on port ${port}`);
    console.log(`  Mode: mock (no LLM)`);
  });
}
