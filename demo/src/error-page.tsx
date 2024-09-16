import { isRouteErrorResponse, Link, useRouteError } from "react-router-dom";

export default function ErrorPage() {
  const error = useRouteError();
  console.error(error);

  let errorMessage;

  if (isRouteErrorResponse(error)) {
    errorMessage = error.data?.message || error.statusText;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  } else if (typeof error === "string") {
    errorMessage = error;
  } else {
    console.error(error);
    errorMessage = "Unknown error";
  }

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        gap: "1rem",
      }}
    >
      <h1 style={{ fontSize: "2rem" }}>Ouch!</h1>
      <p>Something shouldn't have happened.</p>
      <p style={{ fontSize: "0.8rem", opacity: 0.5 }}>
        <i>{errorMessage}</i>
      </p>
      <div
        style={{
          height: "3rem",
          width: "1px",
          backgroundColor: "hsl(var(--foreground))",
          opacity: 0.1,
          paddingTop: "2rem",
          paddingBottom: "2rem",
        }}
      >
        &nbsp;
      </div>
      <Link to="/" style={{ textDecoration: "underline", fontSize: "0.8rem" }}>
        Home
      </Link>
    </main>
  );
}
