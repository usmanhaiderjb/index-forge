"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

const ORDER = ["system", "light", "dark"] as const;
type Mode = (typeof ORDER)[number];

const ICONS: Record<Mode, typeof Sun> = { system: Monitor, light: Sun, dark: Moon };
const LABELS: Record<Mode, string> = {
  system: "Match system theme",
  light: "Light theme",
  dark: "Dark theme",
};

/**
 * Cycles system → light → dark.
 *
 * Renders a fixed-size placeholder until mounted: the server does not know the
 * stored preference, so drawing an icon before hydration guarantees a wrong one
 * on first paint and a visible flicker when it corrects itself.
 */
export function ThemeToggle() {
  const [mounted, setMounted] = React.useState(false);
  const { theme, setTheme } = useTheme();

  React.useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <div className="size-9" aria-hidden />;
  }

  const current = (ORDER as readonly string[]).includes(theme ?? "")
    ? (theme as Mode)
    : "system";
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]!;
  const Icon = ICONS[current];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      title={LABELS[current]}
      aria-label={`${LABELS[current]}. Switch to ${LABELS[next].toLowerCase()}.`}
      className="grid size-9 place-items-center rounded-md text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
