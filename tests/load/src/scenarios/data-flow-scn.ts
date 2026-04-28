import { TestConfig } from "../types";
import { dataFlow } from "../flows/data-flow";

export const dataFlowScenario = (testConfig: TestConfig) => {
  dataFlow(testConfig);
};
