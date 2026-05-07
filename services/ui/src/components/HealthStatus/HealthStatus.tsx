import { useEffect, useState } from "react";
import { checkHealth } from "../../api/client";
import StatusDot from "../ui/StatusDot";

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

  return (
    <div className="health-list">
      {services.map((s) => (
        <div key={s.id} className="health-row">
          <StatusDot status={s.status} />
          <span className="health-name">{s.name}</span>
          <span className="health-status">{s.status}</span>
        </div>
      ))}
    </div>
  );
};

export default HealthStatus;
