import type { CSSProperties } from "react";

import { formatThaiBaht, minorUnitsToDecimalString } from "../services/money";
import type { CategoryDistributionItem } from "../pages/desktopDashboardData";

type DesktopCategoryChartProps = {
  currency: string;
  data: CategoryDistributionItem[];
};

const CHART_COLORS = ["#2563eb", "#5b7fa6", "#8ba4bc", "#b1c0cf", "#d2dae3", "#727987"];

export function DesktopCategoryChart({ currency, data }: DesktopCategoryChartProps) {
  const total = data.reduce((sum, item) => sum + item.amountMinor, 0);
  if (total <= 0) {
    return <div className="desktop-chart-empty"><p>Noch keine Ausgaben für die Kategorienverteilung.</p><span>Das Diagramm füllt sich automatisch mit vorhandenen Buchungen.</span></div>;
  }

  let currentPercentage = 0;
  const gradient = data.map((item, index) => {
    const start = currentPercentage;
    currentPercentage += (item.amountMinor / total) * 100;
    return `${CHART_COLORS[index % CHART_COLORS.length]} ${start.toFixed(2)}% ${currentPercentage.toFixed(2)}%`;
  }).join(", ");

  return (
    <div className="desktop-category-chart">
      <div
        aria-label={`Ausgaben nach Kategorien, insgesamt ${formatThaiBaht(minorUnitsToDecimalString(total), currency)}`}
        className="desktop-category-chart__donut"
        role="img"
        style={{ "--category-gradient": `conic-gradient(${gradient})` } as CSSProperties}
      >
        <span><small>Ausgaben</small><strong>{formatThaiBaht(minorUnitsToDecimalString(total), currency)}</strong></span>
      </div>
      <ul className="desktop-category-chart__legend">
        {data.map((item, index) => (
          <li key={item.key}>
            <i style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
            <span><strong>{item.label}</strong><small>{item.bookingCount} {item.bookingCount === 1 ? "Buchung" : "Buchungen"}</small></span>
            <b>{((item.amountMinor / total) * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
