import {
  formatProductDate,
  tokenizeProductDatePattern,
  type ProductDatePatternToken,
} from "../../../lib/productPrinting";

interface DateTokenHelpItem {
  description: string;
  examples: string;
  note?: string;
}

export interface PrintingDateFormatDraft {
  pattern: string;
  displayLabel: string;
  displayLabelMode: "auto" | "manual";
}

const DATE_PATTERN_EXAMPLES = ["DD/MM/YYYY", "MMM.Do,YYYY"] as const;
const DATE_TOKEN_HELP: Record<ProductDatePatternToken, DateTokenHelpItem> = {
  D: {
    description: "วันที่แบบไม่เติม 0 ด้านหน้า",
    examples: "1, 18, 29",
  },
  DD: {
    description: "วันที่ 2 หลัก",
    examples: "01, 18, 29",
  },
  Do: {
    description: "วันที่แบบ 1st / 2nd / 3rd / 4th",
    examples: "1st, 11th, 21st, 29th",
    note: "ระบบจะเลือก st / nd / rd / th ให้อัตโนมัติ",
  },
  M: {
    description: "เดือนแบบไม่เติม 0 ด้านหน้า",
    examples: "1, 6, 12",
  },
  MM: {
    description: "เดือน 2 หลัก",
    examples: "01, 06, 12",
  },
  MMM: {
    description: "ชื่อเดือนภาษาอังกฤษแบบย่อ",
    examples: "Jan, Jun, Dec",
  },
  MMMM: {
    description: "ชื่อเดือนภาษาอังกฤษแบบเต็ม",
    examples: "January, June, December",
  },
  YY: {
    description: "ปี 2 หลัก",
    examples: "25, 26",
  },
  YYYY: {
    description: "ปี 4 หลัก",
    examples: "2025, 2026",
  },
};
const CANONICAL_TOKEN_BY_LOWERCASE: Record<
  Lowercase<ProductDatePatternToken>,
  ProductDatePatternToken
> = {
  d: "D",
  dd: "DD",
  do: "Do",
  m: "M",
  mm: "MM",
  mmm: "MMM",
  mmmm: "MMMM",
  yy: "YY",
  yyyy: "YYYY",
};
const LOWERCASE_TOKEN_KEYS = (
  Object.keys(CANONICAL_TOKEN_BY_LOWERCASE) as Array<Lowercase<ProductDatePatternToken>>
).sort((left, right) => right.length - left.length);

function canonicalizeAlphabeticTokenRun(run: string): string {
  const lowercaseRun = run.toLowerCase();
  const canonicalParts: string[] = [];
  let position = 0;

  while (position < lowercaseRun.length) {
    const token = LOWERCASE_TOKEN_KEYS.find((candidate) => lowercaseRun.startsWith(candidate, position));
    if (!token) {
      canonicalParts.push(run[position].toUpperCase());
      position += 1;
      continue;
    }
    canonicalParts.push(CANONICAL_TOKEN_BY_LOWERCASE[token]);
    position += token.length;
  }

  return canonicalParts.join("");
}

/** Canonicalizes supported tokens and incomplete alphabetic input while preserving every separator verbatim. */
export function canonicalizePrintingDatePattern(pattern: string): string {
  return pattern.replace(/[A-Za-z]+/g, canonicalizeAlphabeticTokenRun);
}

export function safePatternError(pattern: string): string | null {
  try {
    tokenizeProductDatePattern(pattern);
    return null;
  } catch {
    return "รูปแบบวันที่ไม่ถูกต้อง ตรวจสอบ Token ที่รองรับด้านล่าง เช่น DD/MM/YYYY หรือ MMM.Do,YYYY";
  }
}

export function previewPrintingDatePattern(pattern: string, sampleDate: string): string | null {
  if (pattern.trim() === "" || safePatternError(pattern)) return null;
  return formatProductDate(sampleDate, {
    pattern,
    calendar: "gregorian",
    monthCase: "title",
  });
}

export function createPrintingDateFormatDraft(): PrintingDateFormatDraft {
  return {
    pattern: "",
    displayLabel: "",
    displayLabelMode: "auto",
  };
}

export function updatePrintingDateFormatDraftPattern(
  draft: PrintingDateFormatDraft,
  pattern: string,
  sampleDate: string,
): PrintingDateFormatDraft {
  const canonicalPattern = canonicalizePrintingDatePattern(pattern);
  const preview = previewPrintingDatePattern(canonicalPattern, sampleDate);
  return {
    ...draft,
    pattern: canonicalPattern,
    displayLabel: draft.displayLabelMode === "auto"
      ? preview ?? ""
      : draft.displayLabel,
  };
}

export function canonicalizePrintingDateFormatDraftPattern(
  draft: PrintingDateFormatDraft,
  sampleDate: string,
): PrintingDateFormatDraft {
  return updatePrintingDateFormatDraftPattern(
    draft,
    canonicalizePrintingDatePattern(draft.pattern),
    sampleDate,
  );
}

export function updatePrintingDateFormatDraftLabel(
  draft: PrintingDateFormatDraft,
  displayLabel: string,
): PrintingDateFormatDraft {
  return {
    ...draft,
    displayLabel,
    displayLabelMode: "manual",
  };
}

export function canSubmitPrintingDateFormatDraft(draft: PrintingDateFormatDraft): boolean {
  return draft.pattern.trim() !== ""
    && draft.displayLabel.trim() !== ""
    && safePatternError(draft.pattern) === null;
}

export function PrintingDatePatternExamples({ sampleDate }: { sampleDate: string }) {
  return (
    <div id="printing-date-pattern-examples" className="mt-1.5 space-y-0.5 text-[11px] text-slate-500">
      <p className="font-semibold text-slate-600">ตัวอย่าง Pattern</p>
      {DATE_PATTERN_EXAMPLES.map((pattern) => (
        <p key={pattern} className="break-words">
          <code className="font-mono text-[#00263A]">{pattern}</code>
          {" → "}
          <span className="font-mono">{formatProductDate(sampleDate, { pattern, calendar: "gregorian", monthCase: "title" })}</span>
        </p>
      ))}
    </div>
  );
}

export function PrintingDateTokenHelp() {
  return (
    <div id="printing-date-token-help" aria-labelledby="printing-date-token-help-title" className="rounded-lg border border-[#D9E1E2] bg-white p-3">
      <h5 id="printing-date-token-help-title" className="text-xs font-black text-[#00263A]">Token ที่ใช้ได้</h5>
      <p className="mt-1 text-[11px] text-slate-500">ใช้ Token ด้านล่างร่วมกับตัวคั่น เช่น ช่องว่าง / - . , ได้ โดยไม่ต้องพิมพ์ TH ต่อท้ายวันที่เอง</p>
      <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(DATE_TOKEN_HELP).map(([token, help]) => (
          <li key={token} className="min-w-0 rounded-md bg-[#F5F7F8] px-2.5 py-2 text-[11px] text-slate-600">
            <div className="flex min-w-0 items-baseline gap-2">
              <code className="shrink-0 rounded bg-[#EAF3FC] px-1.5 py-0.5 font-mono font-black text-[#0057B8]">{token}</code>
              <span className="min-w-0 break-words font-semibold text-slate-700">{help.description}</span>
            </div>
            <p className="mt-1 break-words text-slate-500">ตัวอย่าง: {help.examples}</p>
            {help.note && <p className="mt-1 break-words text-[#007C91]">{help.note}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
