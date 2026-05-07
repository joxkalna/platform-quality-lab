import { useEffect, useRef, useState } from "react";
import { fetchData } from "../../api/client";
import type { DataResponse } from "../../api/types";
import Button from "../ui/Button";
import DataField from "../ui/DataField";
import ErrorMessage from "../ui/ErrorMessage";

const MatrixRain = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;

    const chars = "01アイウエオカキクケコサシスセソ";
    const fontSize = 12;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(17, 24, 39, 0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#22c55e";
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        drops[i]++;
      }
    };

    const interval = setInterval(draw, 50);
    return () => clearInterval(interval);
  }, []);

  return <canvas ref={canvasRef} className="canvas-bg" />;
};

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

  const formatTimestamp = (ts: number) =>
    new Date(ts).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "medium" });

  return (
    <>
      <Button variant="secondary" onClick={handleFetch} disabled={loading}>
        {loading ? "Fetching..." : "Fetch Data"}
      </Button>

      {error && <ErrorMessage message={error} />}

      {data && (
        <div className="result-panel">
          <MatrixRain />
          <div className="result-content">
            <div className="result-row">
              <span className="result-label">Route:</span>
              <span className="result-value">
                {data.source} → {data.downstream.service}
              </span>
            </div>
            <div className="result-grid">
              <DataField label="Version" value={data.downstream.data.version} />
              <DataField label="Responded at" value={formatTimestamp(data.downstream.timestamp)} />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default DataPanel;
