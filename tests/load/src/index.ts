import { info } from "./utils/logger";
import { TestConfig } from "./types";
import { healthCheckScenario } from "./scenarios/health-check-scn";
import { dataFlowScenario } from "./scenarios/data-flow-scn";
import { fullJourneyScenario } from "./scenarios/full-journey-scn";

export { handleSummary } from "./utils/handle-summary";

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

export default (testConfig: TestConfig) => {
  fullJourneyScenario(testConfig);
};
