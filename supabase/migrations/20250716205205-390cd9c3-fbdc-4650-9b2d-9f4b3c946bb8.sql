-- First, let's get the Guest Pass plan ID
DO $$
DECLARE 
    guest_pass_plan_id uuid;
BEGIN
    -- Get the Guest Pass plan ID
    SELECT id INTO guest_pass_plan_id FROM plans WHERE name = 'Guest Pass' LIMIT 1;
    
    -- If no Guest Pass plan exists, create it
    IF guest_pass_plan_id IS NULL THEN
        INSERT INTO plans (name, price_monthly, monthly_credits_allowance, features, is_active)
        VALUES ('Guest Pass', 0, 1000, '{"basic_chat": true}', true)
        RETURNING id INTO guest_pass_plan_id;
    END IF;
    
    -- Update handle_new_user function to create Guest Pass subscription
    EXECUTE format('
        CREATE OR REPLACE FUNCTION public.handle_new_user()
        RETURNS trigger
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $function$
        BEGIN
          -- Insert profile
          INSERT INTO public.profiles (id, username)
          VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>''username'', ''user_'' || substr(NEW.id::text, 1, 8)));
          
          -- Insert credits with 1000 initial balance
          INSERT INTO public.credits (user_id, balance)
          VALUES (NEW.id, 1000);

          -- Create Guest Pass subscription for new users
          INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
          VALUES (NEW.id, ''%s'', ''active'', NOW() + INTERVAL ''1 year'');
          
          RETURN NEW;
        END;
        $function$;', guest_pass_plan_id);
    
    -- Backfill existing users who have no subscription with Guest Pass
    EXECUTE format('
        INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
        SELECT 
            c.user_id,
            ''%s'',
            ''active'',
            NOW() + INTERVAL ''1 year''
        FROM public.credits c
        WHERE c.user_id NOT IN (
            SELECT user_id FROM public.subscriptions
        );', guest_pass_plan_id);
END $$;

-- Update add_monthly_credits function to handle all users having subscriptions
CREATE OR REPLACE FUNCTION public.add_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Handle Guest Pass users (reset to 1000 - non-accumulative)
  UPDATE public.credits 
  SET balance = 1000
  FROM public.subscriptions 
  JOIN public.plans ON subscriptions.plan_id = plans.id
  WHERE credits.user_id = subscriptions.user_id 
    AND subscriptions.status = 'active'
    AND subscriptions.current_period_end > NOW()
    AND plans.name = 'Guest Pass';
    
  -- Handle paid subscription users (accumulative)
  UPDATE public.credits 
  SET balance = balance + plans.monthly_credits_allowance
  FROM public.subscriptions 
  JOIN public.plans ON subscriptions.plan_id = plans.id
  WHERE credits.user_id = subscriptions.user_id 
    AND subscriptions.status = 'active'
    AND subscriptions.current_period_end > NOW()
    AND plans.name != 'Guest Pass';
  
  -- Update subscription period end dates for active subscriptions
  UPDATE public.subscriptions 
  SET current_period_end = current_period_end + INTERVAL '1 month'
  WHERE status = 'active' 
    AND current_period_end <= NOW();
END;
$function$;