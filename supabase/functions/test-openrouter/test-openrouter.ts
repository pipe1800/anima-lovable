import "https://deno.land/x/xhr@0.1.0/mod.ts";

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

  console.log('🧪 Testing OpenRouter API with google/gemma-7b-it model');

  try {
    // Get OpenRouter API key
    const openRouterKey = Deno.env.get('OPENROUTER_API_KEY');
    if (!openRouterKey) {
      return new Response(JSON.stringify({ 
        error: 'OpenRouter API key not configured',
        success: false 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Test message - same structure as chat-stream
    const testMessages = [
      { 
        role: 'system', 
        content: 'You are a helpful assistant. Respond with a simple greeting.' 
      },
      { 
        role: 'user', 
        content: 'Hello! Can you hear me?' 
      }
    ];

    console.log('🚀 Making OpenRouter API call...');

    // Make the exact same API call as chat-stream function
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openRouterKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': Deno.env.get('SITE_URL') || 'https://yourapp.com',
        'X-Title': 'AnimaChat-Test'
      },
      body: JSON.stringify({
        model: 'google/gemma-7b-it',
        messages: testMessages,
        stream: false, // Non-streaming for easier testing
        temperature: 0.7,
        max_tokens: 100
      })
    });

    // Log response details
    console.log('📊 OpenRouter Response Status:', response.status);
    console.log('📊 OpenRouter Response Headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      // Get error details
      const errorText = await response.text();
      console.error('❌ OpenRouter API Error:', errorText);
      
      return new Response(JSON.stringify({
        success: false,
        error: 'OpenRouter API failed',
        status: response.status,
        statusText: response.statusText,
        responseBody: errorText,
        headers: Object.fromEntries(response.headers.entries())
      }), {
        status: 200, // Return 200 so we can see the error details
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Success - parse response
    const data = await response.json();
    console.log('✅ OpenRouter API Success:', data);

    return new Response(JSON.stringify({
      success: true,
      message: 'OpenRouter API working correctly',
      model: 'google/gemma-7b-it',
      response: data.choices?.[0]?.message?.content || 'No content returned',
      fullResponse: data
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('🔥 Test function error:', error);
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message,
      stack: error.stack,
      type: 'Test function error'
    }), {
      status: 200, // Return 200 so we can see the error details
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});