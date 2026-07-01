import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Start", to: "/" },
  { label: "Übersicht", to: "/overview" },
  { label: "Einstellungen", to: "/settings" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {navItems.map((item) => (
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
