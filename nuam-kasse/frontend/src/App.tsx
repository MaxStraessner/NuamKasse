import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AuthProvider } from "./app/AuthContext";
import { NetworkStatusProvider } from "./app/NetworkStatusContext";
import { AdminRoute, ProtectedRoute, PublicOnlyRoute } from "./app/routes";
import { AppLayout } from "./layouts/AppLayout";
import { CategoryAdminPage } from "./pages/CategoryAdminPage";
import { CashPeriodAdminPage } from "./pages/CashPeriodAdminPage";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SettingsPage } from "./pages/SettingsPage";
import { UserAdminPage } from "./pages/UserAdminPage";

const router = createBrowserRouter([
  {
    element: <PublicOnlyRoute />,
    children: [
      {
        path: "/login",
        element: <LoginPage />,
      },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/change-password",
        element: <ChangePasswordPage />,
      },
      {
        path: "/",
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: <HomePage />,
          },
          {
            path: "overview",
            element: <OverviewPage />,
          },
          {
            path: "settings",
            element: <SettingsPage />,
          },
          {
            element: <AdminRoute />,
            children: [
              {
                path: "settings/users",
                element: <UserAdminPage />,
              },
              {
                path: "settings/categories",
                element: <CategoryAdminPage />,
              },
              {
                path: "settings/cash-periods",
                element: <CashPeriodAdminPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

export function App() {
  return (
    <AuthProvider>
      <NetworkStatusProvider>
        <RouterProvider router={router} />
      </NetworkStatusProvider>
    </AuthProvider>
  );
}
