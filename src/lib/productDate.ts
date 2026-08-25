export interface CalendarDate {
  year: number;
  month: number;
  day: number;
}

export type ActualExpiryOffsetDays = 0 | -1;

export interface CalculateProductExpiryDateInput {
  productionDate: string;
  shelfLifeMonths: string;
  actualExpiryOffsetDays: ActualExpiryOffsetDays;
}

const INTEGER_MAX = 2_147_483_647;
const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const POSITIVE_INTEGER_PATTERN = /^[1-9][0-9]*$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return days[month - 1] ?? 0;
}

function assertSafeInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${field} must be a safe integer`);
  }
}

/** Parses a timezone-free calendar date in canonical YYYY-MM-DD form. */
export function parseCalendarDate(input: string): CalendarDate {
  const match = CALENDAR_DATE_PATTERN.exec(input);
  if (!match) {
    throw new RangeError("Calendar date must use YYYY-MM-DD format");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError("Calendar date is not valid");
  }

  return { year, month, day };
}

/** Formats a validated calendar date in canonical YYYY-MM-DD form. */
export function formatCalendarDate(date: CalendarDate): string {
  const { year, month, day } = date;
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    year < 1 ||
    year > 9999 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month)
  ) {
    throw new RangeError("Calendar date is not valid");
  }

  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Adds calendar months and clamps the day to the target month's final day. */
export function addMonthsClamped(calendarDate: string, months: number): string {
  assertSafeInteger(months, "Months");
  const date = parseCalendarDate(calendarDate);
  const targetMonthIndex = (date.year - 1) * 12 + (date.month - 1) + months;
  const maxMonthIndex = 9999 * 12 - 1;

  if (targetMonthIndex < 0 || targetMonthIndex > maxMonthIndex) {
    throw new RangeError("Resulting calendar date is outside the supported range");
  }

  const year = Math.floor(targetMonthIndex / 12) + 1;
  const month = (targetMonthIndex % 12) + 1;
  return formatCalendarDate({
    year,
    month,
    day: Math.min(date.day, daysInMonth(year, month)),
  });
}

/** Adds signed calendar days without constructing a JavaScript Date. */
export function addCalendarDays(calendarDate: string, offsetDays: number): string {
  assertSafeInteger(offsetDays, "Calendar-day offset");
  let { year, month, day } = parseCalendarDate(calendarDate);
  let remaining = offsetDays;

  while (remaining > 0) {
    const lastDay = daysInMonth(year, month);
    if (day < lastDay) {
      day += 1;
    } else {
      day = 1;
      if (month === 12) {
        if (year === 9999) {
          throw new RangeError("Resulting calendar date is outside the supported range");
        }
        year += 1;
        month = 1;
      } else {
        month += 1;
      }
    }
    remaining -= 1;
  }

  while (remaining < 0) {
    if (day > 1) {
      day -= 1;
    } else {
      if (month === 1) {
        if (year === 1) {
          throw new RangeError("Resulting calendar date is outside the supported range");
        }
        year -= 1;
        month = 12;
      } else {
        month -= 1;
      }
      day = daysInMonth(year, month);
    }
    remaining += 1;
  }

  return formatCalendarDate({ year, month, day });
}

/** Parses the same positive, integer-safe shelf-life month string accepted by Phase 1B. */
export function parseProductShelfLifeMonths(value: string): number {
  const trimmed = value.trim();
  if (!POSITIVE_INTEGER_PATTERN.test(trimmed)) {
    throw new RangeError("Product shelf life must be a positive integer number of months");
  }

  if (trimmed.length > 10 || (trimmed.length === 10 && trimmed > String(INTEGER_MAX))) {
    throw new RangeError("Product shelf life exceeds the integer-safe database range");
  }

  return Number(trimmed);
}

/** Calculates canonical expiry: production date → clamped months → actual expiry offset. */
export function calculateProductExpiryDate({
  productionDate,
  shelfLifeMonths,
  actualExpiryOffsetDays,
}: CalculateProductExpiryDateInput): string {
  if (actualExpiryOffsetDays !== 0 && actualExpiryOffsetDays !== -1) {
    throw new RangeError("Actual expiry offset must be 0 or -1");
  }

  const months = parseProductShelfLifeMonths(shelfLifeMonths);
  return addCalendarDays(addMonthsClamped(productionDate, months), actualExpiryOffsetDays);
}
