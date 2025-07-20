const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function queryCreditPacks() {
  console.log('Querying credit_packs table...');
  
  const { data, error } = await supabase
    .from('credit_packs')
    .select('id, name, price, credits_granted, is_active')
    .order('created_at');

  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Credit packs found:');
    console.table(data);
  }
}

queryCreditPacks();
