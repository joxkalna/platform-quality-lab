import { TestConfig } from "../types";
import { healthChecks } from "../flows/health-checks";

export const healthCheckScenario = (testConfig: TestConfig) => {
  healthChecks(testConfig);
};
