import type { PostgrestSingleResponse, SupabaseClient } from '@supabase/supabase-js';

import type { Database, Json } from '@/integrations/supabase/types';

export type SupabaseDatabaseClient = SupabaseClient<Database, '__InternalSupabase'>;

export type SupabaseSchemaClient = SupabaseClient<Database, '__InternalSupabase'>;

export type RpcArgs = Record<string, Json> | undefined;

export const getSchemaClient = (
  client: SupabaseDatabaseClient,
  schema: string,
): SupabaseSchemaClient =>
  (client as unknown as { schema(schema: string): SupabaseSchemaClient }).schema(schema);

export const callRpc = async <TReturn>(
  client: SupabaseDatabaseClient,
  fn: string,
  args?: RpcArgs,
): Promise<PostgrestSingleResponse<TReturn>> =>
  (client.rpc as unknown as (fn: string, args?: RpcArgs) => Promise<PostgrestSingleResponse<TReturn>>)(fn, args);
