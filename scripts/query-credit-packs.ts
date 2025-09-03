import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_ANON_KEY in environment');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryCreditPacks() {
  console.log('Querying credit_packs table...');
  const { data, error } = await supabase
    .from('credit_packs')
    .select('id, name, price, credits_granted, is_active')
    .order('created_at');
  if (error) {
    console.error('Error:', error.message);
    process.exitCode = 1;
  } else {
    console.table(data);
  }
}

queryCreditPacks();
