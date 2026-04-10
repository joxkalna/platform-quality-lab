import axios from "axios";
import { describe, it, expect } from "vitest";
import { SERVICE_A_URL } from "./config";

describe("Service A", () => {
  it("GET /health — returns healthy", async () => {
    const response = await axios.get(`${SERVICE_A_URL}/health`);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: "ok",
      service: "service-a",
    });
  });

  it("GET /data — returns downstream data from Service B", async () => {
    const response = await axios.get(`${SERVICE_A_URL}/data`);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      source: "service-a",
      downstream: {
        service: "service-b",
        data: { version: "1.0.0" },
      },
    });
    expect(response.data.downstream.timestamp).toEqual(expect.any(Number));
  });
});
