import { app } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();

app.listen(config.port, () => {
  console.log(`service-c listening on port ${config.port}`);
  console.log(`  LLM endpoint: ${config.llmEndpoint}`);
  console.log(`  Model: ${config.llmModel}`);
});
