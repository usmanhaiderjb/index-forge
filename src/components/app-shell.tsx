"use client";

import { BarChart3, Layers, Bell, Cable, LayoutDashboard, Lightbulb, Megaphone, Menu, Moon, Search, Send, Settings, Smartphone, Sparkles, Sun, TrendingUp, X } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@aso/shared";
import { signOutAction } from "@/server/actions/auth";
import { LogoMark } from "@/components/brand/logo";
import { Badge, Button } from "@/components/ui/primitives";
import { api } from "@/trpc/react";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/apps", label: "Apps", icon: Smartphone },
  { href: "/research", label: "App Intelligence", icon: Search },
  { href: "/keywords", label: "Keyword Research", icon: Layers },
  { href: "/gaps", label: "Gaps", icon: Lightbulb },
  { href: "/trends", label: "Trends", icon: TrendingUp },
  { href: "/insights", label: "Insights", icon: Sparkles },
  { href: "/alerts", label: "Alerts", icon: Bell },
  { href: "/push", label: "Push", icon: Send },
  { href: "/integrations", label: "Integrations", icon: Cable },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  const { data: me } = api.org.me.useQuery();
  const { data: openAlerts } = api.alerts.events.useQuery({ status: "TRIGGERED", limit: 100 });

  const alertCount = openAlerts?.length ?? 0;

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-60 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] transition-transform lg:static lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-14 items-center justify-between gap-2 border-b border-[var(--border)] px-4">
          <Link href="/dashboard" className="flex items-center gap-2">
            <LogoMark className="size-7 shrink-0" plate />
            <span className="text-sm font-semibold tracking-tight">
              Index<span className="text-[var(--brand-ink)]">Forge</span>
            </span>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X />
          </Button>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-[var(--page)] font-medium text-[var(--text-primary)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--page)] hover:text-[var(--text-primary)]",
                )}
              >
                <item.icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {item.href === "/alerts" && alertCount > 0 ? (
                  <Badge tone="critical">{alertCount}</Badge>
                ) : null}
              </Link>
            );
          })}
        </nav>

        <AppList pathname={pathname} onNavigate={() => setMobileOpen(false)} />

        <div className="border-t border-[var(--border)] p-3">
          <p className="truncate text-xs font-medium text-[var(--text-primary)]">
            {me?.organizations[0]?.name ?? "Workspace"}
          </p>
          <p className="truncate text-xs text-[var(--text-muted)]">{me?.user.email}</p>
        </div>
      </aside>

      {mobileOpen ? (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      ) : null}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--page)]/85 px-4 backdrop-blur">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu />
          </Button>
          <div className="flex-1" />
          <ThemeToggle />
          {/* A server action, not a POST to /api/auth/signout — that route
              needs a CSRF token and silently failed to clear the session. */}
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" type="submit">
              Sign out
            </Button>
          </form>
        </header>

        <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

function AppList({ pathname, onNavigate }: { pathname: string; onNavigate: () => void }) {
  const { data: apps } = api.apps.list.useQuery();

  if (!apps || apps.length === 0) return null;

  return (
    <div className="border-t border-[var(--border)] p-2">
      <p className="px-3 py-1.5 text-xs font-medium text-[var(--text-muted)]">Your apps</p>
      <div className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
        {apps.map((app) => {
          const href = `/apps/${app.id}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={app.id}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-[var(--page)] font-medium text-[var(--text-primary)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--page)]",
              )}
            >
              {app.iconUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={app.iconUrl} alt="" className="size-5 rounded" />
              ) : (
                <BarChart3 className="size-4" aria-hidden />
              )}
              <span className="truncate">{app.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="size-9" />;

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {isDark ? <Sun /> : <Moon />}
    </Button>
  );
}
