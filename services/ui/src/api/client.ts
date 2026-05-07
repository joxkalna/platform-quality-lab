import type { ClassifyResponse, DataResponse, HealthResponse } from "./types";

const BASE_URL = "/api";

export async function classifyText(text: string): Promise<ClassifyResponse> {
  const res = await fetch(`${BASE_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    throw new Error(`Classification failed: ${res.status}`);
  }

  return res.json();
}

export async function fetchData(): Promise<DataResponse> {
  const res = await fetch(`${BASE_URL}/data`);

  if (!res.ok) {
    throw new Error(`Fetch data failed: ${res.status}`);
  }

  return res.json();
}

export async function checkHealth(service: "a" | "b" | "c"): Promise<HealthResponse> {
  const paths = { a: "/api/health", b: "/api-b/health", c: "/api-c/health" };
  const res = await fetch(paths[service], {
    signal: AbortSignal.timeout(2000),
  });

  if (!res.ok) {
    throw new Error(`Health check failed: ${res.status}`);
  }

  return res.json();
}
