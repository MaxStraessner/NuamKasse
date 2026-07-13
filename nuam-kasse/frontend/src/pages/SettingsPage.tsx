import { ChevronRight, KeyRound, Layers3, LogOut, PiggyBank, ShieldCheck, UserRoundCog } from "lucide-react";
import { Link } from "react-router-dom";

import { APP_VERSION } from "../app/appVersion";
import { useAuth } from "../app/AuthContext";
import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

type SettingsLinkProps = { description: string; icon: typeof KeyRound; label: string; to: string };

function SettingsLink({ description, icon: Icon, label, to }: SettingsLinkProps) {
  return (
    <Link className="settings-menu__item" to={to}>
      <Icon aria-hidden="true" />
      <span><strong>{label}</strong><small>{description}</small></span>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

export function SettingsPage() {
  const { logout, user } = useAuth();

  return (
    <PageContainer>
      <PageHeader eyebrow="Konto" title="Einstellungen" />

      <AppCard className="account-card">
        <div className="account-card__avatar" aria-hidden="true">{user?.display_name?.slice(0, 1).toUpperCase()}</div>
        <div><strong>{user?.display_name}</strong><span>@{user?.username} · {user?.role === "admin" ? "Administrator" : "Mitglied"}</span></div>
      </AppCard>

      <section className="settings-section" aria-labelledby="security-settings">
        <h2 id="security-settings">Sicherheit</h2>
        <AppCard className="settings-menu">
          <SettingsLink description="Dein persönliches Kennwort aktualisieren" icon={KeyRound} label="Passwort ändern" to="/change-password" />
        </AppCard>
      </section>

      {user?.role === "admin" ? (
        <section className="settings-section" aria-labelledby="admin-settings">
          <h2 id="admin-settings">Verwaltung</h2>
          <AppCard className="settings-menu">
            <SettingsLink description="Einnahmen- und Ausgabenbereiche verwalten" icon={Layers3} label="Kategorien" to="/settings/categories" />
            <SettingsLink description="Budgets und vergangene Perioden" icon={PiggyBank} label="Kassenperioden" to="/settings/cash-periods" />
            <SettingsLink description="Konten, Rollen und Zugänge" icon={UserRoundCog} label="Benutzer" to="/settings/users" />
          </AppCard>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="app-settings">
        <h2 id="app-settings">App</h2>
        <AppCard className="settings-menu">
          <div className="settings-menu__item settings-menu__item--static">
            <ShieldCheck aria-hidden="true" />
            <span><strong>Nuam Kasse</strong><small>Version {APP_VERSION}</small></span>
          </div>
        </AppCard>
      </section>

      <button className="settings-logout" onClick={() => void logout()} type="button"><LogOut aria-hidden="true" />Abmelden</button>
    </PageContainer>
  );
}
