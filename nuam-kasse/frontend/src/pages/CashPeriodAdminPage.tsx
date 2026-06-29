import { FormEvent, useEffect, useState } from "react";

import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";
import {
  closeCashPeriod,
  createCashPeriod,
  listCashPeriods,
  updateCashPeriod,
} from "../services/cashPeriodsApi";
import { formatThaiBaht, normalizeAmountInput } from "../services/money";
import type { CashPeriod } from "../types/cashPeriod";

type CashPeriodForm = {
  name: string;
  opening_amount: string;
  start_date: string;
  end_date: string;
};

const emptyForm: CashPeriodForm = {
  name: "",
  opening_amount: "",
  start_date: "",
  end_date: "",
};

function defaultNameForDate(value: string): string {
  if (!value) {
    return "";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function formatDate(value: string | null): string {
  if (!value) {
    return "offen";
  }
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

export function CashPeriodAdminPage() {
  const [cashPeriods, setCashPeriods] = useState<CashPeriod[]>([]);
  const [form, setForm] = useState<CashPeriodForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadCashPeriods() {
    setIsLoading(true);
    try {
      setCashPeriods(await listCashPeriods());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassenperioden konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadCashPeriods();
  }, []);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  function startEdit(cashPeriod: CashPeriod) {
    if (cashPeriod.status === "closed") {
      return;
    }
    setForm({
      name: cashPeriod.name,
      opening_amount: cashPeriod.opening_amount,
      start_date: cashPeriod.start_date,
      end_date: cashPeriod.end_date || "",
    });
    setEditingId(cashPeriod.id);
    setMessage(null);
    setError(null);
  }

  function validateForm(): string | null {
    if (!form.name.trim()) {
      return "Der Name der Kassenperiode darf nicht leer sein.";
    }
    if (!form.opening_amount.trim()) {
      return "Der Ausgangsbetrag darf nicht leer sein.";
    }
    if (!form.start_date) {
      return "Der Beginn ist erforderlich.";
    }
    if (form.end_date && form.end_date < form.start_date) {
      return "Das Ende darf nicht vor dem Beginn liegen.";
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    setMessage(null);
    setError(null);
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSaving(true);
    const payload = {
      name: form.name.trim(),
      opening_amount: normalizeAmountInput(form.opening_amount),
      start_date: form.start_date,
      end_date: form.end_date || null,
    };

    try {
      if (editingId) {
        await updateCashPeriod(editingId, payload);
        setMessage("Kassenperiode wurde aktualisiert.");
      } else {
        await createCashPeriod({ ...payload, currency: "THB" });
        setMessage("Kassenperiode wurde angelegt.");
      }
      resetForm();
      await loadCashPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassenperiode konnte nicht gespeichert werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClose(cashPeriod: CashPeriod) {
    const endDate = window.prompt(
      `Kassenperiode "${cashPeriod.name}" abschliessen?\n\nNach dem Abschluss kann diese Kassenperiode nicht mehr bearbeitet werden.\n\nEnddatum:`,
      cashPeriod.end_date || new Date().toISOString().slice(0, 10),
    );
    if (endDate === null) {
      return;
    }

    setMessage(null);
    setError(null);
    try {
      await closeCashPeriod(cashPeriod.id, endDate);
      setMessage("Kassenperiode wurde abgeschlossen.");
      if (editingId === cashPeriod.id) {
        resetForm();
      }
      await loadCashPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassenperiode konnte nicht abgeschlossen werden.");
    }
  }

  function handleStartDateChange(value: string) {
    setForm((current) => ({
      ...current,
      start_date: value,
      name: current.name || defaultNameForDate(value),
    }));
  }

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Administration</p>
          <h1>Kassenperioden</h1>
        </div>
      </header>

      <AppCard>
        <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
          <div className="card-heading">
            <span>{editingId ? "Kassenperiode bearbeiten" : "Neue Kassenperiode"}</span>
            <small>Thai Baht</small>
          </div>

          <label className="form-field">
            <span>Name der Kassenperiode</span>
            <input
              maxLength={80}
              required
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>

          <label className="form-field">
            <span>Ausgangsbetrag</span>
            <input
              inputMode="decimal"
              placeholder="20000.00"
              required
              value={form.opening_amount}
              onChange={(event) => setForm({ ...form, opening_amount: event.target.value })}
            />
          </label>

          <div className="money-preview">
            <span>Formatierte Vorschau</span>
            <strong>{form.opening_amount ? formatThaiBaht(normalizeAmountInput(form.opening_amount)) : "THB 0.00"}</strong>
          </div>

          <label className="form-field">
            <span>Beginn</span>
            <input
              required
              type="date"
              value={form.start_date}
              onChange={(event) => handleStartDateChange(event.target.value)}
            />
          </label>

          <label className="form-field">
            <span>Ende optional</span>
            <input
              type="date"
              value={form.end_date}
              onChange={(event) => setForm({ ...form, end_date: event.target.value })}
            />
          </label>

          <div className="settings-list">
            <div>
              <span>Waehrung</span>
              <strong>Thai Baht / THB</strong>
            </div>
          </div>

          <div className="action-row">
            <button className="primary-action" disabled={isSaving} type="submit">
              {editingId ? "Kassenperiode speichern" : "Kassenperiode anlegen"}
            </button>
            {editingId ? (
              <button className="secondary-action" onClick={resetForm} type="button">
                Abbrechen
              </button>
            ) : null}
          </div>
        </form>
      </AppCard>

      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? (
        <div className="form-error" role="alert">
          <p>{error}</p>
          <button className="secondary-action" type="button" onClick={() => void loadCashPeriods()}>
            Erneut laden
          </button>
        </div>
      ) : null}

      <div className="cash-period-list" aria-live="polite">
        {isLoading ? <AppCard>Kassenperioden werden geladen</AppCard> : null}
        {!isLoading && cashPeriods.length === 0 ? (
          <AppCard>Noch keine Kassenperiode vorhanden. Lege oben die erste Periode an.</AppCard>
        ) : null}
        {cashPeriods.map((cashPeriod) => (
          <AppCard
            className={`cash-period-card${cashPeriod.status === "active" ? " cash-period-card--active" : " cash-period-card--closed"}`}
            key={cashPeriod.id}
          >
            <div className="cash-period-card__header">
              <div>
                <strong>{cashPeriod.name}</strong>
                <span>{formatDate(cashPeriod.start_date)} bis {formatDate(cashPeriod.end_date)}</span>
              </div>
              <span className={`status-pill ${cashPeriod.status === "active" ? "status-pill--active" : ""}`}>
                {cashPeriod.status === "active" ? "aktiv" : "abgeschlossen"}
              </span>
            </div>
            <div className="cash-period-amount">{formatThaiBaht(cashPeriod.opening_amount, cashPeriod.currency)}</div>
            <div className="settings-list">
              <div>
                <span>Erstellt von</span>
                <strong>{cashPeriod.created_by.display_name}</strong>
              </div>
              <div>
                <span>Abschluss</span>
                <strong>{cashPeriod.closed_at ? new Date(cashPeriod.closed_at).toLocaleDateString("de-DE") : "offen"}</strong>
              </div>
              <div>
                <span>Abgeschlossen von</span>
                <strong>{cashPeriod.closed_by?.display_name || "offen"}</strong>
              </div>
            </div>
            {cashPeriod.status === "active" ? (
              <div className="action-row">
                <button className="secondary-action" onClick={() => startEdit(cashPeriod)} type="button">
                  Bearbeiten
                </button>
                <button className="secondary-action" onClick={() => void handleClose(cashPeriod)} type="button">
                  Abschliessen
                </button>
              </div>
            ) : null}
          </AppCard>
        ))}
      </div>
    </PageContainer>
  );
}
