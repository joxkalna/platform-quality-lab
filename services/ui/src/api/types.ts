export type ClassifyResponse = {
  source: string;
  classification: {
    category: string;
    confidence: number;
    model: string;
  };
};

export type DataResponse = {
  source: string;
  downstream: {
    service: string;
    timestamp: number;
    data: { version: string };
  };
};

export type HealthResponse = {
  status: string;
  service: string;
};

export type AgentResponse = {
  source: string;
  agent: {
    response: string;
    intent: string;
    confidence: number;
  };
};
