import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import RootRoute from "./routes/root";
import ErrorPage from "./error-page";
import { ThemeProvider } from "./components/theme-provider";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootRoute />,
      errorElement: <ErrorPage />,
      children: [
        { index: true, lazy: async () => import("./routes/index") },
        {
          path: "xlsx",
          lazy: async () => import("./routes/xlsx/page"),
        },
        {
          path: "docx",
          lazy: async () => import("./routes/docx/page"),
        },
      ],
    },
  ],
  {
    basename: "/ooxml-templater-js/",
  },
);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider defaultTheme="dark" storageKey="theme">
      <RouterProvider router={router} />
    </ThemeProvider>
  </StrictMode>,
);
