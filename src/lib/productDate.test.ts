import { describe, expect, it } from "vitest";
import {
  addCalendarDays,
  addMonthsClamped,
  calculateProductExpiryDate,
  formatCalendarDate,
  parseCalendarDate,
  parseProductShelfLifeMonths,
} from "./productDate";

describe("productDate", () => {
  it("parses only valid canonical calendar dates", () => {
    expect(parseCalendarDate("2025-02-28")).toEqual({ year: 2025, month: 2, day: 28 });
    expect(formatCalendarDate({ year: 2025, month: 2, day: 28 })).toBe("2025-02-28");
    for (const value of ["", "2025-2-28", "2025-02-29", "2025-04-31", "2025-13-01"]) {
      expect(() => parseCalendarDate(value)).toThrow();
    }
  });

  it("clamps month-end dates with PostgreSQL-compatible semantics", () => {
    expect(addMonthsClamped("2025-01-31", 1)).toBe("2025-02-28");
    expect(addMonthsClamped("2024-01-31", 1)).toBe("2024-02-29");
    expect(addMonthsClamped("2024-02-29", 12)).toBe("2025-02-28");
  });

  it("adds calendar days without timezone conversion", () => {
    expect(addCalendarDays("2027-12-12", -1)).toBe("2027-12-11");
    expect(addCalendarDays("2024-03-01", -1)).toBe("2024-02-29");
  });

  it("parses only strict, positive, database-safe shelf-life months", () => {
    for (const value of ["1", "3", "6", "8", "12", "18", "24", "36", "48", "2147483647"]) {
      expect(parseProductShelfLifeMonths(value)).toBe(Number(value));
    }
    for (const value of ["", " ", "0", "-1", "1.5", "12 months", "1 year", "30 วัน", "2147483648"]) {
      expect(() => parseProductShelfLifeMonths(value)).toThrow();
    }
  });

  it("calculates canonical expiry without printing concerns", () => {
    expect(calculateProductExpiryDate({ productionDate: "2026-12-12", shelfLifeMonths: "12", actualExpiryOffsetDays: 0 })).toBe("2027-12-12");
    expect(calculateProductExpiryDate({ productionDate: "2026-12-12", shelfLifeMonths: "12", actualExpiryOffsetDays: -1 })).toBe("2027-12-11");
  });
});
