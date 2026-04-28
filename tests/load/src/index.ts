import { dataFlowScenario } from "./scenarios/data-flow-scn.ts";
import { fullJourneyScenario } from "./scenarios/full-journey-scn.ts";
import { healthCheckScenario } from "./scenarios/health-check-scn.ts";
import { TestConfig } from "./types.ts";
import { info } from "./utils/logger.ts";

export { handleSummary } from "./utils/handle-summary.ts";

export const setup = (): TestConfig => {
  const serviceA = __ENV.SERVICE_A_URL || "http://localhost:3000";
  const serviceB = __ENV.SERVICE_B_URL || "http://localhost:3001";

  info(`Service A: ${serviceA}`);
  info(`Service B: ${serviceB}`);

  return { serviceA, serviceB };
};

export const healthCheck = (testConfig: TestConfig) => {
  healthCheckScenario(testConfig);
};

export const dataFlow = (testConfig: TestConfig) => {
  dataFlowScenario(testConfig);
};

export const fullJourney = (testConfig: TestConfig) => {
  fullJourneyScenario(testConfig);
};
// k6 requires a default export as the main test entry point
export default (testConfig: TestConfig) => {
  fullJourneyScenario(testConfig);
};
