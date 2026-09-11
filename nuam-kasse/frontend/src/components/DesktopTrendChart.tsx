import { formatThaiBaht, minorUnitsToDecimalString } from "../services/money";
import type { TimelineBucket } from "../pages/desktopDashboardData";

type DesktopTrendChartProps = {
  currency: string;
  data: TimelineBucket[];
};

const CHART_WIDTH = 720;
const CHART_HEIGHT = 220;
const PADDING_X = 18;
const PADDING_TOP = 16;
const PADDING_BOTTOM = 22;

function toPolyline(data: TimelineBucket[], maximum: number, key: "incomeMinor" | "expenseMinor") {
  const usableWidth = CHART_WIDTH - PADDING_X * 2;
  const usableHeight = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  return data.map((item, index) => {
    const x = data.length === 1
      ? CHART_WIDTH / 2
      : PADDING_X + (index / (data.length - 1)) * usableWidth;
    const y = PADDING_TOP + (1 - item[key] / maximum) * usableHeight;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  }).join(" ");
}

export function DesktopTrendChart({ currency, data }: DesktopTrendChartProps) {
  if (data.length === 0) {
    return <div className="desktop-chart-empty"><p>Noch keine Buchungen in dieser Kassenperiode.</p><span>Der Verlauf erscheint, sobald Einnahmen oder Ausgaben erfasst wurden.</span></div>;
  }

  const maximum = Math.max(1, ...data.flatMap((item) => [item.incomeMinor, item.expenseMinor]));
  const labelIndexes = Array.from(new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]));

  return (
    <div className="desktop-trend-chart">
      <div className="desktop-chart-legend" aria-label="Legende">
        <span><i className="desktop-chart-legend__income" />Einnahmen</span>
        <span><i className="desktop-chart-legend__expense" />Ausgaben</span>
      </div>
      <div className="desktop-trend-chart__plot">
        <div className="desktop-trend-chart__scale" aria-hidden="true">
          <span>{formatThaiBaht(minorUnitsToDecimalString(maximum), currency)}</span>
          <span>{formatThaiBaht(minorUnitsToDecimalString(Math.round(maximum / 2)), currency)}</span>
          <span>{formatThaiBaht("0.00", currency)}</span>
        </div>
        <svg
          aria-label="Einnahmen und Ausgaben im Zeitverlauf"
          className="desktop-trend-chart__svg"
          role="img"
          viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        >
          <title>Einnahmen und Ausgaben im Zeitverlauf</title>
          {[PADDING_TOP, CHART_HEIGHT / 2, CHART_HEIGHT - PADDING_BOTTOM].map((y) => (
            <line className="desktop-trend-chart__grid" key={y} x1={PADDING_X} x2={CHART_WIDTH - PADDING_X} y1={y} y2={y} />
          ))}
          <polyline className="desktop-trend-chart__line desktop-trend-chart__line--income" points={toPolyline(data, maximum, "incomeMinor")} />
          <polyline className="desktop-trend-chart__line desktop-trend-chart__line--expense" points={toPolyline(data, maximum, "expenseMinor")} />
          {data.length === 1 ? (
            <>
              <circle className="desktop-trend-chart__point desktop-trend-chart__point--income" cx={CHART_WIDTH / 2} cy={PADDING_TOP + (1 - data[0].incomeMinor / maximum) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM)} r="5" />
              <circle className="desktop-trend-chart__point desktop-trend-chart__point--expense" cx={CHART_WIDTH / 2} cy={PADDING_TOP + (1 - data[0].expenseMinor / maximum) * (CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM)} r="5" />
            </>
          ) : null}
        </svg>
        <div className="desktop-trend-chart__labels" aria-hidden="true">
          {labelIndexes.map((index) => <span key={data[index].key}>{data[index].label}</span>)}
        </div>
      </div>
      <ul className="sr-only">
        {data.map((item) => (
          <li key={item.key}>{item.label}: Einnahmen {formatThaiBaht(minorUnitsToDecimalString(item.incomeMinor), currency)}, Ausgaben {formatThaiBaht(minorUnitsToDecimalString(item.expenseMinor), currency)}</li>
        ))}
      </ul>
    </div>
  );
}
