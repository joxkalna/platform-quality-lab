import { group } from "k6";
import { TestConfig } from "../types";
import * as serviceA from "../requests/service-a-api";
import * as serviceB from "../requests/service-b-api";

export const dataFlow = (testConfig: TestConfig) => {
  group("data flow", () => {
    serviceB.getInfo(testConfig);
    serviceA.getData(testConfig);
  });
};
