"use client";

import * as React from "react";

import { cn } from "@aso/shared";
import { CHART_INK } from "@/components/charts/tokens";

/**
 * Shared tooltip surface. Values wear ink tokens; the colored swatch beside a
 * row carries series identity, so the text never has to be the series colour.
 */
export function ChartTooltip({
  label,
  rows,
}: {
  label?: string;
  rows: { key: string; label: string; value: string; color?: string }[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="min-w-40 rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] p-2.5 shadow-lg">
      {label ? (
        <p className="mb-1.5 text-xs font-medium text-[var(--text-secondary)]">{label}</p>
      ) : null}
      <div className="flex flex-col gap-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
              {row.color ? (
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-[2px]"
                  style={{ background: row.color }}
                />
              ) : null}
              {row.label}
            </span>
            <span className="tabular font-medium text-[var(--text-primary)]">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Legend. Always rendered for two or more series so identity is never carried
 * by colour alone; a single-series chart is named by its title instead.
 */
export function ChartLegend({
  items,
  className,
}: {
  items: { key: string; label: string; color: string }[];
  className?: string;
}) {
  if (items.length < 2) return null;

  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
          <span
            aria-hidden
            className="size-2.5 rounded-[3px]"
            style={{ background: item.color }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div
      className="flex h-full min-h-48 items-center justify-center rounded-md border border-dashed p-6 text-center text-sm text-[var(--text-secondary)]"
      style={{ borderColor: CHART_INK.axis }}
    >
      {message}
    </div>
  );
}

/** Table fallback so every chart has a non-visual reading of the same data. */
export function ChartTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: (string | number)[][];
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-[var(--text-secondary)] underline underline-offset-2 hover:text-[var(--text-primary)]"
      >
        {open ? "Hide data table" : "View data table"}
      </button>
      {open ? (
        <div className="mt-2 max-h-72 overflow-auto rounded-md border border-[var(--border)]">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-[var(--surface-raised)]">
              <tr>
                {columns.map((column) => (
                  <th
                    key={column}
                    className="border-b border-[var(--border)] px-3 py-2 font-medium text-[var(--text-secondary)]"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-0">
                  {row.map((cell, j) => (
                    <td key={j} className="tabular px-3 py-1.5 text-[var(--text-primary)]">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
