import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { HealthStatus } from "../components/HealthStatus";
import { MetricTile } from "../components/MetricTile";
import { PageContainer } from "../components/PageContainer";
import { ApiError } from "../services/apiClient";
import { getCurrentCashPeriod, getCurrentCashPeriodSummary } from "../services/cashPeriodsApi";
import { getCategories } from "../services/categoriesApi";
import { formatThaiBaht } from "../services/money";
import { useHealth } from "../services/useHealth";
import type { CashPeriod, CashPeriodSummary } from "../types/cashPeriod";
import type { Category } from "../types/category";

export function HomePage() {
  const health = useHealth();
  const { user } = useAuth();
  const [cashPeriod, setCashPeriod] = useState<CashPeriod | null>(null);
  const [cashSummary, setCashSummary] = useState<CashPeriodSummary | null>(null);
  const [isLoadingCashPeriod, setIsLoadingCashPeriod] = useState(true);
  const [cashPeriodError, setCashPeriodError] = useState<string | null>(null);
  const [hasNoActiveCashPeriod, setHasNoActiveCashPeriod] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  async function loadCashPeriod() {
    setIsLoadingCashPeriod(true);
    try {
      const [current, summary] = await Promise.all([
        getCurrentCashPeriod(),
        getCurrentCashPeriodSummary(),
      ]);
      setCashPeriod(current);
      setCashSummary(summary);
      setHasNoActiveCashPeriod(false);
      setCashPeriodError(null);
    } catch (err) {
      setCashPeriod(null);
      setCashSummary(null);
      if (err instanceof ApiError && err.status === 404) {
        setHasNoActiveCashPeriod(true);
        setCashPeriodError(null);
      } else {
        setHasNoActiveCashPeriod(false);
        setCashPeriodError("Aktuelle Kassenperiode konnte nicht geladen werden.");
      }
    } finally {
      setIsLoadingCashPeriod(false);
    }
  }

  async function loadCategories() {
    setIsLoadingCategories(true);
    try {
      setCategories(await getCategories());
      setCategoryError(null);
    } catch {
      setCategoryError("Kategorien konnten nicht geladen werden.");
    } finally {
      setIsLoadingCategories(false);
    }
  }

  useEffect(() => {
    void loadCashPeriod();
    void loadCategories();
  }, []);

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Gemeinsame Kasse</p>
          <h1>Nuam Kasse</h1>
        </div>
        <HealthStatus status={health.status} health={health.data} />
      </header>

      <AppCard ariaLabel="Kassenuebersicht">
        <div className="card-heading">
          <span>Aktuelle Kasse</span>
          <small>{cashPeriod?.name || "Kassenperiode"}</small>
        </div>
        {isLoadingCashPeriod ? (
          <div className="cash-skeleton" aria-label="Kassenperiode wird geladen" />
        ) : null}
        {cashPeriodError ? (
          <div className="empty-state" role="alert">
            <p>{cashPeriodError}</p>
            <button className="secondary-action" type="button" onClick={() => void loadCashPeriod()}>
              Erneut laden
            </button>
          </div>
        ) : null}
        {!isLoadingCashPeriod && hasNoActiveCashPeriod ? (
          <div className="cash-empty">
            <p>Zurzeit ist kein Betrag hinterlegt.</p>
            {user?.role === "admin" ? (
              <Link className="primary-link" to="/settings/cash-periods">
                Neue Kassenperiode anlegen
              </Link>
            ) : null}
          </div>
        ) : null}
        {!isLoadingCashPeriod && !cashPeriodError && cashPeriod && cashSummary ? (
          <>
            <div className="cash-hero">
              <span>Verbleibend</span>
              <strong>{formatThaiBaht(cashSummary.remaining_amount, cashSummary.currency)}</strong>
              <small>Beginn: {new Date(cashPeriod.start_date).toLocaleDateString("de-DE")}</small>
            </div>
            <div className="metric-grid">
              <MetricTile
                label="Ausgangsbetrag"
                value={formatThaiBaht(cashSummary.opening_amount, cashSummary.currency)}
                tone="neutral"
                hint="bereitgestellt"
              />
              <MetricTile
                label="Ausgaben"
                value={formatThaiBaht(cashSummary.spent_amount, cashSummary.currency)}
                tone="warning"
                hint="noch keine Buchungen"
              />
              <MetricTile
                label="Restbetrag"
                value={formatThaiBaht(cashSummary.remaining_amount, cashSummary.currency)}
                tone="positive"
                hint="ohne Buchungen"
              />
            </div>
          </>
        ) : null}
      </AppCard>

      <AppCard className="category-card" ariaLabel="Kategoriesymbole">
        <div className="card-heading">
          <span>Kategorien</span>
          <small>Auswahl vorbereitet</small>
        </div>
        {isLoadingCategories ? (
          <div className="category-grid" aria-label="Kategorien werden geladen">
            {[1, 2, 3, 4].map((item) => (
              <div className="category-skeleton" key={item} />
            ))}
          </div>
        ) : null}
        {categoryError ? (
          <div className="empty-state" role="alert">
            <p>{categoryError}</p>
            <button className="secondary-action" type="button" onClick={() => void loadCategories()}>
              Erneut laden
            </button>
          </div>
        ) : null}
        {!isLoadingCategories && !categoryError && categories.length === 0 ? (
          <p className="empty-state">
            {user?.role === "admin"
              ? "Noch keine Kategorien vorhanden. Lege in den Einstellungen eine Kategorie an."
              : "Noch keine Kategorien verfuegbar."}
          </p>
        ) : null}
        {!isLoadingCategories && !categoryError && categories.length > 0 ? (
          <div className="category-grid">
            {categories.map((category) => (
              <CategoryTile category={category} key={category.id} />
            ))}
          </div>
        ) : null}
      </AppCard>
    </PageContainer>
  );
}
