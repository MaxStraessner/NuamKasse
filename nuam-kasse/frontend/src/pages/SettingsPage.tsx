import { Link } from "react-router-dom";

import { APP_VERSION } from "../app/appVersion";
import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";

export function SettingsPage() {
  const { user } = useAuth();

  return (
    <PageContainer>
      <header className="home-header">
        <div>
          <p className="home-header__eyebrow">Konto</p>
          <h1>Einstellungen</h1>
        </div>
      </header>

      <AppCard>
        <div className="settings-list">
          <div>
            <span>Anzeigename</span>
            <strong>{user?.display_name}</strong>
          </div>
          <div>
            <span>Benutzername</span>
            <strong>{user?.username}</strong>
          </div>
          <div>
            <span>Rolle</span>
            <strong>{user?.role === "admin" ? "Administrator" : "Mitglied"}</strong>
          </div>
          <div>
            <span>Version</span>
            <strong>{APP_VERSION}</strong>
          </div>
        </div>
      </AppCard>

      <AppCard>
        <Link className="primary-link" to="/change-password">
          Eigenes Passwort ändern
        </Link>
      </AppCard>

      {user?.role === "admin" ? (
        <>
          <AppCard>
            <Link className="primary-link" to="/settings/cash-periods">
              Kassenverwaltung
            </Link>
          </AppCard>
          <AppCard>
            <Link className="primary-link" to="/settings/categories">
              Kategorieverwaltung
            </Link>
          </AppCard>
          <AppCard>
            <Link className="primary-link" to="/settings/users">
              Benutzerverwaltung
            </Link>
          </AppCard>
        </>
      ) : null}
    </PageContainer>
  );
}
