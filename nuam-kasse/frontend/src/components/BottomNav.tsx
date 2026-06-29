import { NavLink } from "react-router-dom";

import { useAuth } from "../app/AuthContext";

const navItems = [
  { label: "Start", to: "/" },
  { label: "Uebersicht", to: "/overview" },
  { label: "Einstellungen", to: "/settings" },
];

export function BottomNav() {
  const { user } = useAuth();
  const items = user?.role === "admin"
    ? [...navItems, { label: "Benutzer", to: "/settings/users" }]
    : navItems;

  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {items.map((item) => (
        <NavLink
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
          }
          end={item.to === "/"}
          key={item.to}
          to={item.to}
        >
          <span className="bottom-nav__dot" aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
