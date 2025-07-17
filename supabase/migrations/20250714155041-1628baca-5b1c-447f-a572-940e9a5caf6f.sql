-- Update handle_new_user function to remove Guest Pass subscription creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)));
  
  -- Insert credits with 1000 initial balance (no subscription needed)
  INSERT INTO public.credits (user_id, balance)
  VALUES (NEW.id, 1000);

  -- No longer create Guest Pass subscription - users start with no subscription
  
  RETURN NEW;
END;
$function$;

-- Update add_monthly_credits function to handle users without subscriptions
CREATE OR REPLACE FUNCTION public.add_monthly_credits()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Add monthly credits to users with active subscriptions (accumulative)
  UPDATE public.credits 
  SET balance = balance + plans.monthly_credits_allowance
  FROM public.subscriptions 
  JOIN public.plans ON subscriptions.plan_id = plans.id
  WHERE credits.user_id = subscriptions.user_id 
    AND subscriptions.status = 'active'
    AND subscriptions.current_period_end > NOW();
    
  -- Reset credits to 1000 for users with NO active subscriptions (Guest Pass - non-accumulative)
  UPDATE public.credits
  SET balance = 1000
  WHERE user_id NOT IN (
    SELECT user_id 
    FROM public.subscriptions 
    WHERE status = 'active' 
    AND current_period_end > NOW()
  );
  
  -- Update subscription period end dates for active subscriptions
  UPDATE public.subscriptions 
  SET current_period_end = current_period_end + INTERVAL '1 month'
  WHERE status = 'active' 
    AND current_period_end <= NOW();
END;
$function$;