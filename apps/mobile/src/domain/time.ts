export type TimeSegment = {
  started_at: string;
  ended_at: string | null;
};

export function segmentSeconds(segment: TimeSegment, now: Date = new Date()): number {
  const start = Date.parse(segment.started_at);
  const end = segment.ended_at ? Date.parse(segment.ended_at) : now.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return Math.floor((end - start) / 1000);
}

export function sumSegmentSeconds(segments: TimeSegment[], now: Date = new Date()): number {
  return segments.reduce((total, segment) => total + segmentSeconds(segment, now), 0);
}

export function localDayKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function secondsByLocalDay(
  segments: TimeSegment[],
  now: Date = new Date(),
): Record<string, number> {
  const totals: Record<string, number> = {};

  for (const segment of segments) {
    const parsedStart = Date.parse(segment.started_at);
    const parsedEnd = segment.ended_at ? Date.parse(segment.ended_at) : now.getTime();
    if (!Number.isFinite(parsedStart) || !Number.isFinite(parsedEnd) || parsedEnd <= parsedStart) {
      continue;
    }

    let cursor = new Date(parsedStart);
    const end = new Date(parsedEnd);
    while (cursor.getTime() < end.getTime()) {
      const nextDay = new Date(cursor);
      nextDay.setHours(0, 0, 0, 0);
      nextDay.setDate(nextDay.getDate() + 1);
      const sliceEnd = Math.min(nextDay.getTime(), end.getTime());
      const seconds = Math.floor((sliceEnd - cursor.getTime()) / 1000);
      const key = localDayKey(cursor);
      totals[key] = (totals[key] ?? 0) + seconds;
      cursor = new Date(sliceEnd);
    }
  }

  return totals;
}

export function formatDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const totalMinutes = Math.floor(safeSeconds / 60);
  if (totalMinutes < 1) return safeSeconds === 0 ? '0 min' : 'under 1 min';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return totalMinutes + ' min';
  if (minutes === 0) return hours + ' hr';
  return hours + ' hr ' + minutes + ' min';
}

export function dateLabel(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function weekStart(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  const daysSinceMonday = (result.getDay() + 6) % 7;
  result.setDate(result.getDate() - daysSinceMonday);
  return result;
}

export function shiftLocalDay(date: Date, days: number): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  result.setDate(result.getDate() + days);
  return result;
}

export function localDateInput(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function calendarDaysInclusive(start: string, end: string): number {
  const first = new Date(start);
  const last = new Date(end);
  if (!Number.isFinite(first.getTime()) || !Number.isFinite(last.getTime())) return 0;
  const firstUtcDay = Date.UTC(first.getFullYear(), first.getMonth(), first.getDate());
  const lastUtcDay = Date.UTC(last.getFullYear(), last.getMonth(), last.getDate());
  return Math.max(1, Math.floor((lastUtcDay - firstUtcDay) / 86400000) + 1);
}
