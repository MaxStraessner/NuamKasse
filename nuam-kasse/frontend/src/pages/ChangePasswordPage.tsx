import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";

export function ChangePasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await auth.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmation,
      });
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passwort konnte nicht geändert werden.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={(event) => void handleSubmit(event)}>
        <p className="home-header__eyebrow">Sicherheit</p>
        <h1>Passwort ändern</h1>
        <p className="auth-copy">
          Lege ein eigenes Passwort fest, bevor du die App weiter nutzt.
        </p>

        <label className="form-field">
          <span>Bisheriges Passwort</span>
          <input
            autoComplete="current-password"
            type={showPasswords ? "text" : "password"}
            value={currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Neues Passwort</span>
          <input
            autoComplete="new-password"
            type={showPasswords ? "text" : "password"}
            value={newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Neues Passwort wiederholen</span>
          <input
            autoComplete="new-password"
            type={showPasswords ? "text" : "password"}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>

        <button className="secondary-action" type="button" onClick={() => setShowPasswords((value) => !value)}>
          Passwörter {showPasswords ? "ausblenden" : "einblenden"}
        </button>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <div className="action-row">
          <button className="primary-action" type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Speichern" : "Passwort speichern"}
          </button>
          <button className="secondary-action" type="button" onClick={() => void auth.logout()}>
            Abmelden
          </button>
        </div>
      </form>
    </main>
  );
}
