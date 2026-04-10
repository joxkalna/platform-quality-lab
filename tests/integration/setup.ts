import axios from "axios";
import { execSync, spawn, type ChildProcess } from "child_process";

const portForwards: ChildProcess[] = [];

function isKindClusterRunning(): boolean {
  try {
    const clusters = execSync("kind get clusters 2>/dev/null").toString();
    return clusters.includes("platform-lab");
  } catch {
    return false;
  }
}

function isLocalServiceRunning(url: string): boolean {
  try {
    execSync(`curl -sf ${url}/health`, { timeout: 2000 });
    return true;
  } catch {
    return false;
  }
}

function startPortForward(
  service: string,
  localPort: number,
  remotePort: number
): ChildProcess {
  const proc = spawn(
    "kubectl",
    ["port-forward", `svc/${service}`, `${localPort}:${remotePort}`],
    { stdio: "ignore" }
  );
  portForwards.push(proc);
  return proc;
}

async function waitForReachable(
  url: string,
  retries = 15,
  delayMs = 1000
): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await axios.get(`${url}/health`, { timeout: 2000 });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Service at ${url} not reachable after ${retries} retries`);
}

export async function setup(): Promise<void> {
  const serviceAUrl = process.env.SERVICE_A_URL || "http://localhost:3000";
  const serviceBUrl = process.env.SERVICE_B_URL || "http://localhost:3001";

  // If URLs are overridden, just wait for them — no setup needed
  if (process.env.SERVICE_A_URL || process.env.SERVICE_B_URL) {
    await waitForReachable(serviceAUrl);
    await waitForReachable(serviceBUrl);
    return;
  }

  // If services are already running locally, nothing to do
  if (
    isLocalServiceRunning(serviceAUrl) &&
    isLocalServiceRunning(serviceBUrl)
  ) {
    return;
  }

  // If Kind cluster is running, port-forward
  if (isKindClusterRunning()) {
    console.log("→ Kind cluster detected, starting port-forwards...");
    startPortForward("service-a", 3000, 3000);
    startPortForward("service-b", 3001, 3001);
    await waitForReachable(serviceAUrl);
    await waitForReachable(serviceBUrl);
    console.log("→ Services reachable via port-forward");
    return;
  }

  throw new Error(
    "No services reachable. Either run 'npm run dev' or deploy to Kind first."
  );
}

export async function teardown(): Promise<void> {
  portForwards.forEach((proc) => proc.kill());
}
