export interface DateWindow {
  start: Date;
  end: Date;
}

const MS_DAY = 86_400_000;

export function parsePointDate(value: string): Date | undefined {
  const d = new Date(value);
  if (isNaN(d.getTime())) return undefined;
  return d;
}

export function resolveDateIntervalUtc(
  keyword: string,
  now: Date = new Date()
): DateWindow | undefined {
  const k = keyword.toLowerCase();
  const todayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  switch (k) {
    case "today":
      return { start: todayStart, end: addMs(todayStart, MS_DAY - 1) };
    case "yesterday": {
      const s = addMs(todayStart, -MS_DAY);
      return { start: s, end: addMs(s, MS_DAY - 1) };
    }
    case "this week": {
      const day = todayStart.getUTCDay();
      const s = addMs(todayStart, -day * MS_DAY);
      return { start: s, end: addMs(s, 7 * MS_DAY - 1) };
    }
    case "this month": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 1);
      return { start: s, end: e };
    }
    case "last month": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 1);
      return { start: s, end: e };
    }
    case "this year": {
      const s = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1) - 1);
      return { start: s, end: e };
    }
    case "last year": {
      const s = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
      const e = new Date(Date.UTC(now.getUTCFullYear(), 0, 1) - 1);
      return { start: s, end: e };
    }
    default:
      return undefined;
  }
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function endOfDayUtc(d: Date): Date {
  const s = startOfDayUtc(d);
  return addMs(s, MS_DAY - 1);
}

function addMs(d: Date, ms: number): Date {
  return new Date(d.getTime() + ms);
}
