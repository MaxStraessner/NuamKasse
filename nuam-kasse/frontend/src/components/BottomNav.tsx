import { NavLink } from "react-router-dom";
import { ChartNoAxesCombined, House, Settings } from "lucide-react";

const navItems = [
  { icon: House, label: "Start", to: "/" },
  { icon: ChartNoAxesCombined, label: "Übersicht", to: "/overview" },
  { icon: Settings, label: "Einstellungen", to: "/settings" },
];

export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Hauptnavigation">
      {navItems.map((item) => {
        const Icon = item.icon;
        return <NavLink
          className={({ isActive }) =>
            `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`
          }
          end={item.to === "/"}
          key={item.to}
          to={item.to}
        >
          <Icon aria-hidden="true" />
          <span>{item.label}</span>
        </NavLink>;
      })}
    </nav>
  );
}
