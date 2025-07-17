-- Update Guest Pass plan to have 1000 monthly credits
UPDATE public.plans 
SET monthly_credits_allowance = 1000 
WHERE name = 'Guest Pass';

-- Modify handle_new_user function to assign Guest Pass and give 1000 credits
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  guest_pass_plan_id uuid;
BEGIN
  -- Get Guest Pass plan ID
  SELECT id INTO guest_pass_plan_id 
  FROM public.plans 
  WHERE name = 'Guest Pass' 
  LIMIT 1;

  -- Insert profile
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)));
  
  -- Insert credits with 1000 initial balance
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 1000);

  -- Create subscription to Guest Pass plan
  IF guest_pass_plan_id IS NOT NULL THEN
    INSERT INTO public.subscriptions (user_id, plan_id, status, current_period_end)
    VALUES (NEW.id, guest_pass_plan_id, 'active', (NOW() + INTERVAL '1 month'));
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create function to consume credits when sending messages
CREATE OR REPLACE FUNCTION public.consume_credits(user_id_param uuid, credits_to_consume integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_balance integer;
BEGIN
  -- Get current balance
  SELECT balance INTO current_balance 
  FROM public.credits 
  WHERE user_id = user_id_param;
  
  -- Check if user has enough credits
  IF current_balance >= credits_to_consume THEN
    -- Deduct credits
    UPDATE public.credits 
    SET balance = balance - credits_to_consume 
    WHERE user_id = user_id_param;
    
    RETURN true;
  ELSE
    RETURN false;
  END IF;
END;
$$;

-- Create function to add monthly credits (accumulative)
CREATE OR REPLACE FUNCTION public.add_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Add monthly credits to all active subscriptions
  UPDATE public.credits 
  SET balance = balance + plans.monthly_credits_allowance
  FROM public.subscriptions 
  JOIN public.plans ON subscriptions.plan_id = plans.id
  WHERE credits.user_id = subscriptions.user_id 
    AND subscriptions.status = 'active'
    AND subscriptions.current_period_end > NOW();
    
  -- Update subscription period end dates
  UPDATE public.subscriptions 
  SET current_period_end = current_period_end + INTERVAL '1 month'
  WHERE status = 'active' 
    AND current_period_end <= NOW();
END;
$$;