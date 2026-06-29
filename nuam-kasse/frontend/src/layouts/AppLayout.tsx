import { Outlet } from "react-router-dom";

import { BottomNav } from "../components/BottomNav";

export function AppLayout() {
  return (
    <div className="app-shell">
      <Outlet />
      <BottomNav />
    </div>
  );
}
