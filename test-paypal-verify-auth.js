// Test script with a valid auth token to test actual PayPal verification
const SUPABASE_URL = 'https://rclpyipeytqbamiwcuih.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJjbHB5aXBleXRxYmFtaXdjdWloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NDk4NDMsImV4cCI6MjA2NjMyNTg0M30.Q9E4JFI6QV5TjJNfFhp1RVCL3GVR6fL4rIEfKCHfqIA';
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/paypal-management`;

async function testWithValidAuth() {
  try {
    console.log('Testing PayPal verification with anon key...');
    
    const response = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'apikey': SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        operation: 'verify-subscription',
        subscriptionId: 'test-id'
      })
    });
    
    console.log('Response status:', response.status);
    const responseText = await response.text();
    console.log('Response body:', responseText);
    
  } catch (error) {
    console.error('❌ Network error:', error.message);
  }
}

testWithValidAuth();
