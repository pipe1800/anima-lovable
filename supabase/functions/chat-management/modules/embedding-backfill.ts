import type { SupabaseClient } from '../types/streaming-interfaces.ts';
import { getTextEmbedding } from './embeddings.ts';
import { normalizeContentForHash } from './memory-utils.ts';
import { updateEntryEmbedding } from './knowledge.ts';

export type BackfillOptions = {
  batchSize?: number;
  concurrency?: number;
  maxRows?: number;
  dryRun?: boolean;
};

export type BackfillResult = {
  scanned: number;
  processed: number;
  failed: number;
  pages: number;
  lastRowCreatedAt?: string;
};

const NEEDS_EMBEDDING_FILTER = 'embedding_status.eq.pending,embedding_status.eq.failed,embedding_status.is.null';
const TARGET_ENTRY_TYPES = ['summary', 'memory'];

interface KnowledgeEntryRow {
  id: string;
  content: string | null;
  created_at: string;
  entry_type: string;
  embedding_status?: string | null;
}

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

  console.log('embedding.backfill.start', { batchSize, concurrency, maxRows, dryRun });

  while (true) {
    if (maxRows && processed >= maxRows) break;

    const { data: rows, error } = await supabase
      .from<KnowledgeEntryRow>('knowledge_entries')
      .select('id, content, created_at, entry_type, embedding_status')
      .in('entry_type', TARGET_ENTRY_TYPES)
      .or(NEEDS_EMBEDDING_FILTER)
      .order('created_at', { ascending: true })
      .limit(batchSize);

    if (error) {
      console.error('embedding.backfill.queryError', error);
      break;
    }

    const list = rows || [];
    if (list.length === 0) {
      console.log('embedding.backfill.nonePending');
      break;
    }

    pages++;
    scanned += list.length;
    const tail = list[list.length - 1];
    lastCreatedAt = tail?.created_at ?? undefined;

    console.log('embedding.backfill.page', { page: pages, count: list.length });

    for (let i = 0; i < list.length; i += concurrency) {
      const slice = list.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        slice.map(async (row) => {
          const entryId = String(row.id);
          try {
            if (dryRun) return 'dryRun';
            const text = normalizeContentForHash(row.content ?? '');
            if (!text || text.length === 0) {
              console.warn('embedding.backfill.skipEmpty', entryId);
              return 'skipped';
            }
            const vec = await getTextEmbedding(text);
            if (!vec || !Array.isArray(vec)) {
              throw new Error('No embedding returned');
            }
            await updateEntryEmbedding(supabase, {
              entryId,
              content: text,
              embeddingVector: vec
            });
            return 'ok';
          } catch (e) {
            console.warn('embedding.backfill.entryFailed', { entryId, error: e });
            throw e;
          }
        })
      );

      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value !== 'skipped') {
          processed++;
        } else if (r.status === 'rejected') {
          failed++;
        }
      });

      if (maxRows && processed >= maxRows) break;
    }

    await new Promise((res) => setTimeout(res, 300));
  }

  const summary: BackfillResult = { scanned, processed, failed, pages, lastRowCreatedAt: lastCreatedAt };
  console.log('embedding.backfill.complete', summary);
  return summary;
}
