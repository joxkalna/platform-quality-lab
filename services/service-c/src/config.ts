import { z } from "zod";

const ConfigSchema = z.object({
  port: z.coerce.number().default(3002),
  llmEndpoint: z.string().url(),
  llmModel: z.string().default("llama3.2:1b"),
  llmTemperature: z.coerce.number().min(0).max(2).default(0.3),
  llmTimeout: z.coerce.number().positive().default(10000),
});

export type Config = z.infer<typeof ConfigSchema>;

export const loadConfig = (): Config => {
  return ConfigSchema.parse({
    port: process.env.PORT,
    llmEndpoint: process.env.LLM_ENDPOINT,
    llmModel: process.env.LLM_MODEL,
    llmTemperature: process.env.LLM_TEMPERATURE,
    llmTimeout: process.env.LLM_TIMEOUT,
  });
};
