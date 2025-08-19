import type { SupabaseClient } from '../types/streaming-interfaces.ts';
import { getTextEmbedding } from './embeddings.ts';
import { normalizeContentForHash } from './memory-utils.ts';

export type BackfillOptions = {
  batchSize?: number; // rows per DB page
  concurrency?: number; // parallel embedding jobs per page
  maxRows?: number; // total cap, 0 = unlimited
  dryRun?: boolean;
};

export type BackfillResult = {
  scanned: number;
  processed: number;
  failed: number;
  pages: number;
  lastRowCreatedAt?: string;
};

export async function backfillMissingEmbeddings(
  supabase: SupabaseClient,
  opts: BackfillOptions = {}
): Promise<BackfillResult> {
  const batchSize = Math.max(1, opts.batchSize ?? 100);
  const concurrency = Math.max(1, opts.concurrency ?? 5);
  const maxRows = Math.max(0, opts.maxRows ?? 0);
  const dryRun = !!opts.dryRun;

  let scanned = 0;
  let processed = 0;
  let failed = 0;
  let pages = 0;
  let lastCreatedAt: string | undefined;

  console.log('🔧 Embedding backfill start', { batchSize, concurrency, maxRows, dryRun });

  while (true) {
    // Stop if processed cap reached
    if (maxRows && processed >= maxRows) break;

    const { data: rows, error } = await supabase
      .from('character_memories')
      .select('id, summary_content, created_at')
      .is('embedding', null)
      .not('summary_content', 'is', null)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      console.error('❌ Backfill query error:', error);
      break;
    }

    const list = rows || [];
    if (list.length === 0) {
      console.log('✅ No more rows needing embeddings');
      break;
    }

    pages++;
    scanned += list.length;
  const tail = list[list.length - 1] as any;
  lastCreatedAt = typeof tail?.created_at === 'string' ? tail.created_at as string : undefined;

    console.log(`📦 Backfill page #${pages} - ${list.length} rows`);

    // Process in chunks respecting concurrency
    for (let i = 0; i < list.length; i += concurrency) {
      const slice = list.slice(i, i + concurrency);
      const results = await Promise.allSettled(
  slice.map(async (row: any) => {
          try {
            if (dryRun) return 'dryRun';

            const text = normalizeContentForHash(typeof row.summary_content === 'string' ? row.summary_content : '');
            const vec = await getTextEmbedding(text);
            if (!vec) throw new Error('No embedding returned');

            const upd = await supabase
              .from('character_memories')
              .update({ embedding: vec as any })
              .eq('id', String(row.id));

            if (upd.error) throw upd.error;
            return 'ok';
          } catch (e) {
            console.warn('⚠️ Backfill row failed:', String(row?.id), e);
            throw e;
          }
        })
      );

      results.forEach((r) => {
        if (r.status === 'fulfilled') processed++; else failed++;
      });

      if (maxRows && processed >= maxRows) break;
    }

    // Brief delay to avoid rate limits
    await new Promise((res) => setTimeout(res, 300));
  }

  const summary: BackfillResult = { scanned, processed, failed, pages, lastRowCreatedAt: lastCreatedAt };
  console.log('🏁 Embedding backfill complete', summary);
  return summary;
}
