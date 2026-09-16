"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@aso/shared";

const TABS = [
  { segment: "", label: "Overview" },
  { segment: "keywords", label: "Keywords" },
  { segment: "reviews", label: "Reviews" },
  { segment: "creatives", label: "Creatives" },
  { segment: "competitors", label: "Competitors" },
  { segment: "monetization", label: "Monetization" },
  { segment: "advertising", label: "Advertising" },
  { segment: "techstack", label: "Tech Stack" },
  { segment: "localization", label: "Localization" },
  { segment: "changes", label: "Changes" },
  { segment: "optimize", label: "Optimize" },
  { segment: "report", label: "Executive Report" },
] as const;

export function AppTabs({ appId }: { appId: string }) {
  const pathname = usePathname();
  const base = `/apps/${appId}`;

  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto border-b border-[var(--border)]">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment ? pathname === href : pathname === base;

        return (
          <Link
            key={tab.label}
            href={href}
            prefetch={true}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
              active
                ? "border-[var(--accent)] font-medium text-[var(--text-primary)]"
                : "border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
