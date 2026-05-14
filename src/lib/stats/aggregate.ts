// 통계 대시보드용 순수 aggregation 헬퍼.
// 모든 함수가 외부 의존성(Supabase·DOM) 없는 순수 함수라 단위 테스트가 쉽다.

export interface NumStats {
  count: number;
  mean: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
  stddev: number | null;
}

export function numStats(values: Array<number | null | undefined>): NumStats {
  const xs = values.filter((v): v is number => typeof v === "number" && isFinite(v));
  const n = xs.length;
  if (n === 0) return { count: 0, mean: null, median: null, min: null, max: null, stddev: null };
  const sum = xs.reduce((a, b) => a + b, 0);
  const mean = sum / n;
  const sorted = [...xs].sort((a, b) => a - b);
  const median =
    n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const min = sorted[0];
  const max = sorted[n - 1];
  // 모집단 표준편차 (N>=2 일 때만 의미)
  const stddev =
    n < 2
      ? 0
      : Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { count: n, mean, median, min, max, stddev };
}

export interface Bucket<K> {
  key: K;
  count: number;
}

export function countBy<T, K extends string | number>(
  rows: T[],
  keyFn: (r: T) => K | null | undefined,
): Bucket<K>[] {
  const map = new Map<K, number>();
  for (const r of rows) {
    const k = keyFn(r);
    if (k == null) continue;
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return Array.from(map.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
}

export interface HistogramBin {
  // [from, to) — 마지막 bin 은 [from, to] (포함)
  from: number;
  to: number;
  count: number;
  label: string;
}

/**
 * width 간격의 동등 폭 히스토그램. lastInclusive=true 면 마지막 bin 의 상한이
 * inclusive (예: width=5, max=50 일 때 [45,50] 으로 50 도 포함).
 */
export function histogram(
  values: Array<number | null | undefined>,
  opts: { min: number; max: number; width: number; unit?: string },
): HistogramBin[] {
  const { min, max, width } = opts;
  const unit = opts.unit ?? "";
  if (width <= 0 || max <= min) return [];
  const bins: HistogramBin[] = [];
  for (let from = min; from < max; from += width) {
    const to = Math.min(from + width, max);
    bins.push({
      from,
      to,
      count: 0,
      label: `${from}–${to}${unit}`,
    });
  }
  for (const raw of values) {
    if (typeof raw !== "number" || !isFinite(raw)) continue;
    if (raw < min) continue;
    let idx: number;
    if (raw >= max) {
      idx = bins.length - 1; // 상한 이상은 마지막 bin 에 묶음
    } else {
      idx = Math.floor((raw - min) / width);
    }
    if (idx >= 0 && idx < bins.length) bins[idx].count++;
  }
  return bins;
}

export interface MonthlyPoint {
  ym: string; // 'YYYY-MM'
  count: number;
}

/**
 * 월별 카운트. 입력 date 문자열은 ISO ('YYYY-MM-DD' 또는 그 이상).
 * monthsBack: 오늘 기준 몇 개월 치를 표시할지 (포함). 0건인 월도 0으로 채운다.
 */
export function monthlyTimeline(
  dates: Array<string | null | undefined>,
  monthsBack: number,
  today: Date = new Date(),
): MonthlyPoint[] {
  const buckets = new Map<string, number>();
  // 0 으로 초기화
  const months: string[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    months.push(ym);
    buckets.set(ym, 0);
  }
  for (const raw of dates) {
    if (!raw || raw.length < 7) continue;
    const ym = raw.slice(0, 7); // 'YYYY-MM'
    if (!buckets.has(ym)) continue; // 범위 밖
    buckets.set(ym, (buckets.get(ym) ?? 0) + 1);
  }
  return months.map((ym) => ({ ym, count: buckets.get(ym) ?? 0 }));
}
