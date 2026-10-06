import { LogoDropdown } from "@/components/LogoDropdown";
import { cn } from "@/lib/utils";
import { PhoneCall } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";

const NAV = [
  { to: "/dashboard", label: "Overview" },
  { to: "/dashboard/profile", label: "My profile" },
  { to: "/dashboard/customers", label: "Customers" },
  { to: "/dashboard/calls", label: "Calls" },
  { to: "/dashboard/catalog", label: "Campaigns" },
  { to: "/dashboard/schedule", label: "Schedule" },
  { to: "/dashboard/knowledge", label: "Knowledge" },
  { to: "/dashboard/billing", label: "Billing" },
];

export function AppShell({
  active,
  title,
  description,
  actions,
  children,
}: {
  active: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Link to="/dashboard" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md border border-border/80 bg-card">
              <PhoneCall className="size-3.5 text-primary" />
            </span>
            <span className="text-sm font-semibold tracking-tight">AgentSpeak AI</span>
          </Link>
          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                  active === item.to && "bg-secondary text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <LogoDropdown />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
        {children}
      </main>

      <footer className="mx-auto w-full max-w-6xl px-4 pb-10 sm:px-6">
        <div className="studio-hairline pt-4">
          <p className="text-xs text-muted-foreground">
            AgentSpeak AI · Browser Voice Demo — conversations are simulated, not real phone calls
          </p>
        </div>
      </footer>
    </div>
  );
}
