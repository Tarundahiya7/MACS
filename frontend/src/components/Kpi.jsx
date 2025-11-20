export default function Kpi({ label, value }) {
  return (
    <div className="p-4 rounded-2xl bg-black/5 dark:bg-white/10 border border-black/10 dark:border-white/10">
      <div className="text-sm opacity-80">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
