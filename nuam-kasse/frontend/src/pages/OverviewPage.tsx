import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { MetricTile } from "../components/MetricTile";
import { PageContainer } from "../components/PageContainer";
import { ApiError } from "../services/apiClient";
import { listCashPeriods } from "../services/cashPeriodsApi";
import { formatLocalDateTime } from "../services/dateTime";
import { voidExpense } from "../services/expensesApi";
import { decimalStringToMinorUnits, formatThaiBaht } from "../services/money";
import {
  getCashPeriodExpenses,
  getCashPeriodOverview,
  getCurrentOverview,
} from "../services/overviewApi";
import type { CashPeriod } from "../types/cashPeriod";
import type {
  CashPeriodOverview,
  OverviewExpense,
  OverviewExpenseFilters,
  OverviewExpenseSort,
  PaginatedOverviewExpenses,
} from "../types/overview";

type DatePreset = "all" | "today" | "last7" | "custom";
type StatusFilter = "active" | "all";

type OverviewFilters = {
  categoryId: string;
  userId: string;
  datePreset: DatePreset;
  dateFrom: string;
  dateTo: string;
  status: StatusFilter;
  sort: OverviewExpenseSort;
};

const defaultFilters: OverviewFilters = {
  categoryId: "",
  userId: "",
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  status: "active",
  sort: "created_at_desc",
};

function toDateInput(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeriodDate(value: string): string {
  return new Date(value).toLocaleDateString("de-DE", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function isNoActiveCashPeriod(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

function categoryAsTile(category: CashPeriodOverview["categories"][number]) {
  return {
    name: category.category_name,
    icon_key: category.icon_key,
    color_key: category.color_key,
    image_url: category.image_url,
  };
}

function consumptionPercent(openingAmount: string, spentAmount: string): number {
  const opening = decimalStringToMinorUnits(openingAmount) ?? 0;
  const spent = decimalStringToMinorUnits(spentAmount) ?? 0;
  if (opening <= 0 || spent <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (spent / opening) * 100));
}

export function OverviewPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [overview, setOverview] = useState<CashPeriodOverview | null>(null);
  const [periods, setPeriods] = useState<CashPeriod[]>([]);
  const [selectedPeriodId, setSelectedPeriodId] = useState<number | null>(null);
  const [filters, setFilters] = useState<OverviewFilters>(defaultFilters);
  const [expensesPage, setExpensesPage] = useState<PaginatedOverviewExpenses | null>(null);
  const [isLoadingOverview, setIsLoadingOverview] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [filterError, setFilterError] = useState<string | null>(null);
  const [hasNoActivePeriod, setHasNoActivePeriod] = useState(false);
  const [voidingExpenseId, setVoidingExpenseId] = useState<number | null>(null);

  const cashPeriod = overview?.summary?.cash_period ?? null;
  const percentSpent = overview?.summary
    ? consumptionPercent(overview.summary.opening_amount, overview.summary.spent_amount)
    : 0;

  const periodOptions = useMemo(() => {
    const byId = new Map<number, CashPeriod>();
    const safePeriods = Array.isArray(periods) ? periods : [];
    safePeriods.forEach((period) => byId.set(period.id, period));
    return Array.from(byId.values()).sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === "active" ? -1 : 1;
      }
      return b.start_date.localeCompare(a.start_date);
    });
  }, [periods]);

  function buildExpenseFilters(offset = 0, limit = 20): OverviewExpenseFilters | null {
    setFilterError(null);
    let dateFrom: string | undefined;
    let dateTo: string | undefined;
    const today = new Date();

    if (filters.datePreset === "today") {
      dateFrom = toDateInput(today);
      dateTo = dateFrom;
    } else if (filters.datePreset === "last7") {
      const start = new Date(today);
      start.setDate(today.getDate() - 6);
      dateFrom = toDateInput(start);
      dateTo = toDateInput(today);
    } else if (filters.datePreset === "custom") {
      dateFrom = filters.dateFrom || undefined;
      dateTo = filters.dateTo || undefined;
      if (dateFrom && dateTo && dateTo < dateFrom) {
        setFilterError("Das Ende darf nicht vor dem Beginn liegen.");
        return null;
      }
    }

    return {
      category_id: filters.categoryId ? Number(filters.categoryId) : undefined,
      created_by_user_id: filters.userId ? Number(filters.userId) : undefined,
      date_from: dateFrom,
      date_to: dateTo,
      include_voided: isAdmin && filters.status === "all",
      limit,
      offset,
      sort: filters.sort,
    };
  }

  async function loadPeriods() {
    if (!isAdmin) {
      return;
    }
    try {
      const nextPeriods = await listCashPeriods();
      setPeriods(Array.isArray(nextPeriods) ? nextPeriods : []);
    } catch {
      // Period selection is admin-only convenience; the main overview still carries the page.
    }
  }

  async function loadOverview(silent = false) {
    if (!silent) {
      setIsLoadingOverview(true);
    }
    try {
      const nextOverview = selectedPeriodId
        ? await getCashPeriodOverview(selectedPeriodId)
        : await getCurrentOverview();
      setOverview(nextOverview);
      setHasNoActivePeriod(false);
      setOverviewError(null);
    } catch (err) {
      setOverview(null);
      setExpensesPage(null);
      if (isNoActiveCashPeriod(err)) {
        setHasNoActivePeriod(true);
        setOverviewError(null);
      } else if (!silent) {
        setOverviewError(err instanceof Error ? err.message : "Übersicht konnte nicht geladen werden.");
      }
    } finally {
      if (!silent) {
        setIsLoadingOverview(false);
      }
    }
  }

  async function loadExpenses(offset = 0, append = false, silent = false) {
    if (!cashPeriod) {
      return;
    }
    const query = buildExpenseFilters(offset);
    if (!query) {
      return;
    }
    if (append) {
      setIsLoadingMore(true);
    } else if (!silent) {
      setIsLoadingExpenses(true);
    }
    try {
      const page = await getCashPeriodExpenses(cashPeriod.id, query);
      setExpensesPage((current) => {
        if (!append || !current) {
          return page;
        }
        const seen = new Set(current.items.map((item) => item.id));
        return {
          ...page,
          items: [...current.items, ...page.items.filter((item) => !seen.has(item.id))],
        };
      });
      setExpenseError(null);
    } catch (err) {
      if (!silent) {
        setExpenseError(err instanceof Error ? err.message : "Buchungen konnten nicht geladen werden.");
      }
    } finally {
      setIsLoadingExpenses(false);
      setIsLoadingMore(false);
    }
  }

  async function refreshVisibleData(silent = true) {
    await loadOverview(silent);
    if (cashPeriod) {
      await loadExpenses(0, false, silent);
    }
  }

  useEffect(() => {
    void loadPeriods();
  }, [isAdmin]);

  useEffect(() => {
    void loadOverview(false);
  }, [selectedPeriodId]);

  useEffect(() => {
    if (cashPeriod) {
      void loadExpenses(0, false, false);
    }
  }, [
    cashPeriod?.id,
    filters.categoryId,
    filters.userId,
    filters.datePreset,
    filters.dateFrom,
    filters.dateTo,
    filters.status,
    filters.sort,
  ]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible" && cashPeriod?.status === "active") {
        void refreshVisibleData(true);
      }
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible" && cashPeriod?.status === "active") {
        void refreshVisibleData(true);
      }
    }, 15000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [cashPeriod?.id, cashPeriod?.status, filters]);

  function resetFilters() {
    setFilters(defaultFilters);
  }

  function selectPeriod(value: string) {
    setSelectedPeriodId(value ? Number(value) : null);
    resetFilters();
    setExpensesPage(null);
  }

  function selectCategory(categoryId: number) {
    setFilters((current) => ({ ...current, categoryId: String(categoryId) }));
  }

  function selectUser(userId: number) {
    setFilters((current) => ({ ...current, userId: String(userId) }));
  }

  async function handleVoidExpense(expense: OverviewExpense) {
    const confirmed = window.confirm(
      `Buchung entfernen?\n\n${expense.category.name}\n${formatThaiBaht(expense.amount, expense.currency)}`,
    );
    if (!confirmed) {
      return;
    }
    setVoidingExpenseId(expense.id);
    try {
      await voidExpense(expense.id);
      await loadOverview(true);
      await loadExpenses(0, false, true);
    } catch (err) {
      setExpenseError(err instanceof Error ? err.message : "Buchung konnte nicht storniert werden.");
    } finally {
      setVoidingExpenseId(null);
    }
  }

  const overviewCategories = Array.isArray(overview?.categories) ? overview.categories : [];
  const overviewUsers = Array.isArray(overview?.users) ? overview.users : [];
  const selectedCategory = overviewCategories.find((category) => String(category.category_id) === filters.categoryId);
  const selectedUser = overviewUsers.find((summaryUser) => String(summaryUser.user_id) === filters.userId);
  const hasActiveFilters = Boolean(
    filters.categoryId || filters.userId || filters.datePreset !== "all" || filters.status !== "active" || filters.sort !== "created_at_desc",
  );

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Auswertung</p>
          <h1>Übersicht</h1>
        </div>
        {isAdmin && periodOptions.length > 0 ? (
          <label className="period-select">
            <span>Kassenperiode</span>
            <select onChange={(event) => selectPeriod(event.target.value)} value={selectedPeriodId ?? ""}>
              <option value="">Aktive Periode</option>
              {periodOptions
                .filter((period) => period.status !== "active")
                .map((period) => (
                  <option key={period.id} value={period.id}>
                    {period.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
      </header>

      {isLoadingOverview && !overview ? (
        <AppCard ariaLabel="Übersicht wird geladen">
          <div className="overview-skeleton" />
        </AppCard>
      ) : null}

      {hasNoActivePeriod ? (
        <AppCard ariaLabel="Keine aktive Kassenperiode">
          <div className="cash-empty">
            <p>Zurzeit ist keine aktive Kassenperiode vorhanden.</p>
            {isAdmin ? (
              <Link className="primary-link" to="/settings/cash-periods">
                Neue Kassenperiode anlegen
              </Link>
            ) : null}
          </div>
        </AppCard>
      ) : null}

      {overviewError ? (
        <div className="form-error" role="alert">
          <p>{overviewError}</p>
          <button className="secondary-action" onClick={() => void loadOverview(false)} type="button">
            Erneut laden
          </button>
        </div>
      ) : null}

      {overview && cashPeriod ? (
        <>
          <AppCard ariaLabel="Kassenperiodenkopf">
            <div className="overview-period">
              <div>
                <span className="home-header__eyebrow">{cashPeriod.status === "active" ? "Aktiv" : "Abgeschlossen"}</span>
                <h2>{cashPeriod.name}</h2>
                <p>
                  {cashPeriod.end_date
                    ? `${formatPeriodDate(cashPeriod.start_date)} bis ${formatPeriodDate(cashPeriod.end_date)}`
                    : `Seit ${formatPeriodDate(cashPeriod.start_date)}`}
                </p>
              </div>
              <strong>{cashPeriod.currency}</strong>
            </div>
          </AppCard>

          <AppCard ariaLabel="Geldzusammenfassung">
            <div className="cash-hero">
              <span>Verbleibend</span>
              <strong>{formatThaiBaht(overview.summary.remaining_amount, cashPeriod.currency)}</strong>
              <small>{overview.summary.active_expense_count} gültige Buchungen</small>
            </div>
            <div className="metric-grid">
              <MetricTile
                label="Ausgegeben"
                value={formatThaiBaht(overview.summary.spent_amount, cashPeriod.currency)}
                tone="warning"
                hint={`${overview.summary.voided_expense_count} storniert`}
              />
              <MetricTile
                label="Ausgangsbetrag"
                value={formatThaiBaht(overview.summary.opening_amount, cashPeriod.currency)}
                tone="neutral"
                hint="API Wert"
              />
              <MetricTile
                label="Buchungen"
                value={String(overview.summary.expense_count)}
                tone="positive"
                hint="inklusive storniert"
              />
            </div>
            <div className="overview-progress" aria-label={`${percentSpent.toFixed(2)} Prozent ausgegeben`}>
              <div className="overview-progress__track">
                <span style={{ width: `${percentSpent}%` }} />
              </div>
              <small>{percentSpent.toFixed(2)} Prozent ausgegeben</small>
            </div>
          </AppCard>

          <AppCard ariaLabel="Ausgaben nach Kategorie">
            <div className="card-heading">
              <span>Ausgaben nach Kategorie</span>
              <small>{overviewCategories.length ? `${overviewCategories.length} Kategorien` : "keine Ausgaben"}</small>
            </div>
            {overviewCategories.length === 0 ? (
              <p className="empty-state">Noch keine Ausgaben vorhanden.</p>
            ) : (
              <div className="overview-summary-list">
                {overviewCategories.map((category) => (
                  <button
                    className={`overview-summary-row${filters.categoryId === String(category.category_id) ? " overview-summary-row--active" : ""}`}
                    key={category.category_id}
                    onClick={() => selectCategory(category.category_id)}
                    type="button"
                  >
                    <CategoryTile category={categoryAsTile(category)} size="compact" />
                    <span>
                      <strong>{formatThaiBaht(category.total_amount, cashPeriod.currency)}</strong>
                      <small>{category.expense_count} Buchungen / {category.percentage_of_spending} Prozent</small>
                      <i style={{ width: `${Math.min(Number(category.percentage_of_spending), 100)}%` }} />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard ariaLabel="Ausgaben nach Benutzer">
            <div className="card-heading">
              <span>Ausgaben nach Benutzer</span>
              <small>{overviewUsers.length ? `${overviewUsers.length} Benutzer` : "keine Ausgaben"}</small>
            </div>
            {overviewUsers.length === 0 ? (
              <p className="empty-state">Noch keine Ausgaben vorhanden.</p>
            ) : (
              <div className="overview-summary-list">
                {overviewUsers.map((summaryUser) => (
                  <button
                    className={`overview-user-row${filters.userId === String(summaryUser.user_id) ? " overview-user-row--active" : ""}`}
                    key={summaryUser.user_id}
                    onClick={() => selectUser(summaryUser.user_id)}
                    type="button"
                  >
                    <span>
                      <strong>{summaryUser.display_name}</strong>
                      <small>{summaryUser.expense_count} Buchungen / {summaryUser.percentage_of_spending} Prozent</small>
                    </span>
                    <b>{formatThaiBaht(summaryUser.total_amount, cashPeriod.currency)}</b>
                  </button>
                ))}
              </div>
            )}
          </AppCard>

          <AppCard ariaLabel="Buchungsliste">
            <div className="card-heading">
              <span>Buchungen</span>
              <small>{expensesPage ? `${expensesPage.total} gefunden` : "wird geladen"}</small>
            </div>
            <div className="overview-filter-bar">
              <label>
                <span>Kategorie</span>
                <select
                  onChange={(event) => setFilters((current) => ({ ...current, categoryId: event.target.value }))}
                  value={filters.categoryId}
                >
                  <option value="">Alle</option>
                  {overviewCategories.map((category) => (
                    <option key={category.category_id} value={category.category_id}>
                      {category.category_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Benutzer</span>
                <select
                  onChange={(event) => setFilters((current) => ({ ...current, userId: event.target.value }))}
                  value={filters.userId}
                >
                  <option value="">Alle</option>
                  {overviewUsers.map((summaryUser) => (
                    <option key={summaryUser.user_id} value={summaryUser.user_id}>
                      {summaryUser.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Zeitraum</span>
                <select
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, datePreset: event.target.value as DatePreset }))
                  }
                  value={filters.datePreset}
                >
                  <option value="all">Gesamte Periode</option>
                  <option value="today">Heute</option>
                  <option value="last7">Letzte 7 Tage</option>
                  <option value="custom">Benutzerdefiniert</option>
                </select>
              </label>
              {isAdmin ? (
                <label>
                  <span>Status</span>
                  <select
                    onChange={(event) =>
                      setFilters((current) => ({ ...current, status: event.target.value as StatusFilter }))
                    }
                    value={filters.status}
                  >
                    <option value="active">Gültig</option>
                    <option value="all">Mit stornierten</option>
                  </select>
                </label>
              ) : null}
              <label>
                <span>Sortierung</span>
                <select
                  onChange={(event) =>
                    setFilters((current) => ({ ...current, sort: event.target.value as OverviewExpenseSort }))
                  }
                  value={filters.sort}
                >
                  <option value="created_at_desc">Neueste zuerst</option>
                  <option value="created_at_asc">Älteste zuerst</option>
                  <option value="amount_desc">Betrag absteigend</option>
                  <option value="amount_asc">Betrag aufsteigend</option>
                </select>
              </label>
            </div>
            {filters.datePreset === "custom" ? (
              <div className="overview-date-row">
                <label>
                  <span>Von</span>
                  <input
                    max={cashPeriod.end_date ?? undefined}
                    min={cashPeriod.start_date}
                    onChange={(event) => setFilters((current) => ({ ...current, dateFrom: event.target.value }))}
                    type="date"
                    value={filters.dateFrom}
                  />
                </label>
                <label>
                  <span>Bis</span>
                  <input
                    max={cashPeriod.end_date ?? undefined}
                    min={cashPeriod.start_date}
                    onChange={(event) => setFilters((current) => ({ ...current, dateTo: event.target.value }))}
                    type="date"
                    value={filters.dateTo}
                  />
                </label>
              </div>
            ) : null}
            {hasActiveFilters ? (
              <div className="filter-chips">
                {selectedCategory ? <button onClick={() => setFilters((current) => ({ ...current, categoryId: "" }))} type="button">Kategorie: {selectedCategory.category_name}</button> : null}
                {selectedUser ? <button onClick={() => setFilters((current) => ({ ...current, userId: "" }))} type="button">Benutzer: {selectedUser.display_name}</button> : null}
                {filters.datePreset !== "all" ? <button onClick={() => setFilters((current) => ({ ...current, datePreset: "all", dateFrom: "", dateTo: "" }))} type="button">Zeitraum</button> : null}
                {isAdmin && filters.status !== "active" ? <button onClick={() => setFilters((current) => ({ ...current, status: "active" }))} type="button">Stornierte sichtbar</button> : null}
                {filters.sort !== "created_at_desc" ? <button onClick={() => setFilters((current) => ({ ...current, sort: "created_at_desc" }))} type="button">Sortierung</button> : null}
                <button onClick={resetFilters} type="button">Alle Filter zurücksetzen</button>
              </div>
            ) : null}
            {filterError ? <p className="form-error" role="alert">{filterError}</p> : null}
            {expenseError ? <p className="form-error" role="alert">{expenseError}</p> : null}
            {isLoadingExpenses && !expensesPage ? <div className="cash-skeleton" aria-label="Buchungen werden geladen" /> : null}
            {expensesPage && expensesPage.items.length === 0 ? (
              <p className="empty-state">
                {hasActiveFilters ? "Für diese Auswahl wurden keine Buchungen gefunden." : "Noch keine Ausgaben vorhanden."}
              </p>
            ) : null}
            {expensesPage && expensesPage.items.length > 0 ? (
              <div className="expense-list overview-expense-list">
                {expensesPage.items.map((expense) => {
                  const canVoidExpense = Boolean(
                    cashPeriod.status === "active"
                    && !expense.is_voided
                    && (isAdmin || user?.id === expense.created_by.id),
                  );
                  return (
                    <div className={`expense-item${expense.is_voided ? " expense-item--voided" : ""}`} key={expense.id}>
                      <CategoryTile category={expense.category} showLabel={false} size="compact" />
                      <div className="expense-item__body">
                        <strong>{expense.category.name}</strong>
                        <span>{expense.created_by.display_name} / {formatLocalDateTime(expense.created_at)}</span>
                        {isAdmin && expense.is_voided ? (
                          <small>
                            Storniert{expense.voided_by ? ` von ${expense.voided_by.display_name}` : ""}
                            {expense.void_reason ? ` / ${expense.void_reason}` : ""}
                          </small>
                        ) : null}
                      </div>
                      <div className="expense-item__amount">
                        <strong>{formatThaiBaht(expense.amount, expense.currency)}</strong>
                        {isAdmin && expense.is_voided ? <span className="status-pill">Storniert</span> : null}
                        {canVoidExpense ? (
                          <button
                            className="link-button"
                            disabled={voidingExpenseId === expense.id}
                            onClick={() => void handleVoidExpense(expense)}
                            type="button"
                          >
                            Buchung entfernen
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {expensesPage?.has_more ? (
              <button
                className="secondary-action overview-load-more"
                disabled={isLoadingMore}
                onClick={() => void loadExpenses(expensesPage.offset + expensesPage.limit, true)}
                type="button"
              >
                Weitere Buchungen laden
              </button>
            ) : null}
          </AppCard>
        </>
      ) : null}
    </PageContainer>
  );
}
