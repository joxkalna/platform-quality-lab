import { TestConfig } from "../types.ts";
import { dataFlow } from "../flows/data-flow.ts";

export const dataFlowScenario = (testConfig: TestConfig) => {
  dataFlow(testConfig);
};
