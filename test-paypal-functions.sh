#!/bin/bash

# Test script for PayPal function consolidation
# This tests both the original function and new unified function

echo "🧪 Testing PayPal Function Consolidation"
echo "========================================"

# Test data - using a valid UUID format but non-existent plan
PLAN_ID="00000000-0000-0000-0000-000000000001"
ORIGIN="https://anima-bay.vercel.app"

# Valid test JWT (should work for basic auth but fail on plan lookup)
AUTH_TOKEN="eyJhbGciOiJIUzI1NiIsImtpZCI6IlNuaGl0VW1nL1p3NGlOVGYiLCJ0eXAiOiJKV1QifQ.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3NjYwMDQwLCJpYXQiOjE3Mzc2NTY0NDAsImlzcyI6Imh0dHBzOi8vcmNscHlpcGV5dHFiYW1pd2N1aWguc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMSIsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnt9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzM3NjU2NDQwfV0sInNlc3Npb25faWQiOiJiNzZiNjI2My1hMGM0LTRhODMtODc3OC1lNmY4NmM1NzUzNjEiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.dT_OKVJLTFELu8oXgGOgLcMvWfEd9x7_rnqe7zYOE8s"

echo "1. Testing NEW paypal-management function (create-subscription operation)..."
echo "-------------------------------------------------------------------"

RESULT1=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/paypal-management" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{
    "operation": "create-subscription",
    "planId": "'"$PLAN_ID"'"
  }')

echo "NEW FUNCTION RESPONSE:"
echo "$RESULT1" | jq . 2>/dev/null || echo "$RESULT1"
echo -e "\n"

echo "2. Testing original create-paypal-subscription function for comparison..."
echo "------------------------------------------------------------------------"

RESULT2=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/create-paypal-subscription" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: $ORIGIN" \
  -d '{
    "planId": "'"$PLAN_ID"'"
  }')

echo "ORIGINAL FUNCTION RESPONSE:"
echo "$RESULT2" | jq . 2>/dev/null || echo "$RESULT2"
echo -e "\n"

echo "3. Testing invalid operation to verify error handling..."
echo "-----------------------------------------------------"

RESULT3=$(curl -s -X POST "https://rclpyipeytqbamiwcuih.supabase.co/functions/v1/paypal-management" \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "invalid-operation"
  }')

echo "INVALID OPERATION RESPONSE:"
echo "$RESULT3" | jq . 2>/dev/null || echo "$RESULT3"
echo -e "\n"

echo "✅ Test completed!"
echo ""
echo "🔍 ANALYSIS:"
echo "Expected Results:"
echo "- Test 1 & 2: Both should fail with similar 'Plan not found' errors"
echo "- Test 3: Should fail with 'Unsupported PayPal operation' error"
echo "- All responses should have similar structure, showing consolidation works"
