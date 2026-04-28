import { TestConfig } from "../types.ts";
import { healthChecks } from "../flows/health-checks.ts";
import { dataFlow } from "../flows/data-flow.ts";

export const fullJourneyScenario = (testConfig: TestConfig) => {
  healthChecks(testConfig);
  dataFlow(testConfig);
};
