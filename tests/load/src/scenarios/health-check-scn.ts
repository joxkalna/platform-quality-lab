import { TestConfig } from "../types.ts";
import { healthChecks } from "../flows/health-checks.ts";

export const healthCheckScenario = (testConfig: TestConfig) => {
  healthChecks(testConfig);
};
