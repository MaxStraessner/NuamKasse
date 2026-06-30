import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { useNetworkStatus } from "../app/NetworkStatusContext";
import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { HealthStatus } from "../components/HealthStatus";
import { MetricTile } from "../components/MetricTile";
import { PageContainer } from "../components/PageContainer";
import { ApiError } from "../services/apiClient";
import { getCurrentCashPeriod, getCurrentCashPeriodSummary } from "../services/cashPeriodsApi";
import { getCategories } from "../services/categoriesApi";
import { formatLocalDateTime } from "../services/dateTime";
import { createExpense, getCurrentExpenses, voidExpense } from "../services/expensesApi";
import {
  decimalStringToMinorUnits,
  formatThaiBaht,
  minorUnitsToDecimalString,
  normalizeMoneyInput,
} from "../services/money";
import { useHealth } from "../services/useHealth";
import type { CashPeriod, CashPeriodSummary } from "../types/cashPeriod";
import type { Category } from "../types/category";
import type { Expense } from "../types/expense";

function isNoActiveCashPeriod(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function HomePage() {
  const health = useHealth();
  const { status: networkStatus } = useNetworkStatus();
  const { user } = useAuth();
  const [cashPeriod, setCashPeriod] = useState<CashPeriod | null>(null);
  const [cashSummary, setCashSummary] = useState<CashPeriodSummary | null>(null);
  const [isLoadingCashPeriod, setIsLoadingCashPeriod] = useState(true);
  const [cashPeriodError, setCashPeriodError] = useState<string | null>(null);
  const [hasNoActiveCashPeriod, setHasNoActiveCashPeriod] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(true);
  const [expenseError, setExpenseError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [voidingExpenseId, setVoidingExpenseId] = useState<number | null>(null);
  const hadServerOutage = useRef(false);

  const remainingMinorUnits = decimalStringToMinorUnits(cashSummary?.remaining_amount ?? "") ?? 0;
  const enteredMinorUnits = decimalStringToMinorUnits(expenseAmount);
  const canUseServer = networkStatus.isOnline && networkStatus.isServerReachable;
  const canBook = Boolean(cashPeriod && cashSummary && remainingMinorUnits > 0 && !hasNoActiveCashPeriod && canUseServer);

  async function loadCashPeriod(silent = false) {
    if (!silent) {
      setIsLoadingCashPeriod(true);
    }
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
      if (isNoActiveCashPeriod(err)) {
        setHasNoActiveCashPeriod(true);
        setCashPeriodError(null);
      } else if (!silent) {
        setHasNoActiveCashPeriod(false);
        setCashPeriodError("Aktuelle Kassenperiode konnte nicht geladen werden.");
      }
    } finally {
      if (!silent) {
        setIsLoadingCashPeriod(false);
      }
    }
  }

  async function loadExpenses(silent = false) {
    if (!silent) {
      setIsLoadingExpenses(true);
    }
    try {
      const currentExpenses = await getCurrentExpenses({ limit: 5 });
      setExpenses(Array.isArray(currentExpenses) ? currentExpenses : []);
      setExpenseError(null);
    } catch (err) {
      if (isNoActiveCashPeriod(err)) {
        setExpenses([]);
        setExpenseError(null);
      } else if (!silent) {
        setExpenseError("Buchungen konnten nicht geladen werden.");
      }
    } finally {
      if (!silent) {
        setIsLoadingExpenses(false);
      }
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

  async function refreshCashAndExpenses(silent = true) {
    await Promise.all([loadCashPeriod(silent), loadExpenses(silent)]);
  }

  useEffect(() => {
    void loadCashPeriod();
    void loadCategories();
    void loadExpenses();
  }, []);

  useEffect(() => {
    if (!canUseServer) {
      hadServerOutage.current = true;
      return;
    }
    if (hadServerOutage.current) {
      hadServerOutage.current = false;
      void refreshCashAndExpenses(true);
      void loadCategories();
    }
  }, [canUseServer]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshCashAndExpenses(true);
      }
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshCashAndExpenses(true);
      }
    }, 15000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  function openExpenseDialog(category: Category) {
    if (!canUseServer) {
      setSuccessMessage(null);
      setExpenseError("Neue Buchungen sind erst wieder mit Serververbindung moeglich.");
      return;
    }
    if (!canBook || !category.is_active) {
      return;
    }
    setSelectedCategory(category);
    setExpenseAmount("");
    setDialogError(null);
    setSuccessMessage(null);
  }

  function closeExpenseDialog() {
    if (isSavingExpense) {
      return;
    }
    setSelectedCategory(null);
    setExpenseAmount("");
    setDialogError(null);
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCategory) {
      return;
    }
    if (!canUseServer) {
      setDialogError("Keine Verbindung zum Server. Die Ausgabe wurde nicht gespeichert.");
      return;
    }
    if (enteredMinorUnits === null) {
      setDialogError("Bitte einen Betrag eingeben.");
      return;
    }
    if (enteredMinorUnits <= 0) {
      setDialogError("Der Betrag muss groesser als null sein.");
      return;
    }

    setIsSavingExpense(true);
    setDialogError(null);
    try {
      const response = await createExpense({
        category_id: selectedCategory.id,
        amount: normalizeMoneyInput(expenseAmount),
      });
      setCashSummary(response.summary);
      setSuccessMessage(`${formatThaiBaht(response.expense.amount, response.expense.currency)} fuer ${response.expense.category.name} gespeichert.`);
      setSelectedCategory(null);
      setExpenseAmount("");
      await loadExpenses(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDialogError(err.message);
        await refreshCashAndExpenses(true);
      } else {
        setDialogError(err instanceof Error ? err.message : "Buchung konnte nicht gespeichert werden.");
      }
    } finally {
      setIsSavingExpense(false);
    }
  }

  async function handleVoidExpense(expense: Expense) {
    if (!canUseServer) {
      setExpenseError("Keine Verbindung zum Server. Die Buchung wurde nicht entfernt.");
      return;
    }
    const confirmed = window.confirm(
      `Buchung entfernen?\n\n${expense.category.name}\n${formatThaiBaht(expense.amount, expense.currency)}\n\nDer Betrag wird der Kasse wieder gutgeschrieben.`,
    );
    if (!confirmed) {
      return;
    }

    setVoidingExpenseId(expense.id);
    setExpenseError(null);
    try {
      const response = await voidExpense(expense.id);
      setCashSummary(response.summary);
      setSuccessMessage("Buchung wurde entfernt.");
      await loadExpenses(true);
    } catch (err) {
      setExpenseError(err instanceof Error ? err.message : "Buchung konnte nicht storniert werden.");
      await refreshCashAndExpenses(true);
    } finally {
      setVoidingExpenseId(null);
    }
  }

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
            <button className="secondary-action" type="button" onClick={() => void refreshCashAndExpenses(false)}>
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
                hint="gueltige Buchungen"
              />
              <MetricTile
                label="Restbetrag"
                value={formatThaiBaht(cashSummary.remaining_amount, cashSummary.currency)}
                tone="positive"
                hint="nach Ausgaben"
              />
            </div>
          </>
        ) : null}
      </AppCard>

      {successMessage ? <p className="form-success" role="status">{successMessage}</p> : null}

      <AppCard className="category-card" ariaLabel="Kategoriesymbole">
        <div className="card-heading">
          <span>Kategorien</span>
          <small>{canBook ? "Ausgabe erfassen" : "nicht buchbar"}</small>
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
              <CategoryTile
                category={category}
                isDisabled={!canBook || !category.is_active}
                key={category.id}
                onSelect={() => openExpenseDialog(category)}
              />
            ))}
          </div>
        ) : null}
      </AppCard>

      <AppCard ariaLabel="Letzte Ausgaben">
        <div className="card-heading">
          <span>Letzte Ausgaben</span>
          <small>{expenses.length ? `${expenses.length} angezeigt` : "aktuelle Kasse"}</small>
        </div>
        {isLoadingExpenses ? <div className="cash-skeleton" aria-label="Buchungen werden geladen" /> : null}
        {expenseError ? (
          <div className="form-error" role="alert">
            <p>{expenseError}</p>
            <button className="secondary-action" type="button" onClick={() => void loadExpenses(false)}>
              Erneut laden
            </button>
          </div>
        ) : null}
        {!isLoadingExpenses && !expenseError && expenses.length === 0 ? (
          <p className="empty-state">Noch keine Ausgaben erfasst.</p>
        ) : null}
        {!isLoadingExpenses && !expenseError && expenses.length > 0 ? (
          <div className="expense-list">
            {expenses.map((expense) => {
              const canVoidExpense = Boolean(
                cashPeriod?.status === "active"
                && !expense.is_voided
                && (user?.role === "admin" || user?.id === expense.created_by.id),
              );
              return (
                <div className="expense-item" key={expense.id}>
                  <CategoryTile category={expense.category} size="compact" />
                  <div className="expense-item__body">
                    <strong>{expense.category.name}</strong>
                    <span>{expense.created_by.display_name} / {formatLocalDateTime(expense.created_at)}</span>
                  </div>
                  <div className="expense-item__amount">
                    <strong>{formatThaiBaht(expense.amount, expense.currency)}</strong>
                    {canVoidExpense ? (
                      <button
                        className="link-button"
                        disabled={voidingExpenseId === expense.id || !canUseServer}
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
      </AppCard>

      {selectedCategory ? (
        <div className="dialog-backdrop" role="presentation">
          <div aria-modal="true" className="expense-dialog" role="dialog">
            <form onSubmit={(event) => void handleCreateExpense(event)}>
              <div className="expense-dialog__category">
                <CategoryTile category={selectedCategory} />
                <div>
                  <span>Neue Ausgabe</span>
                  <strong>{selectedCategory.name}</strong>
                </div>
              </div>
              <label className="amount-field">
                <span>Betrag</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  onChange={(event) => setExpenseAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                  placeholder="250.00"
                  value={expenseAmount}
                />
              </label>
              <div className="expense-preview">
                <div>
                  <span>Verbleibend vorher</span>
                  <strong>{formatThaiBaht(cashSummary?.remaining_amount ?? "0.00", cashSummary?.currency ?? "THB")}</strong>
                </div>
                <div>
                  <span>Neue Ausgabe</span>
                  <strong>{enteredMinorUnits !== null ? formatThaiBaht(minorUnitsToDecimalString(enteredMinorUnits)) : "ungueltiger Betrag"}</strong>
                </div>
                <div>
                  <span>Voraussichtlich verbleibend</span>
                  <strong>
                    {enteredMinorUnits !== null
                      ? formatThaiBaht(minorUnitsToDecimalString(Math.max(remainingMinorUnits - enteredMinorUnits, 0)))
                      : "ungueltiger Betrag"}
                  </strong>
                </div>
              </div>
              {dialogError ? <p className="form-error" role="alert">{dialogError}</p> : null}
              <div className="action-row">
                <button className="primary-action" disabled={isSavingExpense || !canUseServer} type="submit">
                  Ausgabe speichern
                </button>
                <button className="secondary-action" disabled={isSavingExpense} onClick={closeExpenseDialog} type="button">
                  Abbrechen
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
