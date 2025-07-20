#!/bin/bash

# Test script for verify-subscription operation
echo "🧪 Testing Verify-Subscription Operation"
echo "========================================"

# Test data
SUBSCRIPTION_ID="test-subscription-id"
TOKEN="test-token"
ORIGIN="https://anima-bay.vercel.app"

# Valid test JWT (should work for basic auth but fail on subscription lookup)
AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IlNuaGl0VW1nL1p3NGlOVGYiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3NjYwMDQwLCJpYXQiOjE3Mzc2NTY0NDAsImlzcyI6Imh0dHBzOi8vcmNscHlpcGV5dHFiYW1pd2N1aWguc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnt9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzM3NjU2NDQwfV0sInNlc3Npb25faWQiOiJiNzZiNjI2My1hMGM0LTRhODMtODc3OC1lNmY4NmM1NzUzNjEiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.dT_OKVJLTFELu8oXgGOgLcMvWfEd9x7_rnqe7zYOE8s"

echo "1. Testing NEW paypal-management function (verify-subscription with subscription ID)..."
echo "--------------------------------------------------------------------------------"

RESULT1=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/paypal-management" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{
    "operation": "verify-subscription",
    "subscriptionId": "'"$SUBSCRIPTION_ID"'"
  }')

echo "NEW FUNCTION RESPONSE (with subscriptionId):"
echo "$RESULT1" | jq . 2>/dev/null || echo "$RESULT1"
echo -e "\n"

echo "2. Testing NEW paypal-management function (verify-subscription with token fallback)..."
echo "-----------------------------------------------------------------------------------"

RESULT2=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/paypal-management" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{
    "operation": "verify-subscription",
    "token": "'"$TOKEN"'"
  }')

echo "NEW FUNCTION RESPONSE (with token):"
echo "$RESULT2" | jq . 2>/dev/null || echo "$RESULT2"
echo -e "\n"

echo "3. Testing original verify-paypal-subscription function for comparison..."
echo "-----------------------------------------------------------------------"

RESULT3=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/verify-paypal-subscription" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{
    "subscriptionId": "'"$SUBSCRIPTION_ID"'",
    "token": "'"$TOKEN"'"
  }')

echo "ORIGINAL FUNCTION RESPONSE:"
echo "$RESULT3" | jq . 2>/dev/null || echo "$RESULT3"
echo -e "\n"

echo "4. Testing missing parameters validation..."
echo "------------------------------------------"

RESULT4=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/paypal-management" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "verify-subscription"
  }')

echo "MISSING PARAMETERS RESPONSE:"
echo "$RESULT4" | jq . 2>/dev/null || echo "$RESULT4"
echo -e "\n"

echo "✅ Test completed!"
echo ""
echo "🔍 ANALYSIS:"
echo "Expected Results:"
echo "- Test 1 & 2: Should fail with PayPal API authentication errors (expected with test data)"
echo "- Test 3: Original function should have similar error pattern"  
echo "- Test 4: Should fail with 'Either subscription ID or PayPal token is required'"
echo "- All responses should follow similar structure, showing consolidation works"
