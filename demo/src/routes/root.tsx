import { Outlet, useLocation } from "react-router-dom";
import NavigationLink from "./_components/nav-link";
import { ModeToggle } from "~/components/mode-toggle";

export default function RootRoute() {
  return (
    <div className="grid grid-rows-[auto_1fr] w-screen min-h-screen">
      <div className="w-full flex flex-row justify-center border border-b-foreground/10 bg-background sticky top-0 left-0">
        <header className="container py-4 flex flex-row justify-between items-center">
          <h1 className="font-semibold">
            <span className="text-sm font-normal opacity-50">
              <a href="https://github.com/iyxan23">iyxan23</a> /{" "}
            </span>
            <a href="https://github.com/iyxan23/ooxml-templater-js">
              ooxml-templater-js
            </a>{" "}
            <DemoText />
          </h1>
          <div className="flex flex-row gap-8 items-center">
            <nav className="flex flex-row gap-6 items-center">
              <NavigationLink to="/" text="home" />
              <NavigationLink to="/docx" text="docx" />
              <NavigationLink to="/xlsx" text="xlsx" />
            </nav>
            <div className="h-full w-[1px] bg-foreground/20">&nbsp;</div>
            <ModeToggle />
          </div>
        </header>
      </div>
      <Outlet />
    </div>
  );
}

function DemoText() {
  const location = useLocation();

  return location.pathname !== "/" ? "demo" : null;
}
