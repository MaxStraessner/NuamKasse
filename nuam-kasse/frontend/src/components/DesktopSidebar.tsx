import {
  BookOpenCheck,
  ChartNoAxesCombined,
  FolderTree,
  LayoutDashboard,
  PlusCircle,
  Settings,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../app/AuthContext";

type NavigationItem = {
  icon: typeof LayoutDashboard;
  label: string;
  to: string;
  end?: boolean;
};

const mainNavigation: NavigationItem[] = [
  { icon: LayoutDashboard, label: "Übersicht", to: "/", end: true },
  { icon: PlusCircle, label: "Buchen", to: "/book" },
  { icon: BookOpenCheck, label: "Buchungen", to: "/bookings" },
  { icon: WalletCards, label: "Kassen", to: "/cashbooks" },
  { icon: ChartNoAxesCombined, label: "Auswertungen", to: "/reports" },
];

function DesktopNavigationLink({ end, icon: Icon, label, to }: NavigationItem) {
  return (
    <NavLink
      className={({ isActive }) => `desktop-sidebar__link${isActive ? " desktop-sidebar__link--active" : ""}`}
      end={end}
      to={to}
    >
      <Icon aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  );
}

export function DesktopSidebar() {
  const { user } = useAuth();
  const canManageCashbook = user?.cashbook_role === "admin";
  const canManageUsers = user?.role === "admin";

  return (
    <aside className="desktop-sidebar">
      <div className="desktop-sidebar__brand">
        <span><WalletCards aria-hidden="true" /></span>
        <div><strong>Nuam Kasse</strong><small>Gemeinsame Kasse</small></div>
      </div>

      <nav className="desktop-sidebar__navigation" aria-label="Desktop-Hauptnavigation">
        <div>
          <p>Navigation</p>
          {mainNavigation.map((item) => <DesktopNavigationLink key={item.to} {...item} />)}
          {canManageCashbook ? (
            <DesktopNavigationLink icon={FolderTree} label="Kategorien" to="/settings/categories" />
          ) : null}
        </div>

        {canManageUsers ? (
          <div>
            <p>Verwaltung</p>
            <DesktopNavigationLink icon={ShieldCheck} label="Administration" to="/settings/users" />
          </div>
        ) : null}
      </nav>

      <div className="desktop-sidebar__footer">
        <DesktopNavigationLink icon={Settings} label="Einstellungen" to="/settings" />
        <div className="desktop-sidebar__user">
          <span aria-hidden="true">{user?.display_name?.slice(0, 1).toUpperCase()}</span>
          <div><strong>{user?.display_name}</strong><small>{user?.role === "admin" ? "Administrator" : "Mitglied"}</small></div>
        </div>
      </div>
    </aside>
  );
}
