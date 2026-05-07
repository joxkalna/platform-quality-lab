type StatusDotProps = {
  status: "ok" | "error" | "loading";
};

const colors = {
  ok: "bg-green-400",
  error: "bg-red-400",
  loading: "bg-gray-500 animate-pulse",
};

const StatusDot = ({ status }: StatusDotProps) => (
  <span className={`status-dot ${colors[status]}`} />
);

export default StatusDot;
