// =====================================================================
// SHARED BILLING UTILITIES — Timezone-safe date parsing & calculations
// =====================================================================
// All date operations use UTC methods to avoid timezone shift bugs.
// Date-only strings like "2026-03-15" are always parsed as UTC midnight
// so that getUTCDate/getUTCMonth/getUTCFullYear return the correct values
// regardless of server/browser timezone.
//
// +1 Day Rule (Anniversary Date Billing):
//   Cycle Start: Check-in Date se agle mahine ki same date tak 1 Month count hoga
//   The +1 Day Rule: Agar current date anniversary date se 1 din bhi zyada hoti hai,
//     toh turant agla Month ka rent add ho jayega
//
//   Examples (check-in 15/03/2026, cycleDay = 15):
//     15/03 → 15/04 = 1 Month (anniversary = month complete)
//     16/04 hote hi = 2 Months (+1 Day triggers 2nd month)
//     15/05 = 2 Months
//     16/05 hote hi = 3 Months (+1 Day triggers 3rd month)
// =====================================================================

/**
 * Parse a date-only string ("YYYY-MM-DD") or ISO string into a Date
 * that represents UTC midnight of that calendar date.
 * This ensures getUTCDate/getUTCMonth/getUTCFullYear always return
 * the values the user intended, regardless of timezone.
 */
export function parseDateSafe(dateInput: string | Date): Date {
  if (dateInput instanceof Date) {
    return dateInput;
  }
  // Extract the date part (handles both "2026-03-15" and "2026-03-15T00:00:00.000Z")
  const datePart = dateInput.split('T')[0];
  const [y, m, d] = datePart.split('-').map(Number);
  // Create as UTC midnight so UTC methods return the correct values
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Get date components (year, month 1-based, day) using UTC methods.
 * This is timezone-safe and avoids the local-time shift bug.
 */
export function getDateComponents(dateInput: string | Date): {
  year: number;
  month: number; // 1-12
  day: number;
} {
  const d = parseDateSafe(dateInput);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1, // convert to 1-based
    day: d.getUTCDate(),
  };
}

/**
 * Calculate total billable months using the +1 Day Rule.
 *
 * +1 Day Rule:
 *   On the anniversary date (cycleDay): month is COMPLETE, but NOT yet the next month
 *   The day AFTER the anniversary date (+1): triggers the next billing month
 *
 * Formula:
 *   months = (refYear - checkInYear) * 12 + (refMonth - checkInMonth)
 *   if refDay > cycleDay: months += 1  (+1 Day Rule)
 *   minimum 1 month always billable
 *
 * Uses UTC methods for timezone safety.
 *
 * @param checkInDate - Check-in date (string "YYYY-MM-DD" or ISO or Date)
 * @param referenceDate - Reference date (defaults to current date)
 * @returns Number of billable months (minimum 1)
 */
export function calculateStayMonths(
  checkInDate: string | Date,
  referenceDate?: string | Date
): number {
  const checkIn = getDateComponents(checkInDate);
  const ref = referenceDate
    ? getDateComponents(referenceDate)
    : getDateComponents(new Date());

  const cycleDay = checkIn.day;

  const yearDiff = ref.year - checkIn.year;
  const monthDiff = ref.month - checkIn.month;
  let months = yearDiff * 12 + monthDiff;

  // +1 Day Rule: Agar reference date anniversary date se 1 din bhi zyada hoti hai,
  // toh turant agla Month ka rent add ho jayega
  // On the cycle date itself: month is COMPLETE but next month NOT yet started
  // So we use STRICTLY GREATER THAN (>) not >=
  if (ref.day > cycleDay) {
    months += 1;
  }

  return Math.max(1, months); // At least 1 month is always billable
}

/**
 * Determine which billing period is "current" based on the +1 Day Rule.
 * Current period = the month whose billing cycle is still running.
 *
 * +1 Day Rule:
 *   On the cycle date itself, we're still in the PREVIOUS period
 *   New period only starts the day AFTER the cycle date (refDay > cycleDay)
 *   If refDay <= cycleDay: still in previous period → last month is the period
 *   If refDay > cycleDay: new period has started → current month is the period
 *
 * Uses UTC methods for timezone safety.
 *
 * @param checkInDate - Check-in date
 * @param liveDate - Current/reference date
 * @returns Current billing period { month: 1-12, year } or null
 */
export function getCurrentBillingPeriod(
  checkInDate: string | Date,
  liveDate: string | Date
): { month: number; year: number } | null {
  const checkIn = getDateComponents(checkInDate);
  const live = getDateComponents(liveDate);
  const cycleDay = checkIn.day;

  let periodStartMonth = live.month; // 1-based
  let periodStartYear = live.year;

  // +1 Day Rule: On the cycle date itself, we're still in the PREVIOUS period
  // New period only starts the day AFTER the cycle date (liveDay > cycleDay)
  if (live.day <= cycleDay) {
    periodStartMonth -= 1;
    if (periodStartMonth < 1) {
      periodStartMonth = 12;
      periodStartYear -= 1;
    }
  }

  return {
    month: periodStartMonth, // already 1-based
    year: periodStartYear,
  };
}

/**
 * Calculate days between two dates (inclusive of start, exclusive of end).
 * Uses UTC dates for timezone safety.
 */
export function daysBetween(
  startDate: string | Date,
  endDate: string | Date
): number {
  const start = parseDateSafe(startDate);
  const end = parseDateSafe(endDate);
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
