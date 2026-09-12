import {
  ChevronRight,
  KeyRound,
  Layers3,
  LogOut,
  MonitorSmartphone,
  ShieldCheck,
  UserRoundCog,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { Link } from "react-router-dom";

import { APP_VERSION } from "../app/appVersion";
import { useAuth } from "../app/AuthContext";
import {
  useDisplayMode,
  type DisplayPreference,
} from "../app/DisplayModeContext";
import { AppCard } from "../components/AppCard";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";

type SettingsLinkProps = {
  description: string;
  icon: typeof KeyRound;
  label: string;
  to: string;
};

function SettingsLink({
  description,
  icon: Icon,
  label,
  to,
}: SettingsLinkProps) {
  return (
    <Link className="settings-menu__item" to={to}>
      <Icon aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <ChevronRight aria-hidden="true" />
    </Link>
  );
}

export function SettingsPage() {
  const { logout, user } = useAuth();
  const { isWebAvailable, preference, resolvedMode, setPreference } =
    useDisplayMode();

  const displayOptions: Array<{ label: string; value: DisplayPreference }> = [
    { label: "Automatisch", value: "auto" },
    { label: "Web", value: "web" },
    { label: "Mobil", value: "mobile" },
  ];

  const displaySetting = (
    <AppCard className="display-setting">
      <div className="display-setting__copy">
        <MonitorSmartphone aria-hidden="true" />
        <span>
          <strong>Ansicht</strong>
          <small>Passend zum Bildschirm oder dauerhaft festlegen</small>
        </span>
      </div>
      {isWebAvailable ? (
        <div
          className="display-mode-options"
          role="radiogroup"
          aria-label="Ansicht"
        >
          {displayOptions.map((option) => (
            <button
              aria-checked={preference === option.value}
              className={
                preference === option.value
                  ? "display-mode-options__item display-mode-options__item--active"
                  : "display-mode-options__item"
              }
              key={option.value}
              onClick={() => setPreference(option.value)}
              role="radio"
              type="button"
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : (
        <label className="display-mode-select">
          <span>Ansicht wählen</span>
          <select
            aria-label="Ansicht"
            onChange={(event) =>
              setPreference(event.target.value as DisplayPreference)
            }
            value={preference}
          >
            <option value="auto">Automatisch</option>
            <option value="mobile">Mobil</option>
            {preference === "web" ? (
              <option disabled value="web">
                Web (größerer Bildschirm erforderlich)
              </option>
            ) : null}
          </select>
        </label>
      )}
    </AppCard>
  );

  if (resolvedMode === "desktop") {
    return (
      <main className="desktop-core-page desktop-settings">
        <header className="desktop-core-header">
          <div>
            <p>Konto &amp; Anwendung</p>
            <h1>Einstellungen</h1>
            <span>
              Darstellung, Sicherheit und Verwaltung an einem ruhigen Ort.
            </span>
          </div>
        </header>

        <div className="desktop-settings__layout">
          <aside className="desktop-settings__aside">
            <AppCard className="desktop-settings__account">
              <div className="account-card__avatar" aria-hidden="true">
                {user?.display_name?.slice(0, 1).toUpperCase()}
              </div>
              <div>
                <strong>{user?.display_name}</strong>
                <span>@{user?.username}</span>
                <small>
                  {user?.role === "admin" ? "Administrator" : "Mitglied"}
                </small>
              </div>
            </AppCard>
            <nav
              className="desktop-settings__navigation"
              aria-label="Einstellungsbereiche"
            >
              <a href="#display-settings">
                <MonitorSmartphone aria-hidden="true" />
                Darstellung
              </a>
              <a href="#security-settings">
                <KeyRound aria-hidden="true" />
                Sicherheit
              </a>
              <a href="#cashbook-settings">
                <WalletCards aria-hidden="true" />
                Gemeinsame Kasse
              </a>
              {user?.role === "admin" || user?.cashbook_role === "admin" ? (
                <a href="#admin-settings">
                  <ShieldCheck aria-hidden="true" />
                  Administration
                </a>
              ) : null}
              <a href="#app-settings">
                <ShieldCheck aria-hidden="true" />
                App
              </a>
            </nav>
            <button
              className="settings-logout"
              onClick={() => void logout()}
              type="button"
            >
              <LogOut aria-hidden="true" />
              Abmelden
            </button>
          </aside>

          <div className="desktop-settings__content">
            <section
              className="desktop-settings__section"
              aria-labelledby="display-settings"
            >
              <div>
                <h2 id="display-settings">Darstellung</h2>
                <p>
                  Die bevorzugte Ansicht bleibt in diesem Browser gespeichert.
                </p>
              </div>
              {displaySetting}
            </section>

            <section
              className="desktop-settings__section"
              aria-labelledby="security-settings"
            >
              <div>
                <h2 id="security-settings">Sicherheit</h2>
                <p>Persönliche Zugangsdaten verwalten.</p>
              </div>
              <AppCard className="settings-menu">
                <SettingsLink
                  description="Dein persönliches Kennwort aktualisieren"
                  icon={KeyRound}
                  label="Passwort ändern"
                  to="/change-password"
                />
              </AppCard>
            </section>

            <section
              className="desktop-settings__section"
              aria-labelledby="cashbook-settings"
            >
              <div>
                <h2 id="cashbook-settings">Gemeinsame Kasse</h2>
                <p>Kassen auswählen und ihre Zeiträume aufrufen.</p>
              </div>
              <AppCard className="settings-menu">
                <SettingsLink
                  description="Aktive, weitere und geschlossene Kassen"
                  icon={WalletCards}
                  label="Kassen verwalten"
                  to="/cashbooks"
                />
              </AppCard>
            </section>

            {user?.role === "admin" || user?.cashbook_role === "admin" ? (
              <section
                className="desktop-settings__section"
                aria-labelledby="admin-settings"
              >
                <div>
                  <h2 id="admin-settings">Administration</h2>
                  <p>
                    Nur bereits freigegebene Verwaltungsbereiche sind sichtbar.
                  </p>
                </div>
                <AppCard className="settings-menu">
                  {user?.cashbook_role === "admin" ? (
                    <SettingsLink
                      description="Einnahmen- und Ausgabenbereiche verwalten"
                      icon={Layers3}
                      label="Kategorien"
                      to="/settings/categories"
                    />
                  ) : null}
                  {user?.cashbook_role === "admin" ? (
                    <SettingsLink
                      description="Bestehende Benutzer der Kasse zuordnen"
                      icon={UsersRound}
                      label="Mitglieder"
                      to="/settings/members"
                    />
                  ) : null}
                  {user?.role === "admin" ? (
                    <SettingsLink
                      description="Konten, Rollen, Kassen und Archiv"
                      icon={UserRoundCog}
                      label="Benutzer"
                      to="/settings/users"
                    />
                  ) : null}
                </AppCard>
              </section>
            ) : null}

            <section
              className="desktop-settings__section"
              aria-labelledby="app-settings"
            >
              <div>
                <h2 id="app-settings">App</h2>
                <p>Installierte Version dieser Nuam-Kasse-Oberfläche.</p>
              </div>
              <AppCard className="settings-menu">
                <div className="settings-menu__item settings-menu__item--static">
                  <ShieldCheck aria-hidden="true" />
                  <span>
                    <strong>Nuam Kasse</strong>
                    <small>Version {APP_VERSION}</small>
                  </span>
                </div>
              </AppCard>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <PageContainer>
      <PageHeader eyebrow="Konto" title="Einstellungen" />

      <AppCard className="account-card">
        <div className="account-card__avatar" aria-hidden="true">
          {user?.display_name?.slice(0, 1).toUpperCase()}
        </div>
        <div>
          <strong>{user?.display_name}</strong>
          <span>
            @{user?.username} ·{" "}
            {user?.role === "admin" ? "Administrator" : "Mitglied"}
          </span>
        </div>
      </AppCard>

      <section className="settings-section" aria-labelledby="display-settings">
        <h2 id="display-settings">Darstellung</h2>
        {displaySetting}
      </section>

      <section className="settings-section" aria-labelledby="security-settings">
        <h2 id="security-settings">Sicherheit</h2>
        <AppCard className="settings-menu">
          <SettingsLink
            description="Dein persönliches Kennwort aktualisieren"
            icon={KeyRound}
            label="Passwort ändern"
            to="/change-password"
          />
        </AppCard>
      </section>

      <section className="settings-section" aria-labelledby="cashbook-settings">
        <h2 id="cashbook-settings">Gemeinsame Kasse</h2>
        <AppCard className="settings-menu">
          <SettingsLink
            description="Aktive, weitere und geschlossene Kassen"
            icon={WalletCards}
            label="Kassen verwalten"
            to="/cashbooks"
          />
        </AppCard>
      </section>

      {user?.role === "admin" || user?.cashbook_role === "admin" ? (
        <section className="settings-section" aria-labelledby="admin-settings">
          <h2 id="admin-settings">Administration</h2>
          <AppCard className="settings-menu">
            {user?.cashbook_role === "admin" ? (
              <SettingsLink
                description="Einnahmen- und Ausgabenbereiche verwalten"
                icon={Layers3}
                label="Kategorien"
                to="/settings/categories"
              />
            ) : null}
            {user?.cashbook_role === "admin" ? (
              <SettingsLink
                description="Bestehende Benutzer der Kasse zuordnen"
                icon={UsersRound}
                label="Mitglieder"
                to="/settings/members"
              />
            ) : null}
            {user?.role === "admin" ? (
              <SettingsLink
                description="Konten, Rollen, Kassen und Archiv"
                icon={UserRoundCog}
                label="Benutzer"
                to="/settings/users"
              />
            ) : null}
          </AppCard>
        </section>
      ) : null}

      <section className="settings-section" aria-labelledby="app-settings">
        <h2 id="app-settings">App</h2>
        <AppCard className="settings-menu">
          <div className="settings-menu__item settings-menu__item--static">
            <ShieldCheck aria-hidden="true" />
            <span>
              <strong>Nuam Kasse</strong>
              <small>Version {APP_VERSION}</small>
            </span>
          </div>
        </AppCard>
      </section>

      <button
        className="settings-logout"
        onClick={() => void logout()}
        type="button"
      >
        <LogOut aria-hidden="true" />
        Abmelden
      </button>
    </PageContainer>
  );
}
