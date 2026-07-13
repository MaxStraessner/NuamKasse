import { FormEvent, useEffect, useState } from "react";
import { ChevronRight, Plus, UserRound } from "lucide-react";

import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import {
  createUser,
  listUsers,
  resetUserPassword,
  updateUser,
} from "../services/usersApi";
import type { User, UserRole } from "../types/user";

type CreateForm = {
  username: string;
  display_name: string;
  password: string;
  password_confirmation: string;
  role: UserRole;
};

const emptyCreateForm: CreateForm = {
  username: "",
  display_name: "",
  password: "",
  password_confirmation: "",
  role: "member",
};

export function UserAdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<CreateForm>(emptyCreateForm);
  const [resetPasswordByUser, setResetPasswordByUser] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "status" | "reset"; user: User; nextStatus?: boolean } | null>(null);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  async function loadUsers() {
    setIsLoading(true);
    try {
      setUsers(await listUsers());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benutzer konnten nicht geladen werden.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadUsers();
  }, []);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const created = await createUser(form);
      setUsers((current) => [...current, created]);
      setForm(emptyCreateForm);
      setIsCreateOpen(false);
      setMessage("Benutzer wurde angelegt. Beim ersten Anmelden ist ein neues Passwort erforderlich.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benutzer konnte nicht angelegt werden.");
    }
  }

  async function handleStatus(user: User, is_active: boolean) {
    try {
      const updated = await updateUser(user.id, { is_active });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Benutzer wurde aktualisiert.");
      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benutzer konnte nicht aktualisiert werden.");
    }
  }

  async function handleRole(user: User, role: UserRole) {
    try {
      const updated = await updateUser(user.id, { role });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Rolle wurde aktualisiert.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rolle konnte nicht aktualisiert werden.");
    }
  }

  async function handleReset(user: User) {
    const newPassword = resetPasswordByUser[user.id] || "";
    try {
      await resetUserPassword(user.id, {
        new_password: newPassword,
        new_password_confirmation: newPassword,
      });
      await loadUsers();
      setResetPasswordByUser((current) => ({ ...current, [user.id]: "" }));
      setMessage("Passwort wurde zurückgesetzt. Der Benutzer muss ein eigenes Passwort vergeben.");
      setConfirmAction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passwort konnte nicht zurückgesetzt werden.");
    }
  }

  return (
    <PageContainer>
      <PageHeader backLabel="Einstellungen" backTo="/settings" eyebrow="Verwaltung" title="Benutzer" action={<button aria-label="Benutzer hinzufügen" className="page-action" onClick={() => setIsCreateOpen(true)} type="button"><Plus aria-hidden="true" /><span>Neu</span></button>} />

      <p className="section-intro">Konten, Zugriffsrollen und Passwörter zentral verwalten.</p>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <AppCard className="admin-list" aria-live="polite">
        {isLoading ? <div className="list-skeleton" aria-label="Benutzer werden geladen" /> : null}
        {!isLoading && users.length === 0 ? <p className="empty-state">Noch keine Benutzer vorhanden.</p> : null}
        {users.map((user) => (
          <button className="admin-list__row" key={user.id} onClick={() => setSelectedUserId(user.id)} type="button">
            <span className="admin-list__icon"><UserRound aria-hidden="true" /></span>
            <span className="admin-list__content"><strong>{user.display_name}</strong><small>@{user.username} · {user.role === "admin" ? "Administrator" : "Mitglied"}</small></span>
            <span className={`status-dot ${user.is_active ? "status-dot--active" : ""}`} aria-label={user.is_active ? "Aktiv" : "Inaktiv"} />
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </AppCard>

      <AppDialog description="Der Benutzer legt nach der ersten Anmeldung ein eigenes Passwort fest." isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="Benutzer hinzufügen">
        <form className="stack-form" onSubmit={(event) => void handleCreate(event)}>
          <label className="form-field">
            <span>Benutzername</span>
            <input value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Anzeigename</span>
            <input value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Passwort</span>
            <input autoComplete="new-password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Passwort wiederholen</span>
            <input autoComplete="new-password" type="password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Rolle</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
              <option value="member">Mitglied</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <button className="primary-action" type="submit">Benutzer anlegen</button>
          <button className="secondary-action" onClick={() => setIsCreateOpen(false)} type="button">Abbrechen</button>
        </form>
      </AppDialog>

      <AppDialog description={selectedUser ? `@${selectedUser.username}` : undefined} isOpen={Boolean(selectedUser)} onClose={() => setSelectedUserId(null)} title={selectedUser?.display_name ?? "Benutzer"}>
        {selectedUser ? <div className="user-detail">
            <div className="settings-list">
              <div>
                <span>Rolle</span>
                <select aria-label="Rolle" value={selectedUser.role} onChange={(event) => void handleRole(selectedUser, event.target.value as UserRole)}>
                  <option value="member">Mitglied</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <span>Passwortwechsel</span>
                <strong>{selectedUser.must_change_password ? "Erforderlich" : "Nicht erforderlich"}</strong>
              </div>
            </div>
            <div className="action-row">
              <button className="secondary-action" type="button" onClick={() => setConfirmAction({ type: "status", user: selectedUser, nextStatus: !selectedUser.is_active })}>
                {selectedUser.is_active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>
            <div className="detail-divider" />
            <h3>Passwort zurücksetzen</h3>
            <p className="help-copy">Beendet bestehende Sitzungen und verlangt bei der nächsten Anmeldung ein neues Passwort.</p>
            <div className="reset-row">
              <input
                aria-label={`Neues Passwort für ${selectedUser.display_name}`}
                placeholder="Neues vorläufiges Passwort"
                type="password"
                value={resetPasswordByUser[selectedUser.id] || ""}
                onChange={(event) =>
                  setResetPasswordByUser((current) => ({
                    ...current,
                    [selectedUser.id]: event.target.value,
                  }))
                }
              />
              <button className="secondary-action" type="button" onClick={() => setConfirmAction({ type: "reset", user: selectedUser })}>
                Passwort zurücksetzen
              </button>
            </div>
          </div> : null}
      </AppDialog>
      <AppDialog description={confirmAction?.type === "reset" ? "Bestehende Sitzungen werden beendet. Beim nächsten Login muss ein neues Passwort vergeben werden." : "Der Zugang zur App wird entsprechend geändert."} isOpen={Boolean(confirmAction)} onClose={() => setConfirmAction(null)} title={confirmAction?.type === "reset" ? "Passwort zurücksetzen?" : `${confirmAction?.user.display_name ?? "Benutzer"} ${confirmAction?.nextStatus ? "aktivieren" : "deaktivieren"}?`}>
        {confirmAction ? <div className="stack-form"><button className={`primary-action${confirmAction.type === "reset" || !confirmAction.nextStatus ? " category-danger-action" : ""}`} onClick={() => confirmAction.type === "reset" ? void handleReset(confirmAction.user) : void handleStatus(confirmAction.user, Boolean(confirmAction.nextStatus))} type="button">Bestätigen</button><button className="secondary-action" onClick={() => setConfirmAction(null)} type="button">Abbrechen</button></div> : null}
      </AppDialog>
    </PageContainer>
  );
}
