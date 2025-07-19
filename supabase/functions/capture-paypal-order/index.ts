import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
async function getPayPalAccessToken() {
  const clientId = Deno.env.get('PAYPAL_CLIENT_ID');
  const clientSecret = Deno.env.get('PAYPAL_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('PayPal credentials not configured');
  }
  const auth = btoa(`${clientId}:${clientSecret}`);
  const response = await fetch('https://api-m.paypal.com/v1/oauth2/token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  if (!response.ok) {
    console.error('PayPal token request failed:', await response.text());
    throw new Error('Failed to get PayPal access token');
  }
  const data = await response.json();
  return data.access_token;
}
async function capturePayPalOrder(accessToken, orderID) {
  const response = await fetch(`https://api-m.paypal.com/v2/checkout/orders/${orderID}/capture`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    console.error('PayPal order capture failed:', await response.text());
    throw new Error('Failed to capture PayPal order');
  }
  return await response.json();
}
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client
    const supabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: {
        headers: {
          Authorization: req.headers.get('Authorization')
        }
      }
    });
    // Get user from JWT
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Authentication failed:', authError);
      return new Response(JSON.stringify({
        error: 'Unauthorized'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { orderID, creditPackId } = await req.json();
    if (!orderID || !creditPackId) {
      return new Response(JSON.stringify({
        error: 'orderID and creditPackId are required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Look up credit pack details
    const { data: creditPack, error: packError } = await supabaseClient.from('credit_packs').select('name, price, credits_granted, is_active').eq('id', creditPackId).eq('is_active', true).single();
    if (packError || !creditPack) {
      console.error('Credit pack lookup failed:', packError);
      return new Response(JSON.stringify({
        error: 'Credit pack not found'
      }), {
        status: 404,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Get PayPal access token
    const accessToken = await getPayPalAccessToken();
    // Capture the PayPal order
    const captureResult = await capturePayPalOrder(accessToken, orderID);
    // Verify the capture was successful
    if (captureResult.status !== 'COMPLETED') {
      console.error('PayPal capture not completed:', captureResult.status);
      return new Response(JSON.stringify({
        error: 'Payment capture failed'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Verify at least one capture is completed
    const hasCompletedCapture = captureResult.purchase_units.some((unit)=>unit.payments.captures.some((capture)=>capture.status === 'COMPLETED'));
    if (!hasCompletedCapture) {
      console.error('No completed captures found in PayPal response');
      return new Response(JSON.stringify({
        error: 'Payment verification failed'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Start background task for database operations
    const backgroundTask = async ()=>{
      try {
        // Use service role for background operations
        const supabaseService = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
        // Record the purchase
        const { error: purchaseError } = await supabaseService.from('credit_pack_purchases').insert({
          user_id: user.id,
          credit_pack_id: creditPackId,
          amount_paid: parseFloat(creditPack.price.toString()),
          credits_granted: creditPack.credits_granted,
          paypal_order_id: orderID,
          status: 'completed'
        });
        if (purchaseError) {
          console.error('Failed to record purchase:', purchaseError);
          return;
        }
        // Grant credits to user
        const { data: currentCredits, error: creditsError } = await supabaseService.from('credits').select('balance').eq('user_id', user.id).single();
        if (creditsError) {
          console.error('Failed to fetch current credits:', creditsError);
          return;
        }
        const newBalance = currentCredits.balance + creditPack.credits_granted;
        const { error: updateError } = await supabaseService.from('credits').update({
          balance: newBalance
        }).eq('user_id', user.id);
        if (updateError) {
          console.error('Failed to update credits:', updateError);
          return;
        }
        console.log(`Successfully granted ${creditPack.credits_granted} credits to user ${user.id}`);
      } catch (error) {
        console.error('Background task error:', error);
      }
    };
    // Start background task without awaiting
    EdgeRuntime.waitUntil(backgroundTask());
    console.log('PayPal order captured successfully:', orderID);
    // Return success response immediately
    return new Response(JSON.stringify({
      success: true,
      orderID: captureResult.id,
      status: captureResult.status,
      creditsGranted: creditPack.credits_granted
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error capturing PayPal order:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error'
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
