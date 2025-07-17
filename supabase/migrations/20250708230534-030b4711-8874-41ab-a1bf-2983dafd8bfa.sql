-- Create public_app_settings table for storing publicly accessible configuration
CREATE TABLE public.public_app_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.public_app_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow public read access
CREATE POLICY "Public app settings are publicly readable" 
ON public.public_app_settings 
FOR SELECT 
USING (true);

-- Insert PayPal Client ID setting
INSERT INTO public.public_app_settings (setting_key, setting_value) 
VALUES ('PAYPAL_CLIENT_ID', 'Ae1k_GWddCY79FRV4OWluA_7XyNl0uGN9dgwtmK8uXZdZaE8iNG9iLlY_iUUxUHr2OeblEeiGpBCezDN');