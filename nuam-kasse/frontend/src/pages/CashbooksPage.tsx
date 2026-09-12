import { FormEvent, useEffect, useState } from "react";
import { Check, Plus, WalletCards } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { createCashbook, listCashbooks } from "../services/cashbooksApi";
import { formatThaiBaht, normalizeAmountInput } from "../services/money";
import type { CashbookListItem } from "../types/cashbook";

export function CashbooksPage() {
  const { selectCashbook, user } = useAuth();
  const navigate = useNavigate();
  const [cashbooks, setCashbooks] = useState<CashbookListItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [openingAmount, setOpeningAmount] = useState("");
  const [description, setDescription] = useState("");
  const [templateCashbookId, setTemplateCashbookId] = useState<number | "">(user?.cashbook_id ?? "");

  async function loadCashbooks() {
    try {
      const loadedCashbooks = await listCashbooks();
      setCashbooks(loadedCashbooks);
      setTemplateCashbookId((current) => {
        if (current && loadedCashbooks.some((cashbook) => cashbook.id === current)) return current;
        if (user?.cashbook_id && loadedCashbooks.some((cashbook) => cashbook.id === user.cashbook_id)) return user.cashbook_id;
        return loadedCashbooks.length === 1 ? loadedCashbooks[0].id : "";
      });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kassen konnten nicht geladen werden.");
    }
  }

  useEffect(() => { void loadCashbooks(); }, []);

  async function chooseCashbook(cashbookId: number) {
    await selectCashbook(cashbookId);
    navigate("/");
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (cashbooks.length > 0 && !templateCashbookId) {
      setError("Bitte wähle ein Kassenbuch als Kategorienvorlage aus.");
      return;
    }
    setIsSaving(true);
    setError(null);
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

  return (
    <PageContainer>
      <PageHeader backLabel="Zurück" backTo="/" eyebrow="Übersicht" title="Meine Kassen" action={(
        <button className="page-action" onClick={() => setIsOpen(true)} type="button"><Plus aria-hidden="true" /><span>Neue Kasse</span></button>
      )} />
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="cash-period-archive">
        {cashbooks.map((cashbook) => (
          <AppCard className="cash-period-archive__item" key={cashbook.id}>
            <div className="cash-period-archive__heading">
              <span className="admin-list__icon"><WalletCards aria-hidden="true" /></span>
              <span><strong>{cashbook.name}</strong><small>{cashbook.description || (cashbook.active_period_id ? "Aktive Kassenperiode" : "Keine aktive Periode")}</small></span>
              {user?.cashbook_id === cashbook.id ? <span className="status-pill status-pill--active"><Check aria-hidden="true" /> Aktiv</span> : null}
            </div>
            <div className="money-preview"><span>Aktueller Bestand</span><strong>{formatThaiBaht(cashbook.current_balance, cashbook.currency)}</strong></div>
            <button className={user?.cashbook_id === cashbook.id ? "secondary-action" : "primary-action"} disabled={user?.cashbook_id === cashbook.id} onClick={() => void chooseCashbook(cashbook.id)} type="button">
              {user?.cashbook_id === cashbook.id ? "Ausgewählt" : "Kasse öffnen"}
            </button>
          </AppCard>
        ))}
      </div>
      <AppDialog description="Die neue Kasse erhält eine eigene Kopie der gewählten Kategorienstruktur und ihre erste aktive Kassenperiode." isOpen={isOpen} onClose={() => setIsOpen(false)} preventClose={isSaving} title="Neue Kasse">
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
              <small>Reihenfolge, Unterkategorien, Typen und Bilder werden einmalig übernommen.</small>
            </label>
          ) : null}
          <button className="primary-action" disabled={isSaving} type="submit">Kasse anlegen</button>
          <button className="secondary-action" disabled={isSaving} onClick={() => setIsOpen(false)} type="button">Abbrechen</button>
        </form>
      </AppDialog>
    </PageContainer>
  );
}
