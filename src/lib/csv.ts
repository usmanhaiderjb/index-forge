/**
 * Minimal RFC-4180 CSV reader. Play Console exports are quoted, comma
 * separated, and encoded UTF-16LE with a BOM — none of which the usual
 * `split(",")` shortcut survives.
 */
export function decodeCsvBuffer(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  return new TextDecoder("utf-8").decode(bytes);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

/**
 * Serializes rows to RFC-4180 CSV.
 *
 * A leading `=`, `+`, `-` or `@` is prefixed with a single quote: spreadsheets
 * treat those as formulas, so an exported review body starting with "=" would
 * otherwise execute on open. That is a real injection path in exported data.
 */
export function toCsv(
  rows: Record<string, unknown>[],
  columns?: string[],
): string {
  const keys = columns ?? Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return "";

    let text =
      value instanceof Date
        ? value.toISOString()
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value);

    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;

    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };

  return [
    keys.map(cell).join(","),
    ...rows.map((row) => keys.map((key) => cell(row[key])).join(",")),
  ].join("\r\n");
}

/** Parses to objects keyed by the header row. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows.shift();
  if (!header) return [];
  const keys = header.map((h) => h.trim());

  return rows.map((row) => {
    const record: Record<string, string> = {};
    keys.forEach((key, i) => {
      record[key] = (row[i] ?? "").trim();
    });
    return record;
  });
}
