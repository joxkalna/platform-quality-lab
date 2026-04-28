import { TestConfig } from "../types";
import { healthChecks } from "../flows/health-checks";
import { dataFlow } from "../flows/data-flow";

export const fullJourneyScenario = (testConfig: TestConfig) => {
  healthChecks(testConfig);
  dataFlow(testConfig);
};
