export const getRequestParams = (
  transaction: string,
  customHeaders?: Record<string, string>,
  timeout = "10s"
) => {
  return {
    headers: {
      "content-type": "application/json",
      ...customHeaders,
    },
    tags: { transaction },
    timeout,
  };
};
