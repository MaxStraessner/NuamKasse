import { ArrowDownRight, ArrowUpRight, Plus, ReceiptText, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { DesktopCategoryChart } from "../components/DesktopCategoryChart";
import { DesktopTrendChart } from "../components/DesktopTrendChart";
import { ApiError } from "../services/apiClient";
import { listCashPeriods } from "../services/cashPeriodsApi";
import { formatThaiBaht } from "../services/money";
import { getAllCashPeriodExpenses, getCurrentOverview } from "../services/overviewApi";
import type { CashPeriodArchiveItem } from "../types/cashPeriod";
import type { CashPeriodOverview, OverviewExpense } from "../types/overview";
import { buildCategoryDistribution, buildTimelineBuckets } from "./desktopDashboardData";

type DashboardMetricProps = {
  icon: typeof Wallet;
  label: string;
  value: string;
  detail: string;
  tone: "income" | "expense" | "balance" | "bookings";
};

function formatPeriodDate(value: string | null): string {
  if (!value) {
    return "offen";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function DashboardMetric({ detail, icon: Icon, label, tone, value }: DashboardMetricProps) {
  return (
    <article className={`desktop-metric desktop-metric--${tone}`}>
      <span className="desktop-metric__icon"><Icon aria-hidden="true" /></span>
      <span className="desktop-metric__label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PeriodOverview({ error, periods }: { error: string | null; periods: CashPeriodArchiveItem[] }) {
  return (
    <section className="desktop-panel desktop-periods" aria-labelledby="period-overview-title">
      <div className="desktop-panel__heading">
        <div><span>Kassenperioden</span><h2 id="period-overview-title">Periodenübersicht</h2></div>
        <Link to="/settings/cash-periods">Alle Perioden</Link>
      </div>
      {error ? <p className="desktop-panel__error" role="alert">{error}</p> : null}
      {!error && periods.length === 0 ? (
        <div className="desktop-chart-empty"><p>Noch keine Kassenperiode vorhanden.</p><span>Vorhandene Zeiträume werden hier übersichtlich zusammengefasst.</span></div>
      ) : null}
      {periods.length > 0 ? (
        <div className="desktop-periods__scroller">
          <table>
            <thead><tr><th>Bezeichnung</th><th>Zeitraum</th><th>Status</th><th>Einnahmen</th><th>Ausgaben</th><th>Saldo</th></tr></thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id}>
                  <td><Link to={`/reports?period=${period.id}`}>{period.name}</Link><small>{period.transaction_count} {period.transaction_count === 1 ? "Buchung" : "Buchungen"}</small></td>
                  <td>{formatPeriodDate(period.start_date)} – {formatPeriodDate(period.end_date)}</td>
                  <td><span className={`desktop-status desktop-status--${period.status}`}>{period.status === "active" ? "Aktiv" : "Abgeschlossen"}</span></td>
                  <td className="desktop-money desktop-money--positive">{formatThaiBaht(period.income_amount, period.currency)}</td>
                  <td className="desktop-money desktop-money--negative">{formatThaiBaht(period.spent_amount, period.currency)}</td>
                  <td className="desktop-money">{formatThaiBaht(period.remaining_amount, period.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}

export function DesktopDashboardPage() {
  const { user } = useAuth();
  const [overview, setOverview] = useState<CashPeriodOverview | null>(null);
  const [expenses, setExpenses] = useState<OverviewExpense[]>([]);
  const [periods, setPeriods] = useState<CashPeriodArchiveItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasNoActivePeriod, setHasNoActivePeriod] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [periodError, setPeriodError] = useState<string | null>(null);

  async function loadDashboard() {
    setIsLoading(true);
    setOverviewError(null);
    setPeriodError(null);
    setHasNoActivePeriod(false);

    const [overviewResult, periodsResult] = await Promise.allSettled([
      getCurrentOverview(),
      listCashPeriods(),
    ]);

    if (periodsResult.status === "fulfilled") {
      setPeriods(Array.isArray(periodsResult.value) ? periodsResult.value : []);
    } else {
      setPeriods([]);
      setPeriodError("Kassenperioden konnten nicht geladen werden.");
    }

    if (overviewResult.status === "rejected") {
      setOverview(null);
      setExpenses([]);
      if (overviewResult.reason instanceof ApiError && overviewResult.reason.status === 404) {
        setHasNoActivePeriod(true);
      } else {
        setOverviewError(overviewResult.reason instanceof Error ? overviewResult.reason.message : "Dashboard konnte nicht geladen werden.");
      }
      setIsLoading(false);
      return;
    }

    setOverview(overviewResult.value);
    try {
      setExpenses(await getAllCashPeriodExpenses(overviewResult.value.summary.cash_period.id));
    } catch {
      setExpenses([]);
      setOverviewError("Der Buchungsverlauf konnte nicht vollständig geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadDashboard();
  }, [user?.cashbook_id]);

  const timelineData = useMemo(() => overview
    ? buildTimelineBuckets(
      expenses,
      overview.summary.cash_period.start_date,
      overview.summary.cash_period.end_date,
    )
    : [], [expenses, overview]);
  const categoryData = useMemo(
    () => buildCategoryDistribution(overview?.categories ?? []),
    [overview?.categories],
  );
  const currency = overview?.summary.cash_period.currency ?? "THB";

  return (
    <main className="desktop-dashboard">
      <header className="desktop-dashboard__header">
        <div>
          <p>Übersicht</p>
          <h1>Willkommen, {user?.display_name}</h1>
          <span>{overview ? `${overview.summary.cash_period.name} · ${formatPeriodDate(overview.summary.cash_period.start_date)} bis ${formatPeriodDate(overview.summary.cash_period.end_date)}` : "Deine gemeinsame Kasse auf einen Blick"}</span>
        </div>
        <Link className="desktop-primary-action" to="/book"><Plus aria-hidden="true" />Neue Buchung</Link>
      </header>

      {isLoading && !overview ? <div className="desktop-dashboard__skeleton" aria-label="Dashboard wird geladen" /> : null}

      {hasNoActivePeriod ? (
        <section className="desktop-panel desktop-dashboard__empty">
          <h2>Keine aktive Kassenperiode</h2>
          <p>Für das Dashboard wird eine aktive Kassenperiode benötigt.</p>
          {user?.cashbook_role === "admin" ? <Link to="/settings/cash-periods">Kassenperioden öffnen</Link> : null}
        </section>
      ) : null}

      {overviewError && !overview ? (
        <section className="desktop-panel desktop-dashboard__empty" role="alert">
          <h2>Dashboard nicht verfügbar</h2><p>{overviewError}</p>
          <button onClick={() => void loadDashboard()} type="button">Erneut laden</button>
        </section>
      ) : null}

      {overview ? (
        <>
          <section className="desktop-metrics" aria-label="Kennzahlen der aktuellen Kassenperiode">
            <DashboardMetric detail="Aktuelle Kassenperiode" icon={ArrowUpRight} label="Einnahmen" tone="income" value={formatThaiBaht(overview.summary.income_amount, currency)} />
            <DashboardMetric detail="Aktuelle Kassenperiode" icon={ArrowDownRight} label="Ausgaben" tone="expense" value={formatThaiBaht(overview.summary.spent_amount, currency)} />
            <DashboardMetric detail="Verfügbarer Kassenbestand" icon={Wallet} label="Aktueller Saldo" tone="balance" value={formatThaiBaht(overview.summary.remaining_amount, currency)} />
            <DashboardMetric detail="Gültige Buchungen" icon={ReceiptText} label="Anzahl Buchungen" tone="bookings" value={String(overview.summary.active_expense_count)} />
          </section>

          {overviewError ? <p className="desktop-panel__error" role="alert">{overviewError}</p> : null}

          <section className="desktop-dashboard__charts">
            <article className="desktop-panel" aria-labelledby="trend-title">
              <div className="desktop-panel__heading"><div><span>Aktuelle Periode</span><h2 id="trend-title">Einnahmen und Ausgaben</h2></div></div>
              <DesktopTrendChart currency={currency} data={timelineData} />
            </article>
            <article className="desktop-panel" aria-labelledby="category-distribution-title">
              <div className="desktop-panel__heading"><div><span>Verteilung</span><h2 id="category-distribution-title">Ausgaben nach Kategorien</h2></div></div>
              <DesktopCategoryChart currency={currency} data={categoryData} />
            </article>
          </section>
        </>
      ) : null}

      {!isLoading ? <PeriodOverview error={periodError} periods={periods} /> : null}
    </main>
  );
}
