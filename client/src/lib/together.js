// Start of the relationship, local midnight (new Date('2024-11-24') would be UTC midnight: the 23rd west of UTC)
export const ANNIVERSARY = new Date(2024, 10, 24);

// Years, months and days from `start` to `now`, by local calendar dates
export function timeBetween(start, now = new Date()) {
  let years = now.getFullYear() - start.getFullYear();
  let months = now.getMonth() - start.getMonth();
  let days = now.getDate() - start.getDate();

  if (days < 0) {
    months--;
    const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
    days += lastMonth.getDate();
  }

  if (months < 0) {
    years--;
    months += 12;
  }

  return { years, months, days };
}
