import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { useNetworkStatus } from "../app/NetworkStatusContext";
import { AppCard } from "../components/AppCard";
import { CategoryTile } from "../components/CategoryTile";
import { HealthStatus } from "../components/HealthStatus";
import { PageContainer } from "../components/PageContainer";
import { ApiError } from "../services/apiClient";
import { getCurrentCashPeriod, getCurrentCashPeriodSummary } from "../services/cashPeriodsApi";
import { getCategories } from "../services/categoriesApi";
import { buildCategoryTree, getActiveChildren, getCategoryPath } from "../services/categoryTree";
import { createExpense } from "../services/expensesApi";
import {
  decimalStringToMinorUnits,
  formatThaiBaht,
  minorUnitsToDecimalString,
  normalizeMoneyInput,
} from "../services/money";
import { useHealth } from "../services/useHealth";
import type { CashPeriod, CashPeriodSummary } from "../types/cashPeriod";
import type { Category } from "../types/category";

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
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [selectedRootCategory, setSelectedRootCategory] = useState<Category | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [expenseAmount, setExpenseAmount] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const hadServerOutage = useRef(false);

  const remainingMinorUnits = decimalStringToMinorUnits(cashSummary?.remaining_amount ?? "") ?? 0;
  const enteredMinorUnits = decimalStringToMinorUnits(expenseAmount);
  const canUseServer = networkStatus.isOnline && networkStatus.isServerReachable;
  const canBook = Boolean(cashPeriod && cashSummary && remainingMinorUnits > 0 && !hasNoActiveCashPeriod && canUseServer);
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const rootCategories = categoryTree.filter((category) => category.is_active);
  const selectedRootChildren = selectedRootCategory ? getActiveChildren(categories, selectedRootCategory.id) : [];
  const selectedParentCategory = selectedCategory?.parent_category_id
    ? categories.find((category) => category.id === selectedCategory.parent_category_id) ?? selectedRootCategory
    : null;

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

  async function refreshCashPeriod(silent = true) {
    await loadCashPeriod(silent);
  }

  useEffect(() => {
    void loadCashPeriod();
    void loadCategories();
  }, []);

  useEffect(() => {
    if (!canUseServer) {
      hadServerOutage.current = true;
      return;
    }
    if (hadServerOutage.current) {
      hadServerOutage.current = false;
      void refreshCashPeriod(true);
      void loadCategories();
    }
  }, [canUseServer]);

  useEffect(() => {
    function refreshWhenVisible() {
      if (document.visibilityState === "visible") {
        void refreshCashPeriod(true);
      }
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshCashPeriod(true);
      }
    }, 15000);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  function openRootCategory(category: Category) {
    if (!canUseServer) {
      setSuccessMessage(null);
      setBookingError("Neue Buchungen sind erst wieder mit Serververbindung moeglich.");
      return;
    }
    if (!canBook || !category.is_active) {
      return;
    }
    const children = getActiveChildren(categories, category.id);
    if (children.length > 0) {
      setSelectedRootCategory(category);
      setSelectedCategory(null);
      setBookingError(null);
      setSuccessMessage(null);
      return;
    }
    openExpenseDialog(category, null);
  }

  function openExpenseDialog(category: Category, rootCategory: Category | null = selectedRootCategory) {
    setSelectedCategory(category);
    setSelectedRootCategory(rootCategory);
    setExpenseAmount("");
    setDialogError(null);
    setBookingError(null);
    setSuccessMessage(null);
  }

  function closeExpenseDialog() {
    if (isSavingExpense) {
      return;
    }
    const shouldReturnToSubcategories = Boolean(
      selectedRootCategory
      && selectedCategory
      && selectedCategory.parent_category_id === selectedRootCategory.id,
    );
    setSelectedCategory(null);
    setExpenseAmount("");
    setDialogError(null);
    if (!shouldReturnToSubcategories) {
      setSelectedRootCategory(null);
    }
  }

  function closeSubcategoryView() {
    if (isSavingExpense) {
      return;
    }
    setSelectedRootCategory(null);
    setSelectedCategory(null);
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
      setSuccessMessage(`${formatThaiBaht(response.expense.amount, response.expense.currency)} fuer ${getCategoryPath(categories, selectedCategory)} gespeichert.`);
      setSelectedCategory(null);
      setSelectedRootCategory(null);
      setExpenseAmount("");
      setBookingError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDialogError(err.message);
        await refreshCashPeriod(true);
      } else {
        setDialogError(err instanceof Error ? err.message : "Buchung konnte nicht gespeichert werden.");
      }
    } finally {
      setIsSavingExpense(false);
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
            <button className="secondary-action" type="button" onClick={() => void refreshCashPeriod(false)}>
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
          <div className="cash-summary-hero">
            <span>Restbetrag</span>
            <div>
              <strong>{formatThaiBaht(cashSummary.remaining_amount, cashSummary.currency)}</strong>
            </div>
            <small>Startbetrag: {formatThaiBaht(cashSummary.opening_amount, cashSummary.currency)}</small>
          </div>
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
        {bookingError ? <p className="form-error" role="alert">{bookingError}</p> : null}
        {!isLoadingCategories && !categoryError && rootCategories.length === 0 ? (
          <p className="empty-state">
            {user?.role === "admin"
              ? "Noch keine Kategorien vorhanden. Lege in den Einstellungen eine Kategorie an."
              : "Noch keine Kategorien verfuegbar."}
          </p>
        ) : null}
        {!isLoadingCategories && !categoryError && rootCategories.length > 0 ? (
          <div className="category-grid">
            {rootCategories.map((category) => (
              <CategoryTile
                category={category}
                isDisabled={!canBook || !category.is_active}
                key={category.id}
                onSelect={() => openRootCategory(category)}
              />
            ))}
          </div>
        ) : null}
      </AppCard>

      {selectedRootCategory && !selectedCategory ? (
        <div className="dialog-backdrop" role="presentation">
          <div aria-modal="true" className="expense-dialog" role="dialog">
            <div className="subcategory-dialog__hero">
              <CategoryTile category={selectedRootCategory} />
            </div>
            {selectedRootChildren.length === 0 ? (
              <p className="empty-state">Fuer diese Oberkategorie gibt es noch keine aktiven Unterkategorien.</p>
            ) : (
              <div className="category-grid">
                {selectedRootChildren.map((subcategory) => (
                  <CategoryTile
                    category={subcategory}
                    isDisabled={!canBook || !subcategory.is_active}
                    key={subcategory.id}
                    onSelect={() => openExpenseDialog(subcategory, selectedRootCategory)}
                  />
                ))}
              </div>
            )}
            <div className="action-row">
              <button className="secondary-action" onClick={closeSubcategoryView} type="button">
                Zurueck
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {selectedCategory ? (
        <div className="dialog-backdrop" role="presentation">
          <div aria-modal="true" className="expense-dialog" role="dialog">
            <form onSubmit={(event) => void handleCreateExpense(event)}>
              <div className="booking-category-header">
                <CategoryTile category={selectedCategory} showLabel={false} />
                {selectedParentCategory ? (
                  <div className="booking-category-pair" aria-label={getCategoryPath(categories, selectedCategory)}>
                    <div>
                      <span>Oberkategorie</span>
                      <strong>{selectedParentCategory.name}</strong>
                    </div>
                    <div>
                      <span>Unterkategorie</span>
                      <strong>{selectedCategory.name}</strong>
                    </div>
                  </div>
                ) : (
                  <strong className="booking-category-single">{selectedCategory.name}</strong>
                )}
              </div>
              <label className="amount-field">
                <span>Betrag</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  onChange={(event) => setExpenseAmount(event.target.value.replace(/[^\d,.]/g, ""))}
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
                  <strong>{enteredMinorUnits !== null ? formatThaiBaht(minorUnitsToDecimalString(enteredMinorUnits)) : "ungültiger Betrag"}</strong>
                </div>
                <div>
                  <span>Voraussichtlich verbleibend</span>
                  <strong>
                    {enteredMinorUnits !== null
                      ? formatThaiBaht(minorUnitsToDecimalString(Math.max(remainingMinorUnits - enteredMinorUnits, 0)))
                      : "ungültiger Betrag"}
                  </strong>
                </div>
              </div>
              {dialogError ? <p className="form-error" role="alert">{dialogError}</p> : null}
              <div className="action-row">
                <button className="primary-action" disabled={isSavingExpense || !canUseServer} type="submit">
                  Ausgabe speichern
                </button>
                <button className="secondary-action" disabled={isSavingExpense} onClick={closeExpenseDialog} type="button">
                  {selectedRootCategory && selectedCategory.parent_category_id === selectedRootCategory.id ? "Zurueck" : "Abbrechen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </PageContainer>
  );
}
