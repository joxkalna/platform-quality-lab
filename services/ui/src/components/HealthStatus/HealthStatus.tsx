import { useEffect, useState } from "react";
import { checkHealth } from "../../api/client";

type ServiceStatus = {
  name: string;
  id: "a" | "b" | "c";
  status: "ok" | "error" | "loading";
};

const HealthStatus = () => {
  const [services, setServices] = useState<ServiceStatus[]>([
    { name: "Service A", id: "a", status: "loading" },
    { name: "Service B", id: "b", status: "loading" },
    { name: "Service C", id: "c", status: "loading" },
  ]);

  useEffect(() => {
    const check = async () => {
      const results = await Promise.all(
        (["a", "b", "c"] as const).map(async (id) => {
          try {
            await checkHealth(id);
            return "ok" as const;
          } catch {
            return "error" as const;
          }
        })
      );

      setServices((prev) =>
        prev.map((s, i) => ({ ...s, status: results[i] }))
      );
    };

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusDot = (status: ServiceStatus["status"]) => {
    const colors = {
      ok: "bg-green-400",
      error: "bg-red-400",
      loading: "bg-gray-500 animate-pulse",
    };
    return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]}`} />;
  };

  return (
    <section className="bg-gray-800 rounded-lg p-6 border border-gray-700">
      <h2 className="text-lg font-semibold mb-4">Health Status</h2>

      <div className="space-y-3">
        {services.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            {statusDot(s.status)}
            <span className="text-gray-300">{s.name}</span>
            <span className="text-xs text-gray-500 font-mono ml-auto">{s.status}</span>
          </div>
        ))}
      </div>
    </section>
  );
};

export default HealthStatus;
