import { describe, expect, it } from "vitest";
import { csvCell } from "./format";
describe("CSV export", () => {
  it("neutralizes spreadsheet formula injection", () => {
    for (const value of [
      '=HYPERLINK("bad")',
      "  +1+1",
      "@SUM(A1)",
      "-1+2",
      "\tformula",
    ])
      expect(csvCell(value)).toMatch(/^"'/);
  });
  it("escapes quotes and preserves multiline data", () =>
    expect(csvCell('Aluminium "6061"\nplate')).toBe(
      '"Aluminium ""6061""\nplate"',
    ));
});
