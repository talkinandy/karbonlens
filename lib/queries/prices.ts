import { db } from '@/lib/db';
import { idxMonthlySnapshots } from '@/lib/schema';
import { desc, sql } from 'drizzle-orm';

export async function getPriceHistory() {
  return db
    .select()
    .from(idxMonthlySnapshots)
    .orderBy(desc(idxMonthlySnapshots.periodMonth))
    .limit(24); // returns however many exist (currently 10)
}

export type PriceRow = Awaited<ReturnType<typeof getPriceHistory>>[number];

// SEO Phase 2E — IDXCarbon market context for a given calendar year.
// Returns null if no snapshots exist for the year (typical for vintages
// older than IDXCarbon's launch, e.g. anything pre-2024).
export type YearPriceContext = {
  year: number;
  monthsCovered: number;
  totalVolumeTco2e: number;
  totalValueIdr: number;
  avgPriceIdr: number;
  firstMonth: string; // YYYY-MM
  lastMonth: string;
};

export async function getPriceContextForYear(
  year: number,
): Promise<YearPriceContext | null> {
  try {
    const rows = (await db.execute(sql`
      SELECT
        COUNT(*)::int                                          AS months_covered,
        COALESCE(SUM(total_volume_tco2e::numeric), 0)::text     AS total_volume_tco2e,
        COALESCE(SUM(total_value_idr::numeric), 0)::text        AS total_value_idr,
        TO_CHAR(MIN(period_month), 'YYYY-MM')                   AS first_month,
        TO_CHAR(MAX(period_month), 'YYYY-MM')                   AS last_month
      FROM idx_monthly_snapshots
      WHERE EXTRACT(YEAR FROM period_month) = ${year}
    `)) as unknown as Array<{
      months_covered: number;
      total_volume_tco2e: string;
      total_value_idr: string;
      first_month: string | null;
      last_month: string | null;
    }>;
    const r = rows[0];
    const monthsCovered = Number(r?.months_covered ?? 0);
    if (monthsCovered === 0) return null;
    const totalVolume = Number(r?.total_volume_tco2e ?? 0);
    const totalValue = Number(r?.total_value_idr ?? 0);
    // Volume-weighted average price across the year.
    const avgPrice = totalVolume > 0 ? totalValue / totalVolume : 0;
    return {
      year,
      monthsCovered,
      totalVolumeTco2e: totalVolume,
      totalValueIdr: totalValue,
      avgPriceIdr: avgPrice,
      firstMonth: r?.first_month ?? `${year}-01`,
      lastMonth: r?.last_month ?? `${year}-12`,
    };
  } catch {
    return null;
  }
}
