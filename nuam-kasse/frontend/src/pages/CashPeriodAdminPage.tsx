import { FormEvent, useEffect, useState } from "react";
import { Download, Eye, Pencil, Plus, WalletCards } from "lucide-react";
import { Link } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import {
  closeCashPeriod,
  createCashPeriod,
  downloadCashPeriodExport,
  listCashPeriods,
  startCashPeriod,
  updateCashPeriod,
} from "../services/cashPeriodsApi";
import { formatThaiBaht, normalizeAmountInput } from "../services/money";
import type { CashPeriodArchiveItem } from "../types/cashPeriod";

type CashPeriodForm = {
  name: string;
  opening_amount: string;
  start_date: string;
  end_date: string;
};

const emptyForm: CashPeriodForm = { name: "", opening_amount: "", start_date: "", end_date: "" };

function defaultNameForDate(value: string): string {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(date);
}

function formatDate(value: string | null): string {
  return value ? new Date(`${value}T00:00:00`).toLocaleDateString("de-DE") : "offen";
}

export function CashPeriodAdminPage() {
  const { user } = useAuth();
  const isAdmin = user?.cashbook_role === "admin";
  const [cashPeriods, setCashPeriods] = useState<CashPeriodArchiveItem[]>([]);
  const [form, setForm] = useState<CashPeriodForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [closeTarget, setCloseTarget] = useState<CashPeriodArchiveItem | null>(null);
  const [closeEndDate, setCloseEndDate] = useState("");
  const activePeriod = cashPeriods.find((period) => period.status === "active") ?? null;
  const latestClosedPeriod = cashPeriods.find((period) => period.status === "closed") ?? null;

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

  function startEdit(cashPeriod: CashPeriodArchiveItem) {
    if (!isAdmin || cashPeriod.status === "closed") return;
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
    if (!form.name.trim()) return "Der Name der Kassenperiode darf nicht leer sein.";
    if (!form.opening_amount.trim()) return "Der Ausgangsbetrag darf nicht leer sein.";
    if (!form.start_date) return "Der Beginn ist erforderlich.";
    if (form.end_date && form.end_date < form.start_date) return "Das Ende darf nicht vor dem Beginn liegen.";
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = validateForm();
    setMessage(null);
    setError(validationError);
    if (validationError) return;

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

  function startClose(cashPeriod: CashPeriodArchiveItem) {
    setCloseTarget(cashPeriod);
    setCloseEndDate(cashPeriod.end_date || new Date().toISOString().slice(0, 10));
    setMessage(null);
    setError(null);
  }

  async function handleClose() {
    if (!closeTarget || !closeEndDate) return;
    setIsSaving(true);
    setError(null);
    try {
      const result = await closeCashPeriod(closeTarget.id, closeEndDate);
      setMessage(`Kassenperiode abgeschlossen. Endbestand: ${formatThaiBaht(result.summary.remaining_amount, result.summary.currency)}.`);
      setCloseTarget(null);
      resetForm();
      await loadCashPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassenperiode konnte nicht abgeschlossen werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStartNextPeriod() {
    setIsSaving(true);
    setError(null);
    try {
      const nextPeriod = await startCashPeriod();
      setMessage(`${nextPeriod.name} wurde mit ${formatThaiBaht(nextPeriod.opening_amount, nextPeriod.currency)} Anfangsbestand gestartet.`);
      await loadCashPeriods();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Neue Kassenperiode konnte nicht gestartet werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExport(cashPeriod: CashPeriodArchiveItem) {
    setExportingId(cashPeriod.id);
    setError(null);
    try {
      const blob = await downloadCashPeriodExport(cashPeriod.id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const safeCashbook = (user?.cashbook_name || "Kasse").replace(/[^a-zA-Z0-9_-]+/g, "_");
      const exportEnd = cashPeriod.end_date || new Date().toISOString().slice(0, 10);
      anchor.download = `Nuam_Kasse_${safeCashbook}_${cashPeriod.start_date}_bis_${exportEnd}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Excel-Bericht wurde erzeugt.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Excel-Bericht konnte nicht erzeugt werden.");
    } finally {
      setExportingId(null);
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
      <PageHeader
        backLabel="Einstellungen"
        backTo="/settings"
        eyebrow="Gemeinsame Kasse"
        title="Kassenperioden"
        action={isAdmin && cashPeriods.length === 0 ? (
          <button className="page-action" onClick={() => { resetForm(); setIsFormOpen(true); }} type="button">
            <Plus aria-hidden="true" /><span>Neu</span>
          </button>
        ) : undefined}
      />

      <p className="section-intro">Aktive Periode und Archiv der gemeinsamen Kasse.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <div className="form-error" role="alert"><p>{error}</p><button className="secondary-action" type="button" onClick={() => void loadCashPeriods()}>Erneut laden</button></div> : null}

      <div className="cash-period-archive" aria-live="polite">
        {isLoading ? <AppCard><div className="list-skeleton" aria-label="Kassenperioden werden geladen" /></AppCard> : null}
        {!isLoading && cashPeriods.length === 0 ? <AppCard><p className="empty-state empty-state--padded">Noch keine Kassenperiode vorhanden.</p></AppCard> : null}
        {cashPeriods.map((cashPeriod) => (
          <AppCard className="cash-period-archive__item" key={cashPeriod.id}>
            <div className="cash-period-archive__heading">
              <span className="admin-list__icon"><WalletCards aria-hidden="true" /></span>
              <span>
                <strong>{cashPeriod.name}</strong>
                <small>{formatDate(cashPeriod.start_date)} bis {formatDate(cashPeriod.end_date)}</small>
              </span>
              <span className={`status-pill ${cashPeriod.status === "active" ? "status-pill--active" : ""}`}>
                {cashPeriod.status === "active" ? "Aktiv" : "Abgeschlossen"}
              </span>
            </div>
            <div className="cash-period-metrics">
              <span><small>Einnahmen</small><strong>{formatThaiBaht(cashPeriod.income_amount, cashPeriod.currency)}</strong></span>
              <span><small>Ausgaben</small><strong>{formatThaiBaht(cashPeriod.spent_amount, cashPeriod.currency)}</strong></span>
              <span><small>Saldo</small><strong>{formatThaiBaht(cashPeriod.net_amount, cashPeriod.currency)}</strong></span>
              <span><small>Buchungen</small><strong>{cashPeriod.transaction_count}</strong></span>
            </div>
            <div className="action-row action-row--wrap">
              <Link className="secondary-action" to={`/overview?period=${cashPeriod.id}`}><Eye aria-hidden="true" />Ansehen</Link>
              {isAdmin && cashPeriod.status === "active" ? (
                <button className="secondary-action" onClick={() => startEdit(cashPeriod)} type="button"><Pencil aria-hidden="true" />Bearbeiten</button>
              ) : null}
              <button className="primary-action" disabled={exportingId === cashPeriod.id} onClick={() => void handleExport(cashPeriod)} type="button"><Download aria-hidden="true" />{exportingId === cashPeriod.id ? "Export wird erstellt …" : "Excel exportieren"}</button>
            </div>
          </AppCard>
        ))}
      </div>

      {isAdmin && !activePeriod && latestClosedPeriod ? (
        <AppCard className="cash-period-archive__item">
          <strong>Neue Kassenperiode starten</strong>
          <p>Der Endbestand von {formatThaiBaht(latestClosedPeriod.remaining_amount, latestClosedPeriod.currency)} wird automatisch als Anfangsbestand übernommen. Alte Buchungen werden nicht kopiert.</p>
          <button className="primary-action" disabled={isSaving} onClick={() => void handleStartNextPeriod()} type="button">Neue Kassenperiode starten</button>
        </AppCard>
      ) : null}

      {isAdmin ? (
        <AppDialog description={editingId ? "Änderungen gelten sofort für die aktive Periode." : "Lege den Anfangsbestand für einen neuen Zeitraum fest."} isOpen={isFormOpen} onClose={resetForm} preventClose={isSaving} title={editingId ? "Kassenperiode bearbeiten" : "Neue Kassenperiode"}>
          <form className="stack-form" onSubmit={(event) => void handleSubmit(event)}>
            <label className="form-field"><span>Name der Kassenperiode</span><input maxLength={80} required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="form-field"><span>Ausgangsbetrag</span><input inputMode="decimal" placeholder="20000.00" required value={form.opening_amount} onChange={(event) => setForm({ ...form, opening_amount: event.target.value })} /></label>
            <div className="money-preview"><span>Formatierte Vorschau</span><strong>{form.opening_amount ? formatThaiBaht(normalizeAmountInput(form.opening_amount)) : "THB 0.00"}</strong></div>
            <label className="form-field"><span>Beginn</span><input required type="date" value={form.start_date} onChange={(event) => handleStartDateChange(event.target.value)} /></label>
            <label className="form-field"><span>Ende optional</span><input type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></label>
            <div className="settings-list"><div><span>Währung</span><strong>Thai Baht / THB</strong></div></div>
            <button className="primary-action" disabled={isSaving} type="submit">{editingId ? "Kassenperiode speichern" : "Kassenperiode anlegen"}</button>
            <button className="secondary-action" disabled={isSaving} onClick={resetForm} type="button">Abbrechen</button>
          </form>
        </AppDialog>
      ) : null}

      {isAdmin && activePeriod ? (
        <button className="danger-link" onClick={() => startClose(activePeriod)} type="button">Kasse abschließen</button>
      ) : null}
      <AppDialog description="Bitte prüfe alle Werte. Nach dem Abschluss können Buchungen dieser Kassenperiode nicht mehr verändert oder gelöscht werden." isOpen={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} preventClose={isSaving} title="Kasse abschließen">
        {closeTarget ? (
          <div className="stack-form">
            <div className="closing-summary"><strong>{user?.cashbook_name}</strong><span>{closeTarget.name}</span></div>
            <div className="cash-period-metrics">
              <span><small>Beginn</small><strong>{formatDate(closeTarget.start_date)}</strong></span>
              <span><small>Abschlussdatum</small><strong>{formatDate(closeEndDate)}</strong></span>
              <span><small>Anfangsbestand</small><strong>{formatThaiBaht(closeTarget.opening_amount, closeTarget.currency)}</strong></span>
              <span><small>Einnahmen</small><strong>{formatThaiBaht(closeTarget.income_amount, closeTarget.currency)}</strong></span>
              <span><small>Ausgaben</small><strong>{formatThaiBaht(closeTarget.spent_amount, closeTarget.currency)}</strong></span>
              <span><small>Endbestand</small><strong>{formatThaiBaht(closeTarget.remaining_amount, closeTarget.currency)}</strong></span>
              <span><small>Buchungen</small><strong>{closeTarget.transaction_count}</strong></span>
            </div>
            <label className="form-field"><span>Enddatum</span><input data-autofocus max={new Date().toISOString().slice(0, 10)} min={closeTarget.start_date} onChange={(event) => setCloseEndDate(event.target.value)} required type="date" value={closeEndDate} /></label>
            <p className="form-error" role="note">Nach dem Abschluss können Buchungen dieser Kassenperiode nicht mehr verändert oder gelöscht werden.</p>
            <button className="primary-action category-danger-action" disabled={isSaving || !closeEndDate} onClick={() => void handleClose()} type="button">Kassenperiode endgültig abschließen</button>
            <button className="secondary-action" disabled={isSaving} onClick={() => setCloseTarget(null)} type="button">Abbrechen</button>
          </div>
        ) : null}
      </AppDialog>
    </PageContainer>
  );
}
