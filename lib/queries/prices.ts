import { db } from '@/lib/db';
import { idxMonthlySnapshots } from '@/lib/schema';
import { desc } from 'drizzle-orm';

export async function getPriceHistory() {
  return db
    .select()
    .from(idxMonthlySnapshots)
    .orderBy(desc(idxMonthlySnapshots.periodMonth))
    .limit(24); // returns however many exist (currently 10)
}

export type PriceRow = Awaited<ReturnType<typeof getPriceHistory>>[number];
