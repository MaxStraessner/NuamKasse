import { createBrowserRouter, RouterProvider } from "react-router-dom";

import { AppLayout } from "./layouts/AppLayout";
import { HomePage } from "./pages/HomePage";
import { PlaceholderPage } from "./pages/PlaceholderPage";

const router = createBrowserRouter([
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
        element: <PlaceholderPage title="Uebersicht" />,
      },
      {
        path: "settings",
        element: <PlaceholderPage title="Einstellungen" />,
      },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
