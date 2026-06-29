type MetricTileProps = {
  label: string;
  value: string;
  tone: "neutral" | "warning" | "positive";
};

export function MetricTile({ label, value, tone }: MetricTileProps) {
  return (
    <div className={`metric-tile metric-tile--${tone}`}>
      <span className="metric-tile__label">{label}</span>
      <strong className="metric-tile__value">{value}</strong>
      <span className="metric-tile__hint">Platzhalter</span>
    </div>
  );
}
