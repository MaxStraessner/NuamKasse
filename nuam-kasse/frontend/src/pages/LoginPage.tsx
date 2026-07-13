import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../app/AuthContext";

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const user = await auth.login({ username, password });
      const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || "/";
      navigate(user.must_change_password ? "/change-password" : from, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <form className="auth-panel" onSubmit={(event) => void handleSubmit(event)}>
        <p className="home-header__eyebrow">Gemeinsame Kasse</p>
        <h1>Nuam Kasse</h1>
        <p className="auth-copy">Melde dich mit deinem Benutzerkonto an.</p>

        <label className="form-field">
          <span>Benutzername</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </label>

        <label className="form-field">
          <span>Passwort</span>
          <div className="password-row">
            <input
              autoComplete="current-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button aria-label={showPassword ? "Passwort ausblenden" : "Passwort anzeigen"} type="button" onClick={() => setShowPassword((value) => !value)}>
              {showPassword ? "Ausblenden" : "Anzeigen"}
            </button>
          </div>
        </label>

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="primary-action" type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Anmeldung läuft …" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
