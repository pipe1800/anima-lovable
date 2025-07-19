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
async function createPayPalOrder(accessToken, amount, description) {
  const orderData = {
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount: {
          currency_code: 'USD',
          value: amount
        },
        description: description
      }
    ]
  };
  const response = await fetch('https://api-m.paypal.com/v2/checkout/orders', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(orderData)
  });
  if (!response.ok) {
    console.error('PayPal order creation failed:', await response.text());
    throw new Error('Failed to create PayPal order');
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
    // Check if user has an active subscription
    const { data: subscription, error: subError } = await supabaseClient.from('subscriptions').select('status').eq('user_id', user.id).eq('status', 'active').maybeSingle();
    if (subError) {
      console.error('Subscription check failed:', subError);
      return new Response(JSON.stringify({
        error: 'Failed to verify subscription'
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    if (!subscription) {
      return new Response(JSON.stringify({
        error: 'Active subscription required'
      }), {
        status: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Parse request body
    const { creditPackId } = await req.json();
    if (!creditPackId) {
      return new Response(JSON.stringify({
        error: 'creditPackId is required'
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
    // Create PayPal order
    const paypalOrder = await createPayPalOrder(accessToken, creditPack.price.toString(), `${creditPack.name} - ${creditPack.credits_granted} credits`);
    console.log('PayPal order created successfully:', paypalOrder.id);
    // Return the order ID to the client
    return new Response(JSON.stringify({
      orderID: paypalOrder.id,
      amount: creditPack.price,
      description: creditPack.name
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error creating PayPal order:', error);
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
