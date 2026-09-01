import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  canSubmitPrintingDateFormatDraft,
  canonicalizePrintingDatePattern,
  createPrintingDateFormatDraft,
  PrintingDatePatternExamples,
  PrintingDateTokenHelp,
  previewPrintingDatePattern,
  safePatternError,
  updatePrintingDateFormatDraftLabel,
  updatePrintingDateFormatDraftPattern,
} from "./PrintingDatePatternHelp";

const SAMPLE_DATE = "2025-06-18";

describe("PrintingDateFormatManager pattern guidance", () => {
  it("documents every supported date token and explains English ordinal days", () => {
    const markup = renderToStaticMarkup(createElement("div", null,
      createElement(PrintingDatePatternExamples, { sampleDate: "2025-06-18" }),
      createElement(PrintingDateTokenHelp),
    ));

    for (const token of ["D", "DD", "Do", "M", "MM", "MMM", "MMMM", "YY", "YYYY"]) {
      expect(markup).toContain(`>${token}</code>`);
    }
    expect(markup).toContain("วันที่แบบ 1st / 2nd / 3rd / 4th");
    expect(markup).toContain("ระบบจะเลือก st / nd / rd / th ให้อัตโนมัติ");
    expect(markup).toContain("MMM.Do,YYYY");
    expect(markup).toContain("Jun.18th,2025");
  });

  it("accepts the ordinal pattern and keeps invalid guessed suffixes actionable", () => {
    expect(safePatternError("MMM.Do,YYYY")).toBeNull();
    expect(safePatternError("MMM.DDTH,YYYY")).toBe(
      "รูปแบบวันที่ไม่ถูกต้อง ตรวจสอบ Token ที่รองรับด้านล่าง เช่น DD/MM/YYYY หรือ MMM.Do,YYYY",
    );
  });

  it.each([
    ["mmm.do,yyyy", "MMM.Do,YYYY"],
    ["dd/mm/yyyy", "DD/MM/YYYY"],
    ["mmmm d, yyyy", "MMMM D, YYYY"],
    ["MMM.DO,YYYY", "MMM.Do,YYYY"],
    ["mmm.ddth,yyyy", "MMM.DDTH,YYYY"],
    ["dd-mm, yyyy", "DD-MM, YYYY"],
    ["dd##mm/yyyy", "DD##MM/YYYY"],
  ])("canonicalizes %s while preserving separators", (input, expected) => {
    const canonicalPattern = canonicalizePrintingDatePattern(input);

    expect(canonicalPattern).toBe(expected);
    expect(canonicalPattern).toHaveLength(input.length);
  });

  it("canonicalizes partial input during each pattern change", () => {
    const expectedPatterns = [
      "M",
      "MM",
      "MMM",
      "MMM.",
      "MMM.D",
      "MMM.Do",
      "MMM.Do,",
      "MMM.Do,Y",
      "MMM.Do,YY",
      "MMM.Do,YYY",
      "MMM.Do,YYYY",
    ];
    let draft = createPrintingDateFormatDraft();

    for (const character of "mmm.do,yyyy") {
      draft = updatePrintingDateFormatDraftPattern(
        draft,
        `${draft.pattern}${character}`,
        SAMPLE_DATE,
      );
      expect(draft.pattern).toBe(expectedPatterns.shift());
    }

    expect(draft.displayLabel).toBe("Jun.18th,2025");
    expect(safePatternError(draft.pattern)).toBeNull();
    expect(canSubmitPrintingDateFormatDraft(draft)).toBe(true);
  });

  it("auto-fills display labels from the shared formatter preview", () => {
    const ordinalDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "MMM.Do,YYYY",
      SAMPLE_DATE,
    );
    const numericDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "DD/MM/YYYY",
      SAMPLE_DATE,
    );

    expect(ordinalDraft.displayLabel).toBe("Jun.18th,2025");
    expect(numericDraft.displayLabel).toBe("18/06/2025");
    expect(previewPrintingDatePattern("MMM.Do,YYYY", SAMPLE_DATE)).toBe("Jun.18th,2025");
  });

  it("canonicalizes a draft and auto-fills its label in the same change", () => {
    const liveDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "mmm.do,yyyy",
      SAMPLE_DATE,
    );

    expect(liveDraft).toEqual({
      pattern: "MMM.Do,YYYY",
      displayLabel: "Jun.18th,2025",
      displayLabelMode: "auto",
    });
  });

  it("preserves a manually edited label across later pattern changes", () => {
    const autoDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "MMM.Do,YYYY",
      SAMPLE_DATE,
    );
    const manualDraft = updatePrintingDateFormatDraftLabel(autoDraft, "ฉลากของฉัน");
    const changedPatternDraft = updatePrintingDateFormatDraftPattern(
      manualDraft,
      "dd/mm/yyyy",
      SAMPLE_DATE,
    );

    expect(autoDraft.displayLabel).toBe("Jun.18th,2025");
    expect(changedPatternDraft.pattern).toBe("DD/MM/YYYY");
    expect(previewPrintingDatePattern(changedPatternDraft.pattern, SAMPLE_DATE)).toBe("18/06/2025");
    expect(changedPatternDraft.displayLabel).toBe("ฉลากของฉัน");
    expect(changedPatternDraft.displayLabelMode).toBe("manual");
  });

  it("does not create a preview or label from an invalid guessed suffix", () => {
    const invalidDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "mmm.ddth,yyyy",
      SAMPLE_DATE,
    );

    expect(invalidDraft.pattern).toBe("MMM.DDTH,YYYY");
    expect(previewPrintingDatePattern(invalidDraft.pattern, SAMPLE_DATE)).toBeNull();
    expect(invalidDraft.displayLabel).toBe("");
    expect(safePatternError(invalidDraft.pattern)).not.toBeNull();
    expect(canSubmitPrintingDateFormatDraft(invalidDraft)).toBe(false);
  });

  it("clears an auto label when the current pattern becomes invalid", () => {
    const validDraft = updatePrintingDateFormatDraftPattern(
      createPrintingDateFormatDraft(),
      "MMM.Do,YYYY",
      SAMPLE_DATE,
    );
    const invalidDraft = updatePrintingDateFormatDraftPattern(
      validDraft,
      "MMM.DDTH,YYYY",
      SAMPLE_DATE,
    );

    expect(validDraft.displayLabel).toBe("Jun.18th,2025");
    expect(invalidDraft.displayLabel).toBe("");
  });
});
