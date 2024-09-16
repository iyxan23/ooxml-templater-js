import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import RootRoute from "./routes/root";
import ErrorPage from "./error-page";
import IndexPage from "./routes";
import { ThemeProvider } from "./components/theme-provider";
import XlsxPage from "./routes/xlsx/page";
import DocxPage from "./routes/docx/page";

const router = createBrowserRouter(
  [
    {
      path: "/",
      element: <RootRoute />,
      errorElement: <ErrorPage />,
      children: [
        { index: true, element: <IndexPage /> },
        {
          path: "xlsx",
          element: <XlsxPage />,
        },
        {
          path: "docx",
          element: <DocxPage />,
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
