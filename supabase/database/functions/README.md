# RPC Functions

This directory contains all the RPC (Remote Procedure Call) functions for the billing system.

## Directory Structure

- `credits/` - Credits related functions
- `subscriptions/` - Subscriptions related functions
- `plans/` - Plans related functions
- `utils/` - Utils related functions

## Function Categories

### Credits (`credits/`)
Functions for managing user credit balances, adding/deducting credits, and viewing transaction history.

### Subscriptions (`subscriptions/`)
Functions for managing user subscriptions, plan changes, and subscription status.

### Plans (`plans/`)
Functions for retrieving available subscription plans.

### Purchases (`purchases/`)
Functions for managing credit pack purchases and purchase history.

### Utils (`utils/`)
Utility functions for user provisioning and other billing-related operations.

## Next Steps

1. Copy the actual function definitions from your Supabase dashboard
2. Replace the template comments with the real SQL code
3. Test each function to ensure it works correctly
4. Update your frontend code to use these RPC functions

## Getting Function Definitions

To get the actual function definitions from Supabase, run this query in the SQL Editor:

```sql
SELECT 
  p.proname as function_name,
  pg_get_functiondef(p.oid) as definition
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN ('get_user_credits', 'add_user_credits', 'deduct_user_credits', 'get_credit_history', 'get_user_subscription_with_plan', 'cancel_subscription', 'check_subscription_status', 'get_available_plans', 'get_user_credit_purchases', 'consume_credits', 'add_monthly_credits', 'provision_billing_on_signup')
  AND p.prokind = 'f'
ORDER BY p.proname;
```
