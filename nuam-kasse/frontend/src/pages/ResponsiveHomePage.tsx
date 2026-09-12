import { useDisplayMode } from "../app/DisplayModeContext";
import { DesktopDashboardPage } from "./DesktopDashboardPage";
import { HomePage } from "./HomePage";

export function ResponsiveHomePage() {
  const { resolvedMode } = useDisplayMode();
  return resolvedMode === "desktop" ? <DesktopDashboardPage /> : <HomePage />;
}
