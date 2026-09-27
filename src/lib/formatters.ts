export function parseFlexibleNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.trim().replace(/[^0-9.-]/g, '');
    if (!cleaned) return null;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

export function formatCompactNumber(value: number | string | null | undefined, digits = 1) {
  const num = parseFlexibleNumber(value) ?? 0;
  const abs = Math.abs(num);

  if (abs >= 1_000_000_000_000) {
    return `${(num / 1_000_000_000_000).toFixed(digits).replace(/\.0$/, '')}T`;
  }

  if (abs >= 1_000_000_000) {
    return `${(num / 1_000_000_000).toFixed(digits).replace(/\.0$/, '')}B`;
  }

  if (abs >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(digits).replace(/\.0$/, '')}M`;
  }

  if (abs >= 1_000) {
    return `${(num / 1_000).toFixed(digits).replace(/\.0$/, '')}K`;
  }

  return `${Math.round(num)}`;
}

export function formatTokenValue(value: number | string | null | undefined) {
  return formatCompactNumber(value, 1);
}

export function parseDateTime(value?: string | null): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayTime(value?: string | null) {
  if (!value) {
    return '--';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const date = parseDateTime(value);
  if (!date) {
    return value;
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

export function formatPointLabel(value: string, rangeKey: string) {
  const date = parseDateTime(value);
  if (!date) return value;

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  const hours = `${date.getHours()}`.padStart(2, '0');
  const minutes = `${date.getMinutes()}`.padStart(2, '0');

  if (rangeKey === '24h') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return `${hours}:${minutes}`;
    }
    return `${month}-${day}`;
  }

  return `${month}-${day}`;
}

export function formatLatencyMs(ms?: number | string | null) {
  const num = parseFlexibleNumber(ms);
  if (num == null) return '--';
  if (num < 1000) return `${Math.round(num)} ms`;
  if (num < 60_000) return `${(num / 1000).toFixed(1)} s`;
  return `${(num / 60_000).toFixed(1)} min`;
}

export function formatMoneyPrecise(value?: number | string | null) {
  const num = parseFlexibleNumber(value);
  if (num == null) return '--';
  if (num > 0 && num < 0.01) {
    return `$${num.toFixed(4)}`;
  }
  return `$${num.toFixed(2)}`;
}

