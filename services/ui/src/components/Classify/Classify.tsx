import { useState } from "react";
import { classifyText } from "../../api/client";
import type { ClassifyResponse } from "../../api/types";

const categoryColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/50",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  ok: "bg-green-500/20 text-green-400 border-green-500/50",
};

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
    <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-lg font-semibold mb-4">Classify Text</h2>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text to classify (e.g. 'server is down and unresponsive')"
        className="w-full bg-gray-900 border border-gray-600 rounded-md p-3 text-gray-100 placeholder-gray-500 resize-none h-24 focus:outline-none focus:border-blue-500"
      />

      <button
        onClick={handleClassify}
        disabled={loading || !text.trim()}
        className="mt-3 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-medium transition-colors"
      >
        {loading ? "Classifying..." : "Classify"}
      </button>

      <div className="mt-4">
        <p className="text-xs text-gray-500 mb-2">Try an example:</p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <button
              key={example}
              onClick={() => setText(example)}
              className="text-xs px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-gray-300 transition-colors"
            >
              {example.length > 40 ? `${example.slice(0, 40)}...` : example}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          <div className={`inline-block px-3 py-1 rounded-full border text-sm font-medium ${categoryColors[result.classification.category] || "bg-gray-700 text-gray-300"}`}>
            {result.classification.category}
          </div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Confidence</span>
              <p className="text-gray-100 font-mono">{(result.classification.confidence * 100).toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-gray-400">Model</span>
              <p className="text-gray-100 font-mono">{result.classification.model}</p>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Classify;
