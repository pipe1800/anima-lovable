import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE'
};
serve(async (req)=>{
  console.log('Test function called with method:', req.method);
  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request');
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    console.log('Processing POST request');
    const body = await req.json();
    console.log('Request body:', body);
    return new Response(JSON.stringify({
      success: true,
      message: 'Test function working',
      receivedData: body
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 200
    });
  } catch (error) {
    console.error('Error in test function:', error);
    return new Response(JSON.stringify({
      error: error.message,
      success: false
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      },
      status: 500
    });
  }
});
