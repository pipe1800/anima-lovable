// Test script to verify PayPal verification endpoint
const SUPABASE_URL = 'https://rclpyipeytqbamiwcuih.supabase.co';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/paypal-management`;

async function testVerifySubscription() {
  try {
    console.log('Testing PayPal verification endpoint...');
    
    // Test with minimal payload to see if function responds
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token' // Will fail auth but should get past operation check
      },
      body: JSON.stringify({
        operation: 'verify-subscription',
        subscriptionId: 'test-id'
      })
    });
    
    console.log('Response status:', response.status);
    console.log('Response headers:', Object.fromEntries(response.headers.entries()));
    
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.status === 500) {
      console.error('❌ 500 error confirmed - function is crashing');
    } else {
      console.log('✅ Function responded (may have auth error but not crashing)');
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testVerifySubscription();
