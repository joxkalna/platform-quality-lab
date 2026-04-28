const isDebug = __ENV.DEBUG === "true";

export const debug = (...args: unknown[]) => {
  if (isDebug) console.log("[DEBUG]", ...args);
};

export const info = (...args: unknown[]) => {
  console.log("[INFO]", ...args);
};
