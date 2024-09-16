import { NavLink } from "react-router-dom";
import { cn } from "~/lib/utils";

export default function NavigationLink({
  to,
  text,
}: {
  to: string;
  text: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          !isActive && "text-foreground/50 hover:text-foreground",
          "transition-colors",
        )
      }
    >
      {text}
    </NavLink>
  );
}
