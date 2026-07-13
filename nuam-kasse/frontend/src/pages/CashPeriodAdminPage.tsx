import { FormEvent, useEffect, useState } from "react";
import { ChevronRight, Plus, WalletCards } from "lucide-react";

import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
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
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashPeriod | null>(null);
  const [closeEndDate, setCloseEndDate] = useState("");

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
    setIsFormOpen(false);
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
    setIsFormOpen(true);
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

  function startClose(cashPeriod: CashPeriod) {
    setCloseTarget(cashPeriod);
    setCloseEndDate(cashPeriod.end_date || new Date().toISOString().slice(0, 10));
  }

  async function handleClose() {
    if (!closeTarget || !closeEndDate) return;
    setMessage(null);
    setError(null);
    try {
      await closeCashPeriod(closeTarget.id, closeEndDate);
      setMessage("Kassenperiode wurde abgeschlossen.");
      if (editingId === closeTarget.id) {
        resetForm();
      }
      setCloseTarget(null);
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
      <PageHeader backLabel="Einstellungen" backTo="/settings" eyebrow="Verwaltung" title="Kassenperioden" action={<button className="page-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button"><Plus aria-hidden="true" /><span>Neu</span></button>} />

      <p className="section-intro">Aktuelle Kasse und abgeschlossene Zeiträume verwalten.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <div className="form-error" role="alert"><p>{error}</p><button className="secondary-action" type="button" onClick={() => void loadCashPeriods()}>Erneut laden</button></div> : null}

      <AppCard className="admin-list" aria-live="polite">
        {isLoading ? <div className="list-skeleton" aria-label="Kassenperioden werden geladen" /> : null}
        {!isLoading && cashPeriods.length === 0 ? <p className="empty-state empty-state--padded">Noch keine Kassenperiode vorhanden.</p> : null}
        {cashPeriods.map((cashPeriod) => {
          const content = <><span className="admin-list__icon"><WalletCards aria-hidden="true" /></span><span className="admin-list__content"><strong>{cashPeriod.name}</strong><small>{formatDate(cashPeriod.start_date)} bis {formatDate(cashPeriod.end_date)} · {formatThaiBaht(cashPeriod.opening_amount, cashPeriod.currency)}</small></span><span className={`status-dot ${cashPeriod.status === "active" ? "status-dot--active" : ""}`} aria-label={cashPeriod.status === "active" ? "Aktiv" : "Abgeschlossen"} />{cashPeriod.status === "active" ? <ChevronRight aria-hidden="true" /> : <span />}</>;
          return cashPeriod.status === "active"
            ? <button className="admin-list__row cash-period-row" key={cashPeriod.id} onClick={() => startEdit(cashPeriod)} type="button">{content}</button>
            : <div className="admin-list__row cash-period-row cash-period-row--closed" key={cashPeriod.id}>{content}</div>;
        })}
      </AppCard>

      <AppDialog description={editingId ? "Änderungen gelten sofort für die aktive Periode." : "Lege das Budget für einen neuen Zeitraum fest."} isOpen={isFormOpen} onClose={resetForm} preventClose={isSaving} title={editingId ? "Kassenperiode bearbeiten" : "Neue Kassenperiode"}>
        <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
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
              <span>Währung</span>
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
      </AppDialog>

      {cashPeriods.find((period) => period.status === "active") ? <button className="danger-link" onClick={() => startClose(cashPeriods.find((period) => period.status === "active")!)} type="button">Aktive Kassenperiode abschließen</button> : null}
      <AppDialog description="Nach dem Abschluss kann diese Kassenperiode nicht mehr bearbeitet werden." isOpen={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} title="Kassenperiode abschließen">
        <div className="stack-form"><div className="closing-summary"><strong>{closeTarget?.name}</strong><span>{closeTarget ? formatThaiBaht(closeTarget.opening_amount, closeTarget.currency) : null}</span></div><label className="form-field"><span>Enddatum</span><input data-autofocus min={closeTarget?.start_date} onChange={(event) => setCloseEndDate(event.target.value)} required type="date" value={closeEndDate} /></label><button className="primary-action category-danger-action" onClick={() => void handleClose()} type="button">Periode endgültig abschließen</button><button className="secondary-action" onClick={() => setCloseTarget(null)} type="button">Abbrechen</button></div>
      </AppDialog>
    </PageContainer>
  );
}
