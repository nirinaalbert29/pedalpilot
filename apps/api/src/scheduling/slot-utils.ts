export interface LocalDateParts { year: number; month: number; day: number; }

export function datePartsInZone(value: Date, timeZone: string): LocalDateParts {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value);
  const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

export function addLocalDays(parts: LocalDateParts, amount: number): LocalDateParts {
  const value = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function localDateTimeToUtc(parts: LocalDateParts, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat('en-GB', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i += 1) {
    const pieces = Object.fromEntries(formatter.formatToParts(new Date(guess)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
    const observed = Date.UTC(pieces.year!, pieces.month! - 1, pieces.day!, pieces.hour!, pieces.minute!);
    const delta = observed - target;
    if (!delta) return new Date(guess);
    guess -= delta;
  }
  return new Date(guess);
}

export function weekdayOf(parts: LocalDateParts): number {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}
