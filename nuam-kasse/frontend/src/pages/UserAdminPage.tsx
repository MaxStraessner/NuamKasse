import { FormEvent, useEffect, useState } from "react";
import {
  ChevronRight,
  History,
  KeyRound,
  Plus,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";

import { AppCard } from "../components/AppCard";
import { AppDialog } from "../components/AppDialog";
import { PageContainer } from "../components/PageContainer";
import { PageHeader } from "../components/PageHeader";
import { useDisplayMode } from "../app/DisplayModeContext";
import { formatLocalDateTime } from "../services/dateTime";
import {
  createUser,
  listCashbookAccessOptions,
  listUserAuditLog,
  listUsers,
  resetUserPassword,
  updateUser,
  updateUserAccess,
} from "../services/usersApi";
import type {
  AdminAuditLog,
  CashbookAccessOption,
  PeriodAccessMode,
  User,
  UserCashbookAccessInput,
  UserCreateInput,
  UserRole,
} from "../types/user";

type AccessDraft = Record<
  number,
  {
    enabled: boolean;
    role: UserRole;
    mode: PeriodAccessMode;
    periodIds: number[];
  }
>;

const emptyCreateForm: UserCreateInput = {
  username: "",
  display_name: "",
  password: "",
  password_confirmation: "",
  role: "member",
  is_active: true,
  cashbook_accesses: [],
};

const actionLabels: Record<string, string> = {
  "user.created": "Benutzer erstellt",
  "user.bootstrap": "Administrator eingerichtet",
  "user.username_changed": "Benutzername geändert",
  "user.display_name_changed": "Anzeigename geändert",
  "user.password_reset": "Passwort administrativ zurückgesetzt",
  "user.role_changed": "Rolle geändert",
  "user.deactivated": "Benutzer deaktiviert",
  "user.activated": "Benutzer aktiviert",
  "user.access_changed": "Kassen- und Archivzugriff geändert",
  "user.cashbook_access_changed": "Kassenzugriff geändert",
  "user.period_access_changed": "Archivzugriff geändert",
};

const periodAccessLabels: Record<PeriodAccessMode, string> = {
  all: "Gesamtes Kassenarchiv",
  selected: "Ausgewählte Kassenstände",
  current_and_future: "Aktuell und zukünftig",
};

function userAccessSummary(user: User): string {
  const accesses = user.cashbook_accesses ?? [];
  if (accesses.length === 0) return "Keine Kasse";
  if (accesses.length === 1) return accesses[0].cashbook_name;
  return `${accesses.length} Kassen`;
}

function userPeriodSummary(user: User): string {
  const accesses = user.cashbook_accesses ?? [];
  if (accesses.length === 0) return "Kein Zugriff";
  if (accesses.length === 1)
    return periodAccessLabels[accesses[0].period_access_mode];
  return `${user.accessible_period_count ?? 0} Kassenstände`;
}

function blankAccessDraft(options: CashbookAccessOption[]): AccessDraft {
  return Object.fromEntries(
    options.map((cashbook) => [
      cashbook.id,
      {
        enabled: false,
        role: "member" as UserRole,
        mode: "all" as PeriodAccessMode,
        periodIds: [],
      },
    ]),
  );
}

function userAccessDraft(
  user: User,
  options: CashbookAccessOption[],
): AccessDraft {
  const draft = blankAccessDraft(options);
  for (const access of user.cashbook_accesses ?? []) {
    draft[access.cashbook_id] = {
      enabled: true,
      role: access.cashbook_role,
      mode: access.period_access_mode,
      periodIds: access.accessible_period_ids,
    };
  }
  return draft;
}

function accessPayload(draft: AccessDraft): UserCashbookAccessInput[] {
  return Object.entries(draft)
    .filter(([, access]) => access.enabled)
    .map(([cashbookId, access]) => ({
      cashbook_id: Number(cashbookId),
      cashbook_role: access.role,
      period_access_mode: access.mode,
      period_ids: access.mode === "selected" ? access.periodIds : [],
    }));
}

type AccessEditorProps = {
  draft: AccessDraft;
  idPrefix: string;
  onChange: (draft: AccessDraft) => void;
  options: CashbookAccessOption[];
};

function AccessEditor({
  draft,
  idPrefix,
  onChange,
  options,
}: AccessEditorProps) {
  function update(cashbookId: number, values: Partial<AccessDraft[number]>) {
    const current = draft[cashbookId] ?? {
      enabled: false,
      role: "member",
      mode: "all",
      periodIds: [],
    };
    onChange({ ...draft, [cashbookId]: { ...current, ...values } });
  }

  function togglePeriod(
    cashbookId: number,
    periodId: number,
    checked: boolean,
  ) {
    const current = draft[cashbookId] ?? {
      enabled: true,
      role: "member",
      mode: "selected",
      periodIds: [],
    };
    const periodIds = checked
      ? [...new Set([...current.periodIds, periodId])]
      : current.periodIds.filter((id) => id !== periodId);
    update(cashbookId, { periodIds });
  }

  if (options.length === 0) {
    return <p className="help-copy">Noch keine Kassen vorhanden.</p>;
  }

  return (
    <div className="access-editor">
      {options.map((cashbook) => {
        const access = draft[cashbook.id] ?? {
          enabled: false,
          role: "member",
          mode: "all",
          periodIds: [],
        };
        return (
          <section
            className={`access-card${access.enabled ? " access-card--enabled" : ""}`}
            key={cashbook.id}
          >
            <label
              className="access-card__toggle"
              htmlFor={`${idPrefix}-cashbook-${cashbook.id}`}
            >
              <input
                checked={access.enabled}
                id={`${idPrefix}-cashbook-${cashbook.id}`}
                onChange={(event) =>
                  update(cashbook.id, { enabled: event.target.checked })
                }
                type="checkbox"
              />
              <span>
                <strong>{cashbook.name}</strong>
                <small>Kassenzugriff</small>
              </span>
            </label>
            {access.enabled ? (
              <div className="access-card__periods">
                <label className="form-field">
                  <span>Kassenrolle</span>
                  <select
                    aria-label={`Kassenrolle ${cashbook.name}`}
                    onChange={(event) =>
                      update(cashbook.id, {
                        role: event.target.value as UserRole,
                      })
                    }
                    value={access.role}
                  >
                    <option value="member">Mitglied</option>
                    <option value="admin">Kassenadministrator</option>
                  </select>
                </label>
                <label className="form-field">
                  <span>Archivzugriff</span>
                  <select
                    aria-label={`Archivzugriff ${cashbook.name}`}
                    onChange={(event) =>
                      update(cashbook.id, {
                        mode: event.target.value as PeriodAccessMode,
                      })
                    }
                    value={access.mode}
                  >
                    <option value="all">Gesamtes Kassenarchiv</option>
                    <option value="selected">Bestimmte Kassenstände</option>
                    <option value="current_and_future">
                      Aktuelle und zukünftige Kassenstände
                    </option>
                  </select>
                </label>
                {access.mode === "selected" ? (
                  <div
                    className="period-checklist"
                    aria-label={`Kassenstände ${cashbook.name}`}
                  >
                    {cashbook.periods.length === 0 ? (
                      <small>Noch keine archivierten Kassenstände vorhanden.</small>
                    ) : null}
                    {cashbook.periods.map((period) => (
                      <label key={period.id}>
                        <input
                          checked={access.periodIds.includes(period.id)}
                          onChange={(event) =>
                            togglePeriod(
                              cashbook.id,
                              period.id,
                              event.target.checked,
                            )
                          }
                          type="checkbox"
                        />
                        <span>
                          <strong>{period.name}</strong>
                          <small>
                            {period.status === "active"
                              ? "Aktuell"
                              : "Abgeschlossen"}
                          </small>
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
                {access.mode === "current_and_future" ? (
                  <p className="help-copy">
                    Der aktuell aktive und jeder später beginnende Kassenstand werden
                    automatisch freigegeben.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

export function UserAdminPage() {
  const { resolvedMode } = useDisplayMode();
  const isDesktop = resolvedMode === "desktop";
  const [users, setUsers] = useState<User[]>([]);
  const [options, setOptions] = useState<CashbookAccessOption[]>([]);
  const [createForm, setCreateForm] =
    useState<UserCreateInput>(emptyCreateForm);
  const [createAccess, setCreateAccess] = useState<AccessDraft>({});
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [accountForm, setAccountForm] = useState({
    username: "",
    display_name: "",
    role: "member" as UserRole,
    is_active: true,
  });
  const [detailAccess, setDetailAccess] = useState<AccessDraft>({});
  const [passwordForm, setPasswordForm] = useState({
    password: "",
    confirmation: "",
  });
  const [auditLog, setAuditLog] = useState<AdminAuditLog[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuditLoading, setIsAuditLoading] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const selectedUser = users.find((user) => user.id === selectedUserId) ?? null;

  async function loadData() {
    setIsLoading(true);
    try {
      const [loadedUsers, loadedOptions] = await Promise.all([
        listUsers(),
        listCashbookAccessOptions(),
      ]);
      setUsers(loadedUsers);
      setOptions(loadedOptions);
      setCreateAccess(blankAccessDraft(loadedOptions));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Benutzer konnten nicht geladen werden.",
      );
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  async function openUser(user: User) {
    setSelectedUserId(user.id);
    setAccountForm({
      username: user.username,
      display_name: user.display_name,
      role: user.role,
      is_active: user.is_active,
    });
    setDetailAccess(userAccessDraft(user, options));
    setPasswordForm({ password: "", confirmation: "" });
    setIsAuditLoading(true);
    try {
      setAuditLog(await listUserAuditLog(user.id));
    } catch {
      setAuditLog([]);
    } finally {
      setIsAuditLoading(false);
    }
  }

  function replaceUser(updated: User) {
    setUsers((current) =>
      current.map((user) => (user.id === updated.id ? updated : user)),
    );
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    try {
      const created = await createUser({
        ...createForm,
        cashbook_accesses: accessPayload(createAccess),
      });
      setUsers((current) => [...current, created]);
      setCreateForm(emptyCreateForm);
      setCreateAccess(blankAccessDraft(options));
      setIsCreateOpen(false);
      setMessage(
        "Benutzer wurde sicher angelegt. Beim ersten Anmelden ist ein eigenes Passwort erforderlich.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Benutzer konnte nicht angelegt werden.",
      );
    }
  }

  async function saveAccount() {
    if (!selectedUser) return;
    setError(null);
    try {
      const updated = await updateUser(selectedUser.id, accountForm);
      replaceUser(updated);
      setMessage("Kontodaten wurden aktualisiert.");
      await openUser(updated);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Kontodaten konnten nicht aktualisiert werden.",
      );
    }
  }

  async function saveAccess() {
    if (!selectedUser) return;
    setError(null);
    try {
      const updated = await updateUserAccess(
        selectedUser.id,
        accessPayload(detailAccess),
      );
      replaceUser(updated);
      setDetailAccess(userAccessDraft(updated, options));
      setAuditLog(await listUserAuditLog(updated.id));
      setMessage("Kassen- und Archivzugriff wurde aktualisiert.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Zugriffsrechte konnten nicht aktualisiert werden.",
      );
    }
  }

  async function handleResetPassword() {
    if (!selectedUser) return;
    setError(null);
    try {
      await resetUserPassword(selectedUser.id, {
        new_password: passwordForm.password,
        new_password_confirmation: passwordForm.confirmation,
      });
      setPasswordForm({ password: "", confirmation: "" });
      const refreshed = (await listUsers()).find(
        (user) => user.id === selectedUser.id,
      );
      if (refreshed) replaceUser(refreshed);
      setAuditLog(await listUserAuditLog(selectedUser.id));
      setMessage(
        "Passwort wurde zurückgesetzt; bestehende Sitzungen wurden beendet.",
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Passwort konnte nicht zurückgesetzt werden.",
      );
    }
  }

  return (
    <PageContainer className={isDesktop ? "desktop-admin" : ""}>
      {isDesktop ? (
        <header className="desktop-core-header">
          <div>
            <p>Administration</p>
            <h1>Benutzer</h1>
            <span>
              Konten, Rollen, Kassen und historische Archivzugriffe
              nachvollziehbar verwalten.
            </span>
          </div>
          <button
            className="desktop-primary-action"
            onClick={() => setIsCreateOpen(true)}
            type="button"
          >
            <Plus aria-hidden="true" /> Benutzer anlegen
          </button>
        </header>
      ) : (
        <>
          <PageHeader
            action={
              <button
                aria-label="Benutzer anlegen"
                className="page-action"
                onClick={() => setIsCreateOpen(true)}
                type="button"
              >
                <Plus aria-hidden="true" />
                <span>Neu</span>
              </button>
            }
            backLabel="Einstellungen"
            backTo="/settings"
            eyebrow="Administration"
            title="Benutzer"
          />
          <p className="section-intro">
            Konten, Rollen, Kassen und historische Archivzugriffe
            nachvollziehbar verwalten.
          </p>
        </>
      )}
      {message ? (
        <p className="form-success" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}

      {isDesktop ? (
        <AppCard className="desktop-admin-table" aria-live="polite">
          {isLoading ? (
            <div
              className="list-skeleton"
              aria-label="Benutzer werden geladen"
            />
          ) : null}
          {!isLoading && users.length === 0 ? (
            <div className="desktop-core-empty desktop-admin-table__empty">
              <span className="desktop-core-empty__step">
                <UserRound aria-hidden="true" />
              </span>
              <strong>Noch keine Benutzer vorhanden</strong>
              <p>Lege das erste Konto mit der Aktion „Benutzer anlegen“ an.</p>
            </div>
          ) : null}
          {!isLoading && users.length > 0 ? (
            <div className="desktop-table-scroller">
              <table>
                <thead>
                  <tr>
                    <th>Benutzer</th>
                    <th>Globale Rolle</th>
                    <th>Status</th>
                    <th>Passwort</th>
                    <th>Kassen</th>
                    <th>Archivzugriff</th>
                    <th>
                      <span className="visually-hidden">Aktionen</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>
                        <button
                          className="desktop-admin-user"
                          onClick={() => void openUser(user)}
                          type="button"
                        >
                          <span className="admin-list__icon">
                            <UserRound aria-hidden="true" />
                          </span>
                          <span>
                            <strong>{user.display_name}</strong>
                            <small>@{user.username}</small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span
                          className={`desktop-role-badge${user.role === "admin" ? " desktop-role-badge--admin" : ""}`}
                        >
                          {user.role === "admin" ? "Administrator" : "Mitglied"}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`desktop-status${user.is_active ? " desktop-status--active" : " desktop-status--inactive"}`}
                        >
                          {user.is_active ? "Aktiv" : "Deaktiviert"}
                        </span>
                      </td>
                      <td>
                        {user.must_change_password ? (
                          <span className="desktop-status desktop-status--warning">
                            Wechsel erforderlich
                          </span>
                        ) : (
                          <span className="desktop-table-muted">Aktuell</span>
                        )}
                      </td>
                      <td>{userAccessSummary(user)}</td>
                      <td>{userPeriodSummary(user)}</td>
                      <td>
                        <button
                          aria-label={`${user.display_name} öffnen`}
                          className="desktop-icon-button"
                          onClick={() => void openUser(user)}
                          type="button"
                        >
                          <ChevronRight aria-hidden="true" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </AppCard>
      ) : (
        <AppCard className="admin-list" aria-live="polite">
          {isLoading ? (
            <div
              className="list-skeleton"
              aria-label="Benutzer werden geladen"
            />
          ) : null}
          {!isLoading && users.length === 0 ? (
            <p className="empty-state">Noch keine Benutzer vorhanden.</p>
          ) : null}
          {users.map((user) => (
            <button
              className="admin-list__row"
              key={user.id}
              onClick={() => void openUser(user)}
              type="button"
            >
              <span className="admin-list__icon">
                <UserRound aria-hidden="true" />
              </span>
              <span className="admin-list__content">
                <strong>{user.display_name}</strong>
                <small>
                  @{user.username} ·{" "}
                  {user.role === "admin" ? "Administrator" : "Mitglied"} ·{" "}
                  {user.cashbook_count ?? 0} Kassen ·{" "}
                  {user.accessible_period_count ?? 0} Kassenstände
                </small>
              </span>
              <span
                className={`status-dot ${user.is_active ? "status-dot--active" : ""}`}
                aria-label={user.is_active ? "Aktiv" : "Deaktiviert"}
              />
              <ChevronRight aria-hidden="true" />
            </button>
          ))}
        </AppCard>
      )}

      <AppDialog
        className={
          isDesktop ? "desktop-user-dialog desktop-user-dialog--create" : ""
        }
        description="Passwörter werden ausschließlich sicher gehasht gespeichert und nie angezeigt."
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Benutzer anlegen"
      >
        <form
          className={`stack-form${isDesktop ? " desktop-user-create" : ""}`}
          onSubmit={(event) => void handleCreate(event)}
        >
          <h3>
            <ShieldCheck aria-hidden="true" /> Konto
          </h3>
          <div className="desktop-form-grid">
            <label className="form-field">
              <span>Benutzername</span>
              <input
                value={createForm.username}
                onChange={(event) =>
                  setCreateForm({ ...createForm, username: event.target.value })
                }
                required
              />
            </label>
            <label className="form-field">
              <span>Anzeigename</span>
              <input
                value={createForm.display_name}
                onChange={(event) =>
                  setCreateForm({
                    ...createForm,
                    display_name: event.target.value,
                  })
                }
                required
              />
            </label>
            <label className="form-field">
              <span>Passwort</span>
              <input
                autoComplete="new-password"
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm({ ...createForm, password: event.target.value })
                }
                required
              />
            </label>
            <label className="form-field">
              <span>Passwort wiederholen</span>
              <input
                autoComplete="new-password"
                type="password"
                value={createForm.password_confirmation}
                onChange={(event) =>
                  setCreateForm({
                    ...createForm,
                    password_confirmation: event.target.value,
                  })
                }
                required
              />
            </label>
            <label className="form-field">
              <span>Rolle</span>
              <select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm({
                    ...createForm,
                    role: event.target.value as UserRole,
                  })
                }
              >
                <option value="member">Mitglied</option>
                <option value="admin">Administrator</option>
              </select>
            </label>
            <label className="switch-field">
              <input
                checked={createForm.is_active}
                onChange={(event) =>
                  setCreateForm({
                    ...createForm,
                    is_active: event.target.checked,
                  })
                }
                type="checkbox"
              />
              <span>Benutzer ist aktiv</span>
            </label>
          </div>
          <h3>
            <WalletCards aria-hidden="true" /> Zugriffsrechte
          </h3>
          <AccessEditor
            draft={createAccess}
            idPrefix="create"
            onChange={setCreateAccess}
            options={options}
          />
          <div className="desktop-dialog-actions">
            <button className="primary-action" type="submit">
              Benutzer anlegen
            </button>
            <button
              className="secondary-action"
              onClick={() => setIsCreateOpen(false)}
              type="button"
            >
              Abbrechen
            </button>
          </div>
        </form>
      </AppDialog>

      <AppDialog
        className={
          isDesktop ? "desktop-user-dialog desktop-user-dialog--detail" : ""
        }
        description={selectedUser ? `@${selectedUser.username}` : undefined}
        isOpen={Boolean(selectedUser)}
        onClose={() => setSelectedUserId(null)}
        title={selectedUser?.display_name ?? "Benutzer"}
      >
        {selectedUser ? (
          <div className="user-detail">
            {isDesktop ? (
              <div className="desktop-user-summary" aria-label="Benutzerstatus">
                <span>
                  <small>Status</small>
                  <strong>
                    {selectedUser.is_active ? "Aktiv" : "Deaktiviert"}
                  </strong>
                </span>
                <span>
                  <small>Globale Rolle</small>
                  <strong>
                    {selectedUser.role === "admin"
                      ? "Administrator"
                      : "Mitglied"}
                  </strong>
                </span>
                <span>
                  <small>Passwort</small>
                  <strong>
                    {selectedUser.must_change_password
                      ? "Wechsel erforderlich"
                      : "Aktuell"}
                  </strong>
                </span>
                <span>
                  <small>Letzte Anmeldung</small>
                  <strong>
                    {selectedUser.last_login_at
                      ? formatLocalDateTime(selectedUser.last_login_at)
                      : "Noch nie"}
                  </strong>
                </span>
              </div>
            ) : null}

            <div className="user-detail__account-grid">
              <section className="detail-section">
                <h3>
                  <ShieldCheck aria-hidden="true" /> Konto
                </h3>
                <label className="form-field">
                  <span>Benutzername</span>
                  <input
                    value={accountForm.username}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        username: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Anzeigename</span>
                  <input
                    value={accountForm.display_name}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        display_name: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Rolle</span>
                  <select
                    value={accountForm.role}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        role: event.target.value as UserRole,
                      })
                    }
                  >
                    <option value="member">Mitglied</option>
                    <option value="admin">Administrator</option>
                  </select>
                </label>
                <label className="switch-field">
                  <input
                    checked={accountForm.is_active}
                    onChange={(event) =>
                      setAccountForm({
                        ...accountForm,
                        is_active: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                  <span>Benutzer ist aktiv</span>
                </label>
                <button
                  className="secondary-action"
                  onClick={() => void saveAccount()}
                  type="button"
                >
                  Kontodaten speichern
                </button>
              </section>

              <section className="detail-section detail-section--security">
                <h3>
                  <KeyRound aria-hidden="true" /> Neues Passwort setzen
                </h3>
                <p className="help-copy">
                  Das bisherige Passwort wird ungültig und alle bestehenden
                  Sitzungen werden beendet.
                </p>
                <label className="form-field">
                  <span>Neues Passwort</span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    value={passwordForm.password}
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        password: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="form-field">
                  <span>Passwort wiederholen</span>
                  <input
                    autoComplete="new-password"
                    type="password"
                    value={passwordForm.confirmation}
                    onChange={(event) =>
                      setPasswordForm({
                        ...passwordForm,
                        confirmation: event.target.value,
                      })
                    }
                  />
                </label>
                <button
                  className="secondary-action secondary-action--danger"
                  onClick={() => void handleResetPassword()}
                  type="button"
                >
                  Neues Passwort setzen
                </button>
              </section>
            </div>

            <section className="detail-section">
              <h3>
                <WalletCards aria-hidden="true" /> Zugriffsrechte
              </h3>
              <AccessEditor
                draft={detailAccess}
                idPrefix={`user-${selectedUser.id}`}
                onChange={setDetailAccess}
                options={options}
              />
              <button
                className="secondary-action"
                onClick={() => void saveAccess()}
                type="button"
              >
                Zugriffsrechte speichern
              </button>
            </section>

            <section className="detail-section audit-section">
              <h3>
                <History aria-hidden="true" /> Administratoraktionen
              </h3>
              {isAuditLoading ? (
                <div
                  className="audit-skeleton"
                  aria-label="Administratoraktionen werden geladen"
                />
              ) : null}
              {!isAuditLoading && auditLog.length === 0 ? (
                <p className="help-copy">
                  Noch keine protokollierten Aktionen.
                </p>
              ) : null}
              {isDesktop && auditLog.length > 0 ? (
                <div className="desktop-table-scroller desktop-audit-table">
                  <table>
                    <thead>
                      <tr>
                        <th>Zeitpunkt</th>
                        <th>Administrator</th>
                        <th>Aktion</th>
                        <th>Betroffenes Konto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLog.map((event) => (
                        <tr key={event.id}>
                          <td>{formatLocalDateTime(event.created_at)}</td>
                          <td>
                            {event.actor_username
                              ? `@${event.actor_username}`
                              : "Management-Kommando"}
                          </td>
                          <td>
                            <strong>
                              {actionLabels[event.action] ?? event.action}
                            </strong>
                          </td>
                          <td>
                            {event.target_username
                              ? `@${event.target_username}`
                              : "–"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {!isDesktop
                ? auditLog.map((event) => (
                    <div className="audit-entry" key={event.id}>
                      <strong>
                        {actionLabels[event.action] ?? event.action}
                      </strong>
                      <small>
                        {event.actor_username
                          ? `durch @${event.actor_username}`
                          : "durch Management-Kommando"}{" "}
                        · {new Date(event.created_at).toLocaleString("de-DE")}
                      </small>
                    </div>
                  ))
                : null}
            </section>
          </div>
        ) : null}
      </AppDialog>
    </PageContainer>
  );
}
