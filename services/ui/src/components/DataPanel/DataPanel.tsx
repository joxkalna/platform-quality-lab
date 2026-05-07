import { useState } from "react";
import { fetchData } from "../../api/client";
import type { DataResponse } from "../../api/types";

const DataPanel = () => {
  const [data, setData] = useState<DataResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleFetch = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetchData();
      setData(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch data");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-lg font-semibold mb-4">Service Data</h2>

      <button
        onClick={handleFetch}
        disabled={loading}
        className="px-5 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-600 disabled:cursor-not-allowed rounded-md font-medium transition-colors"
      >
        {loading ? "Fetching..." : "Fetch Data"}
      </button>

      {error && (
        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-md text-red-400 text-sm">
          {error}
        </div>
      )}

      {data && (
        <div className="mt-4 bg-gray-900 rounded-md p-4">
          <pre className="text-sm text-gray-300 font-mono overflow-x-auto">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </section>
  );
};

export default DataPanel;
