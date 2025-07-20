// Test script to check if the RLS policy fix worked
const SUPABASE_URL = 'https://rclpyipeytqbamiwcuih.supabase.co';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/paypal-management`;

async function testRLSFix() {
  try {
    console.log('Testing PayPal verification with invalid auth to check error type...');
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid-token'
      },
      body: JSON.stringify({
        operation: 'verify-subscription',
        subscriptionId: 'test-id'
      })
    });
    
    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
    if (response.status === 401) {
      console.log('✅ Getting 401 for invalid auth - function is working properly');
    } else if (response.status === 500) {
      console.log('❌ Still getting 500 error - may indicate other issues');
    }
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testRLSFix();
