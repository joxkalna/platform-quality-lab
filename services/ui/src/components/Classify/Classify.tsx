import { useState } from "react";
import { classifyText } from "../../api/client";
import type { ClassifyResponse } from "../../api/types";
import Badge from "../ui/Badge";
import Button from "../ui/Button";
import DataField from "../ui/DataField";
import ErrorMessage from "../ui/ErrorMessage";

const EXAMPLES = [
  "server is down and completely unresponsive",
  "database connection pool exhausted, all requests failing",
  "response times degraded, p99 latency above 3 seconds",
  "memory usage trending upward, possible leak",
  "scheduled maintenance window tomorrow at 2am UTC",
  "feature flag enabled for 10% of users in canary group",
  "all systems operational, no incidents reported",
  "health check passing on all endpoints",
  "service running within normal parameters",
  "disk usage at 92%, will be full within 2 hours",
];

const Classify = () => {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ClassifyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleClassify = async () => {
    if (!text.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await classifyText(text);
      setResult(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Classification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          if (!e.target.value.trim()) {
            setResult(null);
            setError(null);
          }
        }}
        placeholder="Enter text to classify (e.g. 'server is down and unresponsive')"
        className="textarea"
      />

      <div className="mt-3">
        <Button onClick={handleClassify} disabled={loading || !text.trim()}>
          {loading ? "Classifying..." : "Classify"}
        </Button>
      </div>

      <div className="examples-section">
        <p className="examples-label">Try an example:</p>
        <div className="examples-grid">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setText(example)}
              className="example-chip"
            >
              {example.length > 40 ? `${example.slice(0, 40)}...` : example}
            </button>
          ))}
        </div>
      </div>

      {error && <ErrorMessage message={error} />}

      {result && (
        <div className="classify-result">
          <Badge category={result.classification.category} />
          <div className="result-grid">
            <DataField label="Confidence" value={`${(result.classification.confidence * 100).toFixed(1)}%`} />
            <DataField label="Model" value={result.classification.model} />
          </div>
        </div>
      )}
    </>
  );
};

export default Classify;
