import { FormEvent, useEffect, useState } from "react";

import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";
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
      setMessage("Benutzer wurde angelegt. Beim ersten Anmelden ist ein neues Passwort erforderlich.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Benutzer konnte nicht angelegt werden.");
    }
  }

  async function handleStatus(user: User, is_active: boolean) {
    if (!window.confirm(`${user.display_name} wirklich ${is_active ? "aktivieren" : "deaktivieren"}?`)) {
      return;
    }
    try {
      const updated = await updateUser(user.id, { is_active });
      setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setMessage("Benutzer wurde aktualisiert.");
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
    if (!window.confirm(`Passwort von ${user.display_name} zuruecksetzen und Sitzungen beenden?`)) {
      return;
    }
    try {
      await resetUserPassword(user.id, {
        new_password: newPassword,
        new_password_confirmation: newPassword,
      });
      await loadUsers();
      setResetPasswordByUser((current) => ({ ...current, [user.id]: "" }));
      setMessage("Passwort wurde zurueckgesetzt. Der Benutzer muss ein eigenes Passwort vergeben.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passwort konnte nicht zurueckgesetzt werden.");
    }
  }

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Administration</p>
          <h1>Benutzer</h1>
        </div>
      </header>

      <AppCard>
        <form className="stack-form" onSubmit={(event) => void handleCreate(event)}>
          <div className="card-heading">
            <span>Neuer Benutzer</span>
            <small>Vorlaeufiges Passwort</small>
          </div>
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
            <input type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Passwort wiederholen</span>
            <input type="password" value={form.password_confirmation} onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })} required />
          </label>
          <label className="form-field">
            <span>Rolle</span>
            <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}>
              <option value="member">Mitglied</option>
              <option value="admin">Administrator</option>
            </select>
          </label>
          <button className="primary-action" type="submit">Benutzer anlegen</button>
        </form>
      </AppCard>

      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}

      <div className="user-list" aria-live="polite">
        {isLoading ? <AppCard>Benutzer werden geladen</AppCard> : null}
        {users.map((user) => (
          <AppCard key={user.id} className="user-card">
            <div className="user-card__header">
              <div>
                <strong>{user.display_name}</strong>
                <span>{user.username}</span>
              </div>
              <span className={`status-pill ${user.is_active ? "status-pill--active" : ""}`}>
                {user.is_active ? "aktiv" : "inaktiv"}
              </span>
            </div>
            <div className="settings-list">
              <div>
                <span>Rolle</span>
                <select value={user.role} onChange={(event) => void handleRole(user, event.target.value as UserRole)}>
                  <option value="member">Mitglied</option>
                  <option value="admin">Administrator</option>
                </select>
              </div>
              <div>
                <span>Passwortwechsel</span>
                <strong>{user.must_change_password ? "erforderlich" : "nicht erforderlich"}</strong>
              </div>
            </div>
            <div className="action-row">
              <button className="secondary-action" type="button" onClick={() => void handleStatus(user, !user.is_active)}>
                {user.is_active ? "Deaktivieren" : "Aktivieren"}
              </button>
            </div>
            <div className="reset-row">
              <input
                aria-label={`Neues Passwort fuer ${user.display_name}`}
                placeholder="Neues vorlaeufiges Passwort"
                type="password"
                value={resetPasswordByUser[user.id] || ""}
                onChange={(event) =>
                  setResetPasswordByUser((current) => ({
                    ...current,
                    [user.id]: event.target.value,
                  }))
                }
              />
              <button className="secondary-action" type="button" onClick={() => void handleReset(user)}>
                Passwort zuruecksetzen
              </button>
            </div>
          </AppCard>
        ))}
      </div>
    </PageContainer>
  );
}
