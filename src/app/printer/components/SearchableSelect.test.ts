import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import SearchableSelect, {
  filterSearchableSelectOptions,
  findNextEnabledOption,
  type SearchableSelectOption,
} from "./SearchableSelect";

const options: readonly SearchableSelectOption[] = [
  { value: "exp-mfg", label: "EXP / MFG" },
  { value: "mfg-exp", label: "MFG / EXP" },
  { value: "lot-exp", label: "LOT / EXP" },
  { value: "exp-24", label: "EXP 24 เดือน" },
  {
    value: "thai-date",
    label: "วันที่ผลิต / วันหมดอายุ",
  },
];

describe("filterSearchableSelectOptions", () => {
  it("matches English text case-insensitively by substring", () => {
    expect(filterSearchableSelectOptions(options, "exp").map(({ value }) => value)).toEqual([
      "exp-mfg",
      "mfg-exp",
      "lot-exp",
      "exp-24",
    ]);
    expect(filterSearchableSelectOptions(options, "ot / e").map(({ value }) => value)).toEqual([
      "lot-exp",
    ]);
  });

  it("matches Thai substrings in labels", () => {
    expect(filterSearchableSelectOptions(options, "หมดอายุ").map(({ value }) => value)).toEqual([
      "thai-date",
    ]);
  });

  it("normalizes compatibility characters with NFKC", () => {
    const fullWidthOptions: readonly SearchableSelectOption[] = [
      { value: "full-width", label: "ＥＸＰ ／ ＭＦＧ" },
    ];

    expect(filterSearchableSelectOptions(fullWidthOptions, "exp / mfg")).toEqual(
      fullWidthOptions,
    );
  });

  it("returns all options for a blank query without mutating the source", () => {
    const filtered = filterSearchableSelectOptions(options, "   ");

    expect(filtered).toEqual(options);
    expect(filtered).not.toBe(options);
  });

  it("returns an empty list when no option matches", () => {
    expect(filterSearchableSelectOptions(options, "ไม่พบแน่นอน")).toEqual([]);
  });
});

describe("findNextEnabledOption", () => {
  it("returns no active option for an empty or fully disabled list", () => {
    expect(findNextEnabledOption([], -1, 1)).toBe(-1);
    expect(findNextEnabledOption([
      { value: "disabled", label: "Disabled", disabled: true },
    ], -1, 1)).toBe(-1);
  });

  it("wraps in both directions and handles a single option", () => {
    const singleOption = [{ value: "only", label: "Only" }];

    expect(findNextEnabledOption(singleOption, -1, 1)).toBe(0);
    expect(findNextEnabledOption(singleOption, 0, 1)).toBe(0);
    expect(findNextEnabledOption(singleOption, 0, -1)).toBe(0);
    expect(findNextEnabledOption(options, 0, -1)).toBe(options.length - 1);
    expect(findNextEnabledOption(options, options.length - 1, 1)).toBe(0);
  });

  it("skips disabled options", () => {
    const optionsWithDisabledItem: readonly SearchableSelectOption[] = [
      { value: "first", label: "First" },
      { value: "disabled", label: "Disabled", disabled: true },
      { value: "last", label: "Last" },
    ];

    expect(findNextEnabledOption(optionsWithDisabledItem, 0, 1)).toBe(2);
    expect(findNextEnabledOption(optionsWithDisabledItem, 2, -1)).toBe(0);
  });
});

describe("SearchableSelect", () => {
  it("renders the externally controlled selected value without changing it", () => {
    const markup = renderToStaticMarkup(createElement(SearchableSelect, {
      id: "printing-format",
      value: "lot-exp",
      options,
      onChange: () => undefined,
      ariaLabel: "รูปแบบการพิมพ์",
      searchPlaceholder: "ค้นหารูปแบบการพิมพ์...",
      emptyMessage: "ไม่พบรูปแบบการพิมพ์",
    }));

    expect(markup).toContain("LOT / EXP");
    expect(markup).toContain('type="button"');
    expect(markup).toContain('aria-expanded="false"');
  });

  it("keeps an external historical value visible when it is absent from options", () => {
    const markup = renderToStaticMarkup(createElement(SearchableSelect, {
      id: "historical-printing-format",
      value: "RETIRED/PATTERN",
      options,
      onChange: () => undefined,
      ariaLabel: "รูปแบบการพิมพ์",
      searchPlaceholder: "ค้นหารูปแบบการพิมพ์...",
      emptyMessage: "ไม่พบรูปแบบการพิมพ์",
    }));

    expect(markup).toContain("RETIRED/PATTERN");
  });
});
