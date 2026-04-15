import { Link, useLocation } from "@tanstack/react-router";
import { Home, LayoutTemplate, Dumbbell, CalendarDays, BarChart3, Timer } from "lucide-react";

const tabs = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/templates", icon: LayoutTemplate, label: "Templates" },
  { to: "/exercises", icon: Dumbbell, label: "Exercises" },
  { to: "/calendar", icon: CalendarDays, label: "Calendar" },
  { to: "/stopwatch", icon: Timer, label: "Timer" },
  { to: "/stats", icon: BarChart3, label: "Stats" },
] as const;

export function BottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
      <div className="mx-auto flex max-w-lg items-center justify-around px-2 py-1">
        {tabs.map(({ to, icon: Icon, label }) => {
          const isActive = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to as any}
              className={`flex min-h-[44px] min-w-[40px] flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
