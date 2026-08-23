import { useEffect, useState } from "react";
import { Plus, UserRound, UserRoundMinus } from "lucide-react";

import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import {
  addCashbookMember,
  listCashbookMemberCandidates,
  listCashbookMembers,
  removeCashbookMember,
} from "../services/cashbooksApi";
import type { CashbookMemberCandidate, CashbookMembership } from "../types/cashbook";

export function CashbookMembersPage() {
  const [members, setMembers] = useState<CashbookMembership[]>([]);
  const [candidates, setCandidates] = useState<CashbookMemberCandidate[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState("");
  const [removeTarget, setRemoveTarget] = useState<CashbookMembership | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    try {
      const [nextMembers, nextCandidates] = await Promise.all([
        listCashbookMembers(),
        listCashbookMemberCandidates(),
      ]);
      setMembers(nextMembers);
      setCandidates(nextCandidates);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mitglieder konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function handleAdd() {
    if (!selectedCandidateId) return;
    setIsSaving(true);
    setError(null);
    try {
      await addCashbookMember(Number(selectedCandidateId));
      setMessage("Mitglied wurde der gemeinsamen Kasse zugeordnet.");
      setSelectedCandidateId("");
      setIsAddOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mitglied konnte nicht hinzugefügt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsSaving(true);
    setError(null);
    try {
      await removeCashbookMember(removeTarget.user.id);
      setMessage("Mitglied wurde aus der gemeinsamen Kasse entfernt.");
      setRemoveTarget(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mitglied konnte nicht entfernt werden.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        backLabel="Einstellungen"
        backTo="/settings"
        eyebrow="Gemeinsame Kasse"
        title="Mitglieder"
        action={(
          <button className="page-action" onClick={() => setIsAddOpen(true)} type="button">
            <Plus aria-hidden="true" /><span>Hinzufügen</span>
          </button>
        )}
      />
      <p className="section-intro">Bestehende Benutzer mit der gemeinsamen Kasse verbinden.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <AppCard className="admin-list" aria-live="polite">
        {isLoading ? <div className="list-skeleton" aria-label="Mitglieder werden geladen" /> : null}
        {members.map((membership) => (
          <div className="admin-list__row" key={membership.id}>
            <span className="admin-list__icon"><UserRound aria-hidden="true" /></span>
            <span className="admin-list__content">
              <strong>{membership.user.display_name}</strong>
              <small>@{membership.user.username} · {membership.role === "admin" ? "Administrator" : "Mitglied"}</small>
            </span>
            {membership.role === "member" ? (
              <button
                aria-label={`${membership.user.display_name} entfernen`}
                className="category-action-button category-action-button--danger"
                onClick={() => setRemoveTarget(membership)}
                type="button"
              >
                <UserRoundMinus aria-hidden="true" />
              </button>
            ) : <span className="status-pill status-pill--active">Verwalter</span>}
          </div>
        ))}
      </AppCard>

      <AppDialog
        description="Der Benutzer behält seinen eigenen Login und sieht danach dieselbe Kasse."
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        preventClose={isSaving}
        title="Mitglied hinzufügen"
      >
        <div className="stack-form">
          <label className="form-field">
            <span>Bestehender Benutzer</span>
            <select value={selectedCandidateId} onChange={(event) => setSelectedCandidateId(event.target.value)}>
              <option value="">Bitte auswählen</option>
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>{candidate.display_name} (@{candidate.username})</option>
              ))}
            </select>
          </label>
          {candidates.length === 0 ? <p className="help-copy">Alle aktiven Benutzer sind bereits zugeordnet.</p> : null}
          <button className="primary-action" disabled={isSaving || !selectedCandidateId} onClick={() => void handleAdd()} type="button">Mitglied hinzufügen</button>
          <button className="secondary-action" disabled={isSaving} onClick={() => setIsAddOpen(false)} type="button">Abbrechen</button>
        </div>
      </AppDialog>

      <AppDialog
        description="Das Benutzerkonto und bisherige Buchungen bleiben vollständig erhalten."
        isOpen={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        preventClose={isSaving}
        title="Mitglied entfernen?"
      >
        <div className="stack-form">
          <p>{removeTarget?.user.display_name} verliert den Zugriff auf diese Kasse.</p>
          <button className="primary-action category-danger-action" disabled={isSaving} onClick={() => void handleRemove()} type="button">Mitglied entfernen</button>
          <button className="secondary-action" disabled={isSaving} onClick={() => setRemoveTarget(null)} type="button">Abbrechen</button>
        </div>
      </AppDialog>
    </PageContainer>
  );
}
