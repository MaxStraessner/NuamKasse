import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { useNetworkStatus } from "../app/NetworkStatusContext";
import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { CategoryTile } from "../components/CategoryTile";
import { CategoryTypeBadge, categoryTypeLabel } from "../components/CategoryTypeBadge";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
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
import type { CashPeriod, CashPeriodSummary } from "../types/cashPeriod";
import type { Category } from "../types/category";

function isNoActiveCashPeriod(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

export function HomePage() {
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
  const [subcategorySearch, setSubcategorySearch] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const hadServerOutage = useRef(false);

  const remainingMinorUnits = decimalStringToMinorUnits(cashSummary?.remaining_amount ?? "") ?? 0;
  const enteredMinorUnits = decimalStringToMinorUnits(expenseAmount);
  const canUseServer = networkStatus.isOnline && networkStatus.isServerReachable;
  const canStartBooking = Boolean(cashPeriod && cashSummary && !hasNoActiveCashPeriod && canUseServer);
  const categoryTree = useMemo(() => buildCategoryTree(categories), [categories]);
  const rootCategories = categoryTree.filter((category) => category.is_active);
  const selectedRootChildren = selectedRootCategory ? getActiveChildren(categories, selectedRootCategory.id) : [];
  const visibleRootChildren = selectedRootChildren.filter((category) =>
    category.name.toLocaleLowerCase("de-DE").includes(subcategorySearch.trim().toLocaleLowerCase("de-DE")),
  );
  const selectedParentCategory = selectedCategory?.parent_category_id
    ? categories.find((category) => category.id === selectedCategory.parent_category_id) ?? selectedRootCategory
    : null;
  const selectedCategoryType = selectedParentCategory?.category_type ?? selectedCategory?.category_type ?? "expense";
  const isIncomeBooking = selectedCategoryType === "income";
  const canBookCategory = (category: Category) => canStartBooking
    && (category.category_type === "income" || remainingMinorUnits > 0);

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
      setBookingError("Neue Buchungen sind erst wieder mit Serververbindung möglich.");
      return;
    }
    if (!canBookCategory(category) || !category.is_active) {
      return;
    }
    const children = getActiveChildren(categories, category.id);
    if (children.length > 0) {
      setSelectedRootCategory(category);
      setSelectedCategory(null);
      setSubcategorySearch("");
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
    setSubcategorySearch("");
    setDialogError(null);
  }

  async function handleCreateExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCategory) {
      return;
    }
    if (!canUseServer) {
      setDialogError("Keine Verbindung zum Server. Die Buchung wurde nicht gespeichert.");
      return;
    }
    if (enteredMinorUnits === null) {
      setDialogError("Bitte einen Betrag eingeben.");
      return;
    }
    if (enteredMinorUnits <= 0) {
      setDialogError("Der Betrag muss größer als null sein.");
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
      setSuccessMessage(`${categoryTypeLabel(response.expense.transaction_type)} über ${formatThaiBaht(response.expense.amount, response.expense.currency)} für ${getCategoryPath(categories, selectedCategory)} gespeichert.`);
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
      <PageHeader eyebrow="Gemeinsame Kasse" title="Nuam Kasse" />

      <AppCard ariaLabel="Kassenübersicht">
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
            <small>
              Startbetrag: {formatThaiBaht(cashSummary.opening_amount, cashSummary.currency)}
              {cashSummary.income_amount !== "0.00" ? ` · Einnahmen: ${formatThaiBaht(cashSummary.income_amount, cashSummary.currency)}` : ""}
            </small>
          </div>
        ) : null}
      </AppCard>

      {successMessage ? <div className="success-toast" role="status"><CheckCircle2 aria-hidden="true" /><span>{successMessage}</span></div> : null}

      <AppCard className="category-card" ariaLabel="Kategoriesymbole">
        <div className="card-heading">
          <span>Kategorien</span>
          <small>{canStartBooking ? "Buchung erfassen" : "nicht buchbar"}</small>
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
              : "Noch keine Kategorien verfügbar."}
          </p>
        ) : null}
        {!isLoadingCategories && !categoryError && rootCategories.length > 0 ? (
          <div className="category-grid">
            {rootCategories.map((category) => (
              <CategoryTile
                category={category}
                isDisabled={!canBookCategory(category) || !category.is_active}
                key={category.id}
                onSelect={() => openRootCategory(category)}
              />
            ))}
          </div>
        ) : null}
      </AppCard>

      <AppDialog
        description={`Wähle den passenden Bereich für deine ${selectedRootCategory?.category_type === "income" ? "Einnahme" : "Ausgabe"}.`}
        isOpen={Boolean(selectedRootCategory && !selectedCategory)}
        onClose={closeSubcategoryView}
        title={selectedRootCategory?.name ?? "Unterkategorie wählen"}
      >
        {selectedRootChildren.length > 6 ? (
          <label className="dialog-search">
            <Search aria-hidden="true" />
            <span className="sr-only">Unterkategorie suchen</span>
            <input onChange={(event) => setSubcategorySearch(event.target.value)} placeholder="Unterkategorie suchen" value={subcategorySearch} />
          </label>
        ) : null}
        {selectedRootChildren.length === 0 ? <p className="empty-state">Für diese Oberkategorie gibt es noch keine aktiven Unterkategorien.</p> : null}
        {selectedRootChildren.length > 0 && visibleRootChildren.length === 0 ? <p className="empty-state">Keine passende Unterkategorie gefunden.</p> : null}
        {visibleRootChildren.length > 0 ? (
          <div className="category-grid category-grid--dialog">
            {visibleRootChildren.map((subcategory) => (
              <CategoryTile category={subcategory} isDisabled={!canBookCategory(subcategory) || !subcategory.is_active} key={subcategory.id} onSelect={() => openExpenseDialog(subcategory, selectedRootCategory)} />
            ))}
          </div>
        ) : null}
      </AppDialog>

      <AppDialog
        description={selectedCategory ? getCategoryPath(categories, selectedCategory) : undefined}
        isOpen={Boolean(selectedCategory)}
        onClose={closeExpenseDialog}
        preventClose={isSavingExpense}
        title={`${isIncomeBooking ? "Einnahme" : "Ausgabe"} eintragen`}
      >
        {selectedCategory ? (
            <form className="booking-form" onSubmit={(event) => void handleCreateExpense(event)}>
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
                <CategoryTypeBadge type={selectedCategoryType} />
              </div>
              <label className="amount-field">
                <span>Betrag</span>
                <input
                  aria-label="Betrag"
                  aria-describedby="amount-help"
                  data-autofocus
                  inputMode="decimal"
                  onChange={(event) => setExpenseAmount(event.target.value.replace(/[^\d,.]/g, ""))}
                  value={expenseAmount}
                />
                <small id="amount-help">Betrag in Thai Baht</small>
              </label>
              <div className="quick-amounts" aria-label="Schnellbeträge">
                {[100, 250, 500, 1000].map((amount) => (
                  <button key={amount} onClick={() => setExpenseAmount(String(amount))} type="button">฿{amount.toLocaleString("th-TH")}</button>
                ))}
              </div>
              <div className="expense-preview">
                <div>
                  <span>Verbleibend vorher</span>
                  <strong>{formatThaiBaht(cashSummary?.remaining_amount ?? "0.00", cashSummary?.currency ?? "THB")}</strong>
                </div>
                <div>
                  <span>Neue {isIncomeBooking ? "Einnahme" : "Ausgabe"}</span>
                  <strong>{expenseAmount.trim() ? (enteredMinorUnits !== null ? formatThaiBaht(minorUnitsToDecimalString(enteredMinorUnits)) : "Bitte prüfen") : "—"}</strong>
                </div>
                <div>
                  <span>Voraussichtlich verbleibend</span>
                  <strong>
                    {expenseAmount.trim() && enteredMinorUnits !== null
                      ? formatThaiBaht(minorUnitsToDecimalString(
                        isIncomeBooking
                          ? remainingMinorUnits + enteredMinorUnits
                          : Math.max(remainingMinorUnits - enteredMinorUnits, 0),
                      ))
                      : "—"}
                  </strong>
                </div>
              </div>
              {dialogError ? <p className="form-error" role="alert">{dialogError}</p> : null}
              <div className="action-row">
                <button className="primary-action" disabled={isSavingExpense || !canUseServer} type="submit">
                  {isSavingExpense ? "Wird gespeichert …" : `${isIncomeBooking ? "Einnahme" : "Ausgabe"} speichern`}
                </button>
                <button className="secondary-action" disabled={isSavingExpense} onClick={closeExpenseDialog} type="button">
                  {selectedRootCategory && selectedCategory.parent_category_id === selectedRootCategory.id ? "Zurück" : "Abbrechen"}
                </button>
              </div>
            </form>
        ) : null}
      </AppDialog>
    </PageContainer>
  );
}
