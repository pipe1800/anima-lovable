#!/bin/bash

# Test Create Subscription Operation with Real Plan ID
echo "🧪 Testing Create Subscription with Real Plan ID"
echo "=============================================="

# Configuration
SUPABASE_URL="https://rclpyipeytqbamiwcuih.supabase.co"
FUNCTION_URL="$SUPABASE_URL/functions/v1/paypal-management"

# Test JWT token (replace with a real one for actual testing)
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzM3Mzg5MjA4LCJpYXQiOjE3MzczODU2MDgsImlzcyI6Imh0dHBzOi8vcmNscHlpcGV5dHFiYW1pd2N1aWguc3VwYWJhc2UuY28vYXV0aC92MSIsInN1YiI6IjlhYzM3OGYyLTBiOTktNGI0My1iNmRmLTEzOGFlODIyZjY3YSIsImVtYWlsIjoiY3VzdG9tZXJAZXhhbXBsZS5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7fSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTczNzM4NTYwOH1dLCJzZXNzaW9uX2lkIjoiYzEyZmU5NGYtODJkNS00YmU5LWFjNzktNzY3ZGUwODFmNmUwIn0.invalid_signature_for_testing"

echo "Testing CREATE SUBSCRIPTION with different plan IDs..."
echo ""

# Test with common plan ID patterns
for PLAN_ID in "plan_true_fan" "true_fan" "1" "2" "plan_whale" "the_whale"; do
  echo "🔍 Testing with planId: $PLAN_ID"
  
  RESPONSE=$(curl -s -X POST "$FUNCTION_URL" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -d "{
      \"operation\": \"create-subscription\",
      \"planId\": \"$PLAN_ID\"
    }")
  
  echo "📥 Response: $RESPONSE"
  echo ""
done

echo "✅ Test completed. Check responses for plan lookup issues."
