const categoryColors: Record<string, string> = {
  critical: "bg-red-500/20 text-red-400 border-red-500/50",
  warning: "bg-yellow-500/20 text-yellow-400 border-yellow-500/50",
  info: "bg-blue-500/20 text-blue-400 border-blue-500/50",
  ok: "bg-green-500/20 text-green-400 border-green-500/50",
};

type BadgeProps = {
  category: string;
};

const Badge = ({ category }: BadgeProps) => (
  <span className={`badge ${categoryColors[category] || "bg-gray-700 text-gray-300"}`}>
    {category}
  </span>
);

export default Badge;
