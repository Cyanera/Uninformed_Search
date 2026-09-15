import { describe, expect, it } from "vitest";
import { unzipSync, strFromU8 } from "fflate";
import { buildXlsx } from "@/lib/xlsx";
import { resultsToRows } from "@/lib/grading";

function parts(bytes: Uint8Array) {
  const files = unzipSync(bytes);
  return { files, sheet: strFromU8(files["xl/worksheets/sheet1.xml"]) };
}

describe("buildXlsx", () => {
  it("writes every part an xlsx needs", () => {
    const { files } = parts(buildXlsx([["A"]]));
    for (const name of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
    ]) {
      expect(Object.keys(files)).toContain(name);
    }
  });

  it("starts with the zip signature, so Excel recognises it", () => {
    const bytes = buildXlsx([["A"]]);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // "PK"
  });

  it("writes numbers as numbers and text as text", () => {
    const { sheet } = parts(buildXlsx([["Mark"], [5], ["five"]]));
    expect(sheet).toContain("<v>5</v>");
    expect(sheet).toContain('t="inlineStr"');
  });

  it("escapes what would otherwise break the XML", () => {
    const { sheet } = parts(buildXlsx([["h"], ['a & b < c > d "q"']]));
    expect(sheet).toContain("a &amp; b &lt; c &gt; d &quot;q&quot;");
    expect(sheet).not.toContain("a & b");
  });

  it("strips control characters Excel refuses to open", () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    const { sheet } = parts(buildXlsx([["h"], [`bad${nul}${bell}text`]]));
    expect(sheet).toContain("badtext");
    expect(sheet.includes(nul)).toBe(false);
  });

  it("keeps non-Latin text intact", () => {
    const { sheet } = parts(buildXlsx([["الاسم"], ["نورة الحربي"]]));
    expect(sheet).toContain("نورة الحربي");
  });

  it("names columns beyond Z correctly", () => {
    const row = Array.from({ length: 30 }, (_, i) => `c${i}`);
    const { sheet } = parts(buildXlsx([row]));
    expect(sheet).toContain('r="Z1"');
    expect(sheet).toContain('r="AD1"');
  });

  it("freezes the header row and makes it bold", () => {
    const { sheet } = parts(buildXlsx([["Head"], ["body"]]));
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<c r="A1" s="1"');
    expect(sheet).not.toContain('<c r="A2" s="1"');
  });

  it("trims a sheet name to what Excel allows", () => {
    const { files } = parts(buildXlsx([["A"]], "a".repeat(50)));
    const name = strFromU8(files["xl/workbook.xml"]).match(/name="([^"]*)"/)![1];
    expect(name.length).toBeLessThanOrEqual(31);
  });

  it("handles an empty sheet without producing a broken file", () => {
    const bytes = buildXlsx([]);
    expect(bytes.length).toBeGreaterThan(0);
    expect(() => parts(bytes)).not.toThrow();
  });

  it("writes blanks for missing values rather than the word undefined", () => {
    const { sheet } = parts(buildXlsx([["h"], [null]]));
    expect(sheet).not.toContain("undefined");
    expect(sheet).not.toContain("null");
  });
});

describe("the marks export and the CSV agree", () => {
  it("both are built from the same rows", () => {
    // resultsToRows is the single source; an empty class still yields a header.
    const rows = resultsToRows([], ["BFS", "DFS"], 5);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toContain("Mark (out of 5)");
    expect(rows[0]).toContain("BFS answer");

    const { sheet } = parts(buildXlsx(rows));
    expect(sheet).toContain("Mark (out of 5)");
  });
});
