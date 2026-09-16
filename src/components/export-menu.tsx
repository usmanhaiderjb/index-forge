"use client";

import { Download } from "lucide-react";
import * as React from "react";

import { Button, Select } from "@/components/ui/primitives";

const TYPES = [
  { value: "metrics", label: "Metrics" },
  { value: "keywords", label: "Keywords & ranks" },
  { value: "reviews", label: "Reviews" },
  { value: "charts", label: "Chart positions" },
  { value: "changes", label: "Listing history" },
] as const;

/**
 * Download control.
 *
 * A plain link rather than a fetch-and-blob: the browser streams the file and
 * names it from Content-Disposition, and a large export never has to be held
 * in memory on the client.
 */
export function ExportMenu({ appId }: { appId: string }) {
  const [type, setType] = React.useState<string>("metrics");
  const [days, setDays] = React.useState(90);
  const [format, setFormat] = React.useState<"csv" | "json">("csv");

  const href = `/api/export?appId=${appId}&type=${type}&days=${days}&format=${format}`;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="Export type">
        {TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </Select>

      <Select
        value={days}
        onChange={(e) => setDays(Number(e.target.value))}
        aria-label="Export range"
      >
        <option value={30}>30 days</option>
        <option value={90}>90 days</option>
        <option value={365}>1 year</option>
        <option value={730}>2 years</option>
      </Select>

      <Select
        value={format}
        onChange={(e) => setFormat(e.target.value as "csv" | "json")}
        aria-label="Export format"
      >
        <option value="csv">CSV</option>
        <option value="json">JSON</option>
      </Select>

      <a href={href} download>
        <Button variant="secondary">
          <Download /> Export
        </Button>
      </a>
    </div>
  );
}
