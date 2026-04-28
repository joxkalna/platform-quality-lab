import { group } from "k6";
import { TestConfig } from "../types.ts";
import * as serviceA from "../requests/service-a-api.ts";
import * as serviceB from "../requests/service-b-api.ts";

export const healthChecks = (testConfig: TestConfig) => {
  group("health checks", () => {
    serviceA.getHealth(testConfig);
    serviceB.getHealth(testConfig);
  });
};
