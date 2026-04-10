import axios from "axios";
import { describe, it, expect } from "vitest";
import { SERVICE_B_URL } from "./config";

describe("Service B", () => {
  it("GET /health — returns healthy", async () => {
    const response = await axios.get(`${SERVICE_B_URL}/health`);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      status: "ok",
      service: "service-b",
    });
  });

  it("GET /info — returns service data", async () => {
    const response = await axios.get(`${SERVICE_B_URL}/info`);

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      service: "service-b",
      data: { version: "1.0.0" },
    });
    expect(response.data.timestamp).toEqual(expect.any(Number));
  });
});
