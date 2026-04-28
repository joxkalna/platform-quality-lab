import { group } from "k6";
import { TestConfig } from "../types";
import * as serviceA from "../requests/service-a-api";
import * as serviceB from "../requests/service-b-api";

export const healthChecks = (testConfig: TestConfig) => {
  group("health checks", () => {
    serviceA.getHealth(testConfig);
    serviceB.getHealth(testConfig);
  });
};
