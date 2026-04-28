import { check, fail } from "k6";
import http from "k6/http";
import { debug } from "../utils/logger.ts";
import { getRequestParams } from "../utils/request-params.ts";
import { TestConfig } from "../types.ts";

export const getHealth = (testConfig: TestConfig) => {
  const transaction = "serviceB_getHealth";
  const url = `${testConfig.serviceB}/health`;
  const response = http.get(url, getRequestParams(transaction));

  const passed = check(
    response,
    {
      "status is 200": (r) => r.status === 200,
      "body contains service-b": (r) =>
        Boolean(r.body && r.body.toString().includes("service-b")),
    },
    { transaction }
  );

  if (!passed) {
    fail(`Check failed in ${transaction}. Stopping iteration.`);
  }
};

export const getInfo = (testConfig: TestConfig) => {
  const transaction = "serviceB_getInfo";
  const url = `${testConfig.serviceB}/info`;
  const response = http.get(url, getRequestParams(transaction));

  const passed = check(
    response,
    {
      "status is 200": (r) => r.status === 200,
      "body contains service-b": (r) =>
        Boolean(r.body && r.body.toString().includes("service-b")),
      "body contains version": (r) =>
        Boolean(r.body && r.body.toString().includes("version")),
    },
    { transaction }
  );

  if (!passed) {
    fail(`Check failed in ${transaction}. Stopping iteration.`);
  }

  debug(`getInfo response: ${response.body}`);
};
