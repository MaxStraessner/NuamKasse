import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArchiveRestore, Check, Eye, LockKeyhole, Plus, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import {
  closeCashbook,
  createCashbook,
  listCashbooks,
  reopenCashbook,
} from "../services/cashbooksApi";
import { formatThaiBaht, normalizeAmountInput } from "../services/money";
import type { CashbookListItem } from "../types/cashbook";

function formatDateTime(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("de-DE") : "–";
}

export function CashbooksPage() {
  const { selectCashbook, user } = useAuth();
  const navigate = useNavigate();
  const [cashbooks, setCashbooks] = useState<CashbookListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [description, setDescription] = useState("");
  const [templateCashbookId, setTemplateCashbookId] = useState<number | "">(user?.cashbook_id ?? "");
  const [closeTarget, setCloseTarget] = useState<CashbookListItem | null>(null);
  const [closeEndDate, setCloseEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [reopenTarget, setReopenTarget] = useState<CashbookListItem | null>(null);
  const [reopenStartDate, setReopenStartDate] = useState(new Date().toISOString().slice(0, 10));

  const openCashbooks = useMemo(
    () => cashbooks.filter((cashbook) => cashbook.status === "open"),
    [cashbooks],
  );
  const activeCashbook = openCashbooks.find((cashbook) => cashbook.id === user?.cashbook_id) ?? null;
  const furtherCashbooks = openCashbooks.filter((cashbook) => cashbook.id !== activeCashbook?.id);
  const archivedCashbooks = useMemo(
    () => cashbooks.filter((cashbook) => cashbook.status === "archived"),
    [cashbooks],
  );

  async function loadCashbooks() {
    setIsLoading(true);
    try {
      const loadedCashbooks = await listCashbooks();
      setCashbooks(loadedCashbooks);
      setTemplateCashbookId((current) => {
        if (current && loadedCashbooks.some((cashbook) => cashbook.id === current)) return current;
        if (user?.cashbook_id && loadedCashbooks.some((cashbook) => cashbook.id === user.cashbook_id)) return user.cashbook_id;
        return loadedCashbooks.length === 1 ? loadedCashbooks[0].id : "";
      });
      setError(null);
      return loadedCashbooks;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassen konnten nicht geladen werden.");
      return [];
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => { void loadCashbooks(); }, []);

  async function chooseCashbook(cashbookId: number, destination = "/") {
    await selectCashbook(cashbookId);
    navigate(destination);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cashbooks.length > 0 && !templateCashbookId) {
      setError("Bitte wähle eine Kasse als Kategorienvorlage aus.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const cashbook = await createCashbook({
        name: name.trim(),
        opening_amount: normalizeAmountInput(openingAmount),
        description: description.trim() || null,
        template_cashbook_id: templateCashbookId || null,
      });
      await selectCashbook(cashbook.id);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasse konnte nicht angelegt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClose() {
    if (!closeTarget || !closeEndDate) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      await closeCashbook(closeTarget.id, closeEndDate);
      const closedCashbook = closeTarget;
      setCloseTarget(null);
      const loaded = await loadCashbooks();
      const fallback = loaded.find((cashbook) => cashbook.status === "open");
      if (closedCashbook.id === user?.cashbook_id && fallback) {
        await selectCashbook(fallback.id);
      }
      setMessage(`${closedCashbook.name} wurde geschlossen und ins Archiv verschoben.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasse konnte nicht geschlossen werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReopen() {
    if (!reopenTarget || !reopenStartDate) return;
    setIsSaving(true);
    setError(null);
    setMessage(null);
    try {
      const openedCashbook = reopenTarget;
      await reopenCashbook(openedCashbook.id, reopenStartDate);
      await selectCashbook(openedCashbook.id);
      setReopenTarget(null);
      await loadCashbooks();
      setMessage(`${openedCashbook.name} ist wieder geöffnet.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kasse konnte nicht wieder geöffnet werden.");
    } finally {
      setIsSaving(false);
    }
  }

  function renderCashbook(cashbook: CashbookListItem, kind: "active" | "open" | "archived") {
    const isSelected = cashbook.id === user?.cashbook_id;
    const isAdmin = cashbook.role === "admin";
    return (
      <AppCard className="cash-period-archive__item" key={cashbook.id}>
        <div className="cash-period-archive__heading">
          <span className="admin-list__icon"><WalletCards aria-hidden="true" /></span>
          <span>
            <strong>{cashbook.name}</strong>
            <small>{cashbook.description || (kind === "archived" ? `Geschlossen am ${formatDateTime(cashbook.archived_at)}` : "Geöffnet")}</small>
          </span>
          {kind === "active" ? <span className="status-pill status-pill--active"><Check aria-hidden="true" /> Aktiv</span> : null}
          {kind === "archived" ? <span className="status-pill">Archiv</span> : null}
        </div>
        <div className="money-preview">
          <span>{kind === "archived" ? "Letzter Bestand" : "Aktueller Bestand"}</span>
          <strong>{formatThaiBaht(cashbook.current_balance, cashbook.currency)}</strong>
        </div>
        <div className="cashbook-actions">
          {kind === "open" ? (
            <button className="primary-action" onClick={() => void chooseCashbook(cashbook.id)} type="button">Kasse verwenden</button>
          ) : null}
          {kind === "active" ? (
            <button className="secondary-action" onClick={() => void chooseCashbook(cashbook.id, "/settings/cash-periods")} type="button"><Eye aria-hidden="true" /> Details und Archiv</button>
          ) : null}
          {kind === "archived" && !isAdmin ? (
            <button className="secondary-action" onClick={() => void chooseCashbook(cashbook.id, "/settings/cash-periods")} type="button"><Eye aria-hidden="true" /> Archiv ansehen</button>
          ) : null}
          {kind !== "archived" && isAdmin ? (
            <button className="secondary-action cashbook-close-action" onClick={() => { setCloseTarget(cashbook); setCloseEndDate(new Date().toISOString().slice(0, 10)); }} type="button"><LockKeyhole aria-hidden="true" /> Kasse schließen</button>
          ) : null}
          {kind === "archived" && isAdmin ? (
            <button className="primary-action" onClick={() => { setReopenTarget(cashbook); setReopenStartDate(new Date().toISOString().slice(0, 10)); }} type="button"><ArchiveRestore aria-hidden="true" /> Kasse wieder öffnen</button>
          ) : null}
          {kind !== "active" && isSelected ? <span className="help-copy">Ausgewählt</span> : null}
        </div>
      </AppCard>
    );
  }

  return (
    <PageContainer>
      <PageHeader backLabel="Zurück" backTo="/settings" eyebrow="Einstellungen" title="Kassenverwaltung" action={(
        <button className="page-action" onClick={() => setIsOpen(true)} type="button"><Plus aria-hidden="true" /><span>Neue Kasse</span></button>
      )} />
      <p className="section-intro">Hier verwaltest du geöffnete und geschlossene Kassen an einem Ort.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {isLoading ? <AppCard><div className="list-skeleton" aria-label="Kassen werden geladen" /></AppCard> : null}

      {!isLoading ? (
        <div className="cashbook-management-sections">
          <section aria-labelledby="active-cashbook-heading">
            <div className="cashbook-section-heading"><h2 id="active-cashbook-heading">Aktive Kasse</h2><small>Die aktuell verwendete geöffnete Kasse</small></div>
            <div className="cash-period-archive">
              {activeCashbook ? renderCashbook(activeCashbook, "active") : <AppCard><p className="empty-state empty-state--padded">Zurzeit ist keine geöffnete Kasse aktiv.</p></AppCard>}
            </div>
          </section>
          {furtherCashbooks.length > 0 ? (
            <section aria-labelledby="further-cashbooks-heading">
              <div className="cashbook-section-heading"><h2 id="further-cashbooks-heading">Weitere Kassen</h2><small>{furtherCashbooks.length} geöffnet</small></div>
              <div className="cash-period-archive">{furtherCashbooks.map((cashbook) => renderCashbook(cashbook, "open"))}</div>
            </section>
          ) : null}
          <section aria-labelledby="cashbook-archive-heading">
            <div className="cashbook-section-heading"><h2 id="cashbook-archive-heading">Archiv</h2><small>{archivedCashbooks.length} geschlossen</small></div>
            <div className="cash-period-archive">
              {archivedCashbooks.length > 0 ? archivedCashbooks.map((cashbook) => renderCashbook(cashbook, "archived")) : <AppCard><p className="empty-state empty-state--padded">Noch keine geschlossene Kasse.</p></AppCard>}
            </div>
          </section>
        </div>
      ) : null}

      <AppDialog description="Die neue Kasse erhält eine eigene Kategorienstruktur. Reihenfolge, Unterkategorien und Bilder werden von der gewählten Kasse übernommen." isOpen={isOpen} onClose={() => setIsOpen(false)} preventClose={isSaving} title="Neue Kasse">
        <form className="stack-form" onSubmit={(event) => void handleCreate(event)}>
          <label className="form-field"><span>Name der Kasse</span><input maxLength={120} required value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label className="form-field"><span>Anfangsbestand</span><input inputMode="decimal" required value={openingAmount} onChange={(event) => setOpeningAmount(event.target.value)} /></label>
          <label className="form-field"><span>Beschreibung optional</span><textarea maxLength={1000} rows={3} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          {cashbooks.length > 0 ? (
            <label className="form-field">
              <span>Kategorien übernehmen von</span>
              <select aria-label="Kategorien übernehmen von" required value={templateCashbookId} onChange={(event) => setTemplateCashbookId(Number(event.target.value))}>
                <option disabled value="">Bitte auswählen</option>
                {cashbooks.map((cashbook) => <option key={cashbook.id} value={cashbook.id}>{cashbook.name}</option>)}
              </select>
              <small>Struktur, Reihenfolge, Typen und Bilder werden einmalig übernommen.</small>
            </label>
          ) : null}
          <button className="primary-action" disabled={isSaving} type="submit">Kasse anlegen</button>
          <button className="secondary-action" disabled={isSaving} onClick={() => setIsOpen(false)} type="button">Abbrechen</button>
        </form>
      </AppDialog>

      <AppDialog description="Alle Buchungen, Kategorien, Bilder, Mitglieder und Berechtigungen bleiben erhalten. Neue Buchungen sind danach nicht möglich, bis die Kasse wieder geöffnet wird." isOpen={Boolean(closeTarget)} onClose={() => setCloseTarget(null)} preventClose={isSaving} title="Kasse schließen">
        {closeTarget ? <div className="stack-form"><strong>{closeTarget.name}</strong><label className="form-field"><span>Abschlussdatum</span><input max={new Date().toISOString().slice(0, 10)} onChange={(event) => setCloseEndDate(event.target.value)} required type="date" value={closeEndDate} /></label><button className="primary-action category-danger-action" disabled={isSaving || !closeEndDate} onClick={() => void handleClose()} type="button">Kasse endgültig schließen</button><button className="secondary-action" disabled={isSaving} onClick={() => setCloseTarget(null)} type="button">Abbrechen</button></div> : null}
      </AppDialog>

      <AppDialog description="Die vorhandene Kasse wird mit ihrem letzten Endbestand wieder geöffnet. Alte Buchungen, Kategorien, Bilder und Zugriffsrechte bleiben unverändert erhalten." isOpen={Boolean(reopenTarget)} onClose={() => setReopenTarget(null)} preventClose={isSaving} title="Kasse wieder öffnen">
        {reopenTarget ? <div className="stack-form"><strong>{reopenTarget.name}</strong><label className="form-field"><span>Öffnungsdatum</span><input onChange={(event) => setReopenStartDate(event.target.value)} required type="date" value={reopenStartDate} /></label><button className="primary-action" disabled={isSaving || !reopenStartDate} onClick={() => void handleReopen()} type="button">Kasse wieder öffnen</button><button className="secondary-action" disabled={isSaving} onClick={() => setReopenTarget(null)} type="button">Abbrechen</button></div> : null}
      </AppDialog>
    </PageContainer>
  );
}
