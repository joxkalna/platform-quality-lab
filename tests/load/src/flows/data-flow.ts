import { group } from "k6";
import { TestConfig } from "../types.ts";
import * as serviceA from "../requests/service-a-api.ts";
import * as serviceB from "../requests/service-b-api.ts";

export const dataFlow = (testConfig: TestConfig) => {
  group("data flow", () => {
    serviceB.getInfo(testConfig);
    serviceA.getData(testConfig);
  });
};
