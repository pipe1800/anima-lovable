import { createClient } from "https://esm.sh/@supabase/supabase-js@2.50.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log('🧹 Database cleanup function called');

  try {
    // Create Supabase admin client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // PHASE 3: DATABASE CLEANUP - Find and clean contaminated messages
    const { data: contaminatedMessages, error: fetchError } = await supabase
      .from('messages')
      .select('id, content, is_ai_message')
      .or('content.ilike.%[CONTEXT%,content.ilike.%"mood"%,content.ilike.%"location"%,content.ilike.%"clothing"%,content.ilike.%"time_weather"%,content.ilike.%"relationship"%,content.ilike.%"character_position"%')
      .eq('is_ai_message', true);

    if (fetchError) {
      console.error('❌ Error fetching contaminated messages:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch contaminated messages' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!contaminatedMessages || contaminatedMessages.length === 0) {
      console.log('✅ No contaminated messages found');
      return new Response(JSON.stringify({ 
        message: 'No contaminated messages found',
        cleaned: 0
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    console.log(`🔍 Found ${contaminatedMessages.length} contaminated messages to clean`);

    // Clean each contaminated message
    const cleanedMessages = [];
    for (const message of contaminatedMessages) {
      let cleanContent = message.content;
      
      // Apply comprehensive context stripping
      cleanContent = cleanContent
        // Layer 1: Remove complete context blocks
        .replace(/\[CONTEXT_DATA\][\s\S]*?\[\/CONTEXT_DATA\]/g, '')
        .replace(/\[CONTEXTDATA\][\s\S]*?\[\/CONTEXTDATA\]/g, '')
        // Layer 2: Remove incomplete context blocks
        .replace(/\[CONTEXT_DATA\][\s\S]*$/g, '')
        .replace(/\[CONTEXTDATA\][\s\S]*$/g, '')
        .replace(/^[\s\S]*?\[\/CONTEXT_DATA\]/g, '')
        .replace(/^[\s\S]*?\[\/CONTEXTDATA\]/g, '')
        // Layer 3: Remove JSON-like context structures
        .replace(/\{[\s\S]*"mood"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"location"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"clothing"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"time_weather"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"relationship"[\s\S]*\}/g, '')
        .replace(/\{[\s\S]*"character_position"[\s\S]*\}/g, '')
        // Layer 4: Remove any remaining JSON fragments
        .replace(/\{[\s\S]*$/g, '')
        .replace(/^[\s\S]*?\}/g, '')
        .replace(/"[a-z_]+"\s*:[\s\S]*$/g, '')
        .replace(/^\s*"[a-z_]+"\s*:[\s\S]*$/g, '')
        // Layer 5: Remove any remaining context artifacts
        .replace(/\[\/[A-Z_]+\][\s\S]*$/g, '')
        .replace(/^[\s\S]*?\[\/[A-Z_]+\]/g, '')
        .replace(/\[[A-Z_]+\][\s\S]*$/g, '')
        .trim();

      // Only update if content actually changed and is not empty
      if (cleanContent !== message.content && cleanContent.length > 0) {
        cleanedMessages.push({
          id: message.id,
          cleanContent: cleanContent,
          originalContent: message.content
        });
      }
    }

    console.log(`🧹 Cleaning ${cleanedMessages.length} messages`);

    // Update cleaned messages in database
    let successCount = 0;
    for (const cleanedMessage of cleanedMessages) {
      const { error: updateError } = await supabase
        .from('messages')
        .update({ content: cleanedMessage.cleanContent })
        .eq('id', cleanedMessage.id);

      if (updateError) {
        console.error(`❌ Error updating message ${cleanedMessage.id}:`, updateError);
      } else {
        successCount++;
        console.log(`✅ Cleaned message ${cleanedMessage.id}: "${cleanedMessage.originalContent.substring(0, 50)}..." -> "${cleanedMessage.cleanContent.substring(0, 50)}..."`);
      }
    }

    console.log(`✅ Successfully cleaned ${successCount} out of ${cleanedMessages.length} messages`);

    return new Response(JSON.stringify({ 
      message: `Successfully cleaned ${successCount} contaminated messages`,
      cleaned: successCount,
      total_found: contaminatedMessages.length
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Database cleanup error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});