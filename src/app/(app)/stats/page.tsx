import Link from "next/link";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getCurrentUserAndRole } from "@/lib/auth/role";
import { countBy, histogram, monthlyTimeline, numStats } from "@/lib/stats/aggregate";

export const dynamic = "force-dynamic";

// RLS 가 자동으로 사용자별 가시 범위로 필터링한다. admin = 전체,
// lead/surveyor = 담당 지역, collaborator = 공유받은 site, guest = 0건.
// guest 는 데이터가 없으면 안내만.
export default async function StatsPage() {
  const { role } = await getCurrentUserAndRole();
  const sb = await getSupabaseServer();

  // 데이터 fetch — limit 5000 은 베타 규모용. 데이터가 더 커지면 Postgres
  // RPC 또는 머터리얼라이즈드 뷰로 옮긴다(docs/OPERATIONS.md TODO).
  const [
    { count: siteCount },
    { count: treeCount },
    { count: eventCount },
    { count: photoCount },
    { count: dnaCount },
    { data: events },
    { data: trees },
    { data: sites },
    { data: species },
  ] = await Promise.all([
    sb.from("sites").select("*", { count: "exact", head: true }),
    sb.from("trees").select("*", { count: "exact", head: true }),
    sb.from("sampling_events").select("*", { count: "exact", head: true }),
    sb.from("photos").select("*", { count: "exact", head: true }),
    sb.from("dna_results").select("*", { count: "exact", head: true }),
    sb
      .from("sampling_events")
      .select("id, tree_id, sampled_at, height_m, dbh_cm, dna_collected, sync_status")
      .limit(5000),
    sb.from("trees").select("id, site_id, species_code").limit(5000),
    sb.from("sites").select("id, region_sigungu, region_sigungu_code, region_sido").limit(5000),
    sb.from("species").select("code, ko_name"),
  ]);

  const eventsRows = (events ?? []) as Array<{
    id: string;
    tree_id: string;
    sampled_at: string;
    height_m: number | null;
    dbh_cm: number | null;
    dna_collected: boolean;
    sync_status: string;
  }>;
  const treesById = new Map(
    ((trees as Array<{ id: string; site_id: string; species_code: string | null }> | null) ?? []).map((t) => [t.id, t]),
  );
  const sitesById = new Map(
    ((sites as Array<{ id: string; region_sigungu: string | null; region_sigungu_code: string | null; region_sido: string | null }> | null) ?? []).map((s) => [s.id, s]),
  );
  const speciesByCode = new Map(
    ((species as Array<{ code: string; ko_name: string }> | null) ?? []).map((sp) => [sp.code, sp]),
  );

  // 이벤트 단위로 region·species 를 join. tree/site 가 RLS 로 가려졌을 수도 있어 fallback 처리.
  const joined = eventsRows.map((e) => {
    const tree = treesById.get(e.tree_id);
    const site = tree ? sitesById.get(tree.site_id) : undefined;
    const sp = tree?.species_code ? speciesByCode.get(tree.species_code) : undefined;
    return {
      ...e,
      region_sigungu: site?.region_sigungu ?? null,
      region_sido: site?.region_sido ?? null,
      species_code: tree?.species_code ?? null,
      species_ko: sp?.ko_name ?? null,
    };
  });

  // 통계 계산
  const bySigungu = countBy(joined, (e) => e.region_sigungu);
  const bySido = countBy(joined, (e) => e.region_sido);
  const bySpecies = countBy(joined, (e) => e.species_ko ?? e.species_code);
  const heightStats = numStats(joined.map((e) => e.height_m));
  const dbhStats = numStats(joined.map((e) => e.dbh_cm));
  const heightHist = histogram(
    joined.map((e) => e.height_m),
    { min: 0, max: 50, width: 5, unit: "m" },
  );
  const dbhHist = histogram(
    joined.map((e) => e.dbh_cm),
    { min: 0, max: 200, width: 20, unit: "cm" },
  );
  const monthly = monthlyTimeline(
    joined.map((e) => e.sampled_at),
    12,
  );
  const dnaCollected = joined.filter((e) => e.dna_collected).length;
  const dnaRate = joined.length > 0 ? Math.round((dnaCollected / joined.length) * 100) : 0;
  const syncBuckets = countBy(joined, (e) => e.sync_status);

  // 수종별 평균 수고/DBH
  const speciesAverages = bySpecies.slice(0, 15).map((b) => {
    const subset = joined.filter((e) => (e.species_ko ?? e.species_code) === b.key);
    return {
      key: b.key,
      count: b.count,
      avgHeight: numStats(subset.map((e) => e.height_m)).mean,
      avgDbh: numStats(subset.map((e) => e.dbh_cm)).mean,
    };
  });

  const maxMonthly = Math.max(1, ...monthly.map((m) => m.count));
  const maxHist = Math.max(1, ...heightHist.map((b) => b.count), ...dbhHist.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">통계 대시보드</h1>
        <p className="text-xs text-stone-500 mt-1">
          본인 권한 범위 안의 데이터로 계산됩니다 ({roleLabel(role)}). 페이지 진입 시점 기준 스냅샷.
        </p>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="조사지점 Sites" value={siteCount ?? 0} />
        <KpiCard label="개체목 Trees" value={treeCount ?? 0} />
        <KpiCard label="야장 Events" value={eventCount ?? 0} />
        <KpiCard label="사진 Photos" value={photoCount ?? 0} />
        <KpiCard label="DNA 분석 결과" value={dnaCount ?? 0} />
      </div>

      {joined.length === 0 && (
        <p className="text-sm text-stone-500 rounded-lg border border-stone-200 bg-white p-4">
          접근 가능한 야장 데이터가 없습니다.
          {role === "guest" && (
            <>
              {" "}가입은 완료됐지만 관리자의 역할 부여를 기다리고 있는 상태일 수 있어요.{" "}
              <Link href="/forbidden?need=admin,lead,surveyor&have=guest" className="underline">자세히</Link>
            </>
          )}
        </p>
      )}

      {joined.length > 0 && (
        <>
          {/* 측정값 요약 */}
          <section className="grid md:grid-cols-2 gap-4">
            <Card title="수고 (m)">
              <NumStatsRow stats={heightStats} unit="m" decimals={1} />
            </Card>
            <Card title="흉고직경 DBH (cm)">
              <NumStatsRow stats={dbhStats} unit="cm" decimals={1} />
            </Card>
          </section>

          {/* 히스토그램 */}
          <section className="grid md:grid-cols-2 gap-4">
            <Card title="수고 분포">
              <BarChart bins={heightHist} max={maxHist} />
            </Card>
            <Card title="DBH 분포">
              <BarChart bins={dbhHist} max={maxHist} />
            </Card>
          </section>

          {/* 지역 + 수종 */}
          <section className="grid md:grid-cols-2 gap-4">
            <Card title={`시군구별 야장 (${bySigungu.length}개 지역)`}>
              <BarList items={bySigungu} total={joined.length} emptyLabel="(시군구 미입력)" />
            </Card>
            <Card title={`수종별 야장 (${bySpecies.length}개 종)`}>
              <BarList items={bySpecies} total={joined.length} emptyLabel="(수종 미입력)" />
            </Card>
          </section>

          {/* 수종별 평균 측정값 */}
          {speciesAverages.length > 0 && (
            <section>
              <Card title="수종별 평균 측정값 (상위 15종)">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-xs text-stone-500">
                      <tr className="border-b border-stone-200">
                        <th className="text-left py-1.5">수종</th>
                        <th className="text-right">야장 수</th>
                        <th className="text-right">평균 수고</th>
                        <th className="text-right">평균 DBH</th>
                      </tr>
                    </thead>
                    <tbody>
                      {speciesAverages.map((s) => (
                        <tr key={s.key} className="border-b border-stone-100">
                          <td className="py-1.5">{s.key}</td>
                          <td className="text-right tabular-nums">{s.count}</td>
                          <td className="text-right tabular-nums">{s.avgHeight != null ? `${s.avgHeight.toFixed(1)} m` : "-"}</td>
                          <td className="text-right tabular-nums">{s.avgDbh != null ? `${s.avgDbh.toFixed(1)} cm` : "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </section>
          )}

          {/* 월별 시계열 */}
          <section>
            <Card title="월별 야장 등록 (최근 12개월)">
              <div className="flex items-end gap-1 h-40">
                {monthly.map((m) => {
                  // 막대 영역(약 96px) 기준 픽셀 높이. 0 건은 2px(흔적), 그 외는 최소 4px 보장.
                  const heightPx = m.count === 0 ? 2 : Math.max(4, Math.round((m.count / maxMonthly) * 96));
                  return (
                    <div key={m.ym} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end">
                      <div
                        className="w-full bg-brand-700 rounded-t"
                        style={{ height: `${heightPx}px` }}
                        title={`${m.ym}: ${m.count}건`}
                      />
                      <div className="text-[10px] text-stone-500 mt-1 truncate w-full text-center">
                        {m.ym.slice(2)}
                      </div>
                      <div className="text-[10px] text-stone-700 tabular-nums">{m.count}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </section>

          {/* DNA + 동기화 상태 */}
          <section className="grid md:grid-cols-2 gap-4">
            <Card title="DNA 채취 비율">
              <div className="flex items-baseline gap-3">
                <div className="text-3xl font-bold text-brand-700">{dnaRate}%</div>
                <div className="text-sm text-stone-600">
                  {dnaCollected} / {joined.length} 건
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-stone-100 overflow-hidden">
                <div className="h-full bg-emerald-600" style={{ width: `${dnaRate}%` }} />
              </div>
            </Card>
            <Card title="동기화 상태 분포">
              <ul className="space-y-1 text-sm">
                {syncBuckets.length === 0 ? (
                  <li className="text-stone-500">데이터 없음</li>
                ) : (
                  syncBuckets.map((b) => (
                    <li key={b.key} className="flex justify-between">
                      <span className="font-mono">{b.key}</span>
                      <span className="tabular-nums">{b.count}건</span>
                    </li>
                  ))
                )}
              </ul>
            </Card>
          </section>

          {bySido.length > 1 && (
            <section>
              <Card title={`시도별 야장 (${bySido.length}개 시도)`}>
                <BarList items={bySido} total={joined.length} />
              </Card>
            </section>
          )}
        </>
      )}

      <p className="text-xs text-stone-400">
        ※ 통계는 RLS 권한 범위 내에서 계산됩니다. 본 페이지는 최대 5,000건의 야장을 집계하며, 그 이상이면 후속 작업으로 RPC 또는 머터리얼라이즈드 뷰가 필요합니다.
      </p>
    </div>
  );
}

function roleLabel(role: string): string {
  const map: Record<string, string> = {
    admin: "관리자",
    lead: "조사책임자",
    surveyor: "조사원",
    collaborator: "외부 협력자",
    guest: "Guest",
  };
  return map[role] ?? role;
}

function KpiCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="card text-center">
      <div className="text-[11px] text-stone-500 uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold mt-1 text-brand-700 tabular-nums">{value.toLocaleString("ko-KR")}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="card">
      <h2 className="text-sm font-bold text-brand-700 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function NumStatsRow({
  stats,
  unit,
  decimals = 1,
}: {
  stats: ReturnType<typeof numStats>;
  unit: string;
  decimals?: number;
}) {
  const fmt = (v: number | null) => (v == null ? "-" : `${v.toFixed(decimals)} ${unit}`);
  return (
    <dl className="grid grid-cols-3 gap-2 text-sm">
      <Stat label="N" value={stats.count.toLocaleString("ko-KR")} />
      <Stat label="평균" value={fmt(stats.mean)} />
      <Stat label="중위수" value={fmt(stats.median)} />
      <Stat label="표준편차" value={fmt(stats.stddev)} />
      <Stat label="최소" value={fmt(stats.min)} />
      <Stat label="최대" value={fmt(stats.max)} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] text-stone-500">{label}</dt>
      <dd className="font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function BarChart({
  bins,
  max,
}: {
  bins: Array<{ label: string; count: number }>;
  max: number;
}) {
  // 막대 height 를 px 로 직접 계산 — 부모의 % 기준 height resolution 이 column flex
  // 안에서 불안정하던 문제(0px로 안 보임)를 우회. column 에 h-full + justify-end 로
  // 막대가 컨테이너 바닥에서 위로 자라도록.
  return (
    <div className="flex items-end gap-1 h-40">
      {bins.map((b) => {
        const heightPx = b.count === 0 ? 2 : Math.max(4, Math.round((b.count / max) * 96));
        return (
          <div key={b.label} className="flex flex-col items-center flex-1 min-w-0 h-full justify-end">
            <div
              className="w-full bg-brand-500 rounded-t"
              style={{ height: `${heightPx}px` }}
              title={`${b.label}: ${b.count}건`}
            />
            <div className="text-[10px] text-stone-500 mt-1 truncate w-full text-center">{b.label}</div>
            <div className="text-[10px] text-stone-700 tabular-nums">{b.count}</div>
          </div>
        );
      })}
    </div>
  );
}

function BarList<K extends string | number>({
  items,
  total,
  emptyLabel,
}: {
  items: Array<{ key: K; count: number }>;
  total: number;
  emptyLabel?: string;
}) {
  if (items.length === 0) {
    return <p className="text-xs text-stone-500">데이터 없음</p>;
  }
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <ul className="space-y-1.5">
      {items.slice(0, 20).map((i) => {
        const widthPct = (i.count / max) * 100;
        const pct = total > 0 ? Math.round((i.count / total) * 1000) / 10 : 0;
        return (
          <li key={String(i.key) || "_empty"} className="text-sm">
            <div className="flex justify-between gap-2 mb-0.5">
              <span className="truncate">{String(i.key) || emptyLabel || "(빈 값)"}</span>
              <span className="tabular-nums text-stone-600 text-xs whitespace-nowrap">
                {i.count}건 · {pct}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-stone-100 overflow-hidden">
              <div className="h-full bg-brand-700" style={{ width: `${widthPct}%` }} />
            </div>
          </li>
        );
      })}
      {items.length > 20 && (
        <li className="text-xs text-stone-500">… 외 {items.length - 20}개</li>
      )}
    </ul>
  );
}
