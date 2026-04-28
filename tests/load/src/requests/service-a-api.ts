import { check, fail } from "k6";
import http from "k6/http";
import { debug } from "../utils/logger";
import { getRequestParams } from "../utils/request-params";
import { TestConfig } from "../types";

export const getHealth = (testConfig: TestConfig) => {
  const transaction = "serviceA_getHealth";
  const url = `${testConfig.serviceA}/health`;
  const response = http.get(url, getRequestParams(transaction));

  const passed = check(
    response,
    {
      "status is 200": (r) => r.status === 200,
      "body contains service-a": (r) =>
        Boolean(r.body && r.body.toString().includes("service-a")),
    },
    { transaction }
  );

  if (!passed) {
    fail(`Check failed in ${transaction}. Stopping iteration.`);
  }
};

export const getReady = (testConfig: TestConfig) => {
  const transaction = "serviceA_getReady";
  const url = `${testConfig.serviceA}/ready`;
  const response = http.get(url, getRequestParams(transaction));

  const passed = check(
    response,
    {
      "status is 200": (r) => r.status === 200,
      "body contains ready": (r) =>
        Boolean(r.body && r.body.toString().includes("ready")),
    },
    { transaction }
  );

  if (!passed) {
    fail(`Check failed in ${transaction}. Stopping iteration.`);
  }
};

export const getData = (testConfig: TestConfig) => {
  const transaction = "serviceA_getData";
  const url = `${testConfig.serviceA}/data`;
  const response = http.get(url, getRequestParams(transaction));

  const passed = check(
    response,
    {
      "status is 200": (r) => r.status === 200,
      "body contains source": (r) =>
        Boolean(r.body && r.body.toString().includes("source")),
      "body contains downstream": (r) =>
        Boolean(r.body && r.body.toString().includes("downstream")),
    },
    { transaction }
  );

  if (!passed) {
    fail(`Check failed in ${transaction}. Stopping iteration.`);
  }

  debug(`getData response: ${response.body}`);
};
