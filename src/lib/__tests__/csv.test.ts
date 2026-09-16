import { describe, expect, it } from "vitest";

import { decodeCsvBuffer, parseCsv, parseCsvRecords, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("keeps commas and newlines that are inside quotes", () => {
    const rows = parseCsv('a,"b,c",d\n1,"line1\nline2",3\n');
    expect(rows).toEqual([
      ["a", "b,c", "d"],
      ["1", "line1\nline2", "3"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseCsv('x,"say ""hi"""')).toEqual([["x", 'say "hi"']]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });

  it("drops fully blank rows", () => {
    expect(parseCsv("a,b\n\n1,2\n,\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("parseCsvRecords", () => {
  it("keys rows by the header and trims cells", () => {
    expect(parseCsvRecords("Date , Installs\n2026-01-01, 42 \n")).toEqual([
      { Date: "2026-01-01", Installs: "42" },
    ]);
  });

  it("returns nothing for an empty document", () => {
    expect(parseCsvRecords("")).toEqual([]);
  });
});

describe("toCsv", () => {
  it("writes a header from the union of all row keys", () => {
    const csv = toCsv([{ a: 1, b: 2 }, { a: 3, c: 4 }]);
    expect(csv.split("\r\n")[0]).toBe("a,b,c");
  });

  it("uses an explicit column order when given", () => {
    const csv = toCsv([{ b: 2, a: 1 }], ["a", "b"]);
    expect(csv).toBe("a,b\r\n1,2");
  });

  it("quotes cells containing commas, quotes or newlines", () => {
    const csv = toCsv([{ text: 'has, comma "and" quotes\nand a newline' }]);
    expect(csv.split("\r\n")[1]).toBe('"has, comma ""and"" quotes\nand a newline"');
  });

  it("renders null and undefined as empty, not as the words", () => {
    const csv = toCsv([{ a: null, b: undefined, c: 0 }], ["a", "b", "c"]);
    expect(csv.split("\r\n")[1]).toBe(",,0");
  });

  it("serializes dates as ISO rather than a locale string", () => {
    const csv = toCsv([{ at: new Date("2026-01-02T03:04:05.000Z") }]);
    expect(csv.split("\r\n")[1]).toBe("2026-01-02T03:04:05.000Z");
  });

  // A review body starting with "=" is attacker-controlled text that a
  // spreadsheet would execute on open.
  it.each(["=1+1", "+1", "-1", "@SUM(A1)", "=cmd|'/c calc'!A1"])(
    "neutralises the formula prefix in %s",
    (payload) => {
      const csv = toCsv([{ body: payload }]);
      const cell = csv.split("\r\n")[1]!;
      expect(cell.startsWith("'") || cell.startsWith('"\'')).toBe(true);
      expect(cell.replace(/^"|"$/g, "").startsWith("'")).toBe(true);
    },
  );

  it("leaves ordinary text unprefixed", () => {
    expect(toCsv([{ body: "Great app" }]).split("\r\n")[1]).toBe("Great app");
  });

  it("round-trips through the parser", () => {
    const rows = [
      { term: "habit tracker", rank: 12, note: 'says "hi", loudly' },
      { term: "budget, planner", rank: 3, note: "" },
    ];
    const parsed = parseCsvRecords(toCsv(rows));

    expect(parsed).toHaveLength(2);
    expect(parsed[0]?.term).toBe("habit tracker");
    expect(parsed[0]?.note).toBe('says "hi", loudly');
    expect(parsed[1]?.term).toBe("budget, planner");
  });

  it("emits only a header for no rows", () => {
    expect(toCsv([], ["a", "b"])).toBe("a,b");
  });
});

describe("decodeCsvBuffer", () => {
  it("decodes the UTF-16LE that Play Console actually ships", () => {
    const text = "Date,Installs\n2026-01-01,42\n";
    const body = Buffer.from(text, "utf16le");
    const withBom = Buffer.concat([Buffer.from([0xff, 0xfe]), body]);

    expect(decodeCsvBuffer(withBom.buffer.slice(withBom.byteOffset, withBom.byteOffset + withBom.byteLength))).toBe(
      text,
    );
  });

  it("strips a UTF-8 BOM", () => {
    const body = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("a,b", "utf8")]);
    expect(decodeCsvBuffer(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength))).toBe("a,b");
  });
});
