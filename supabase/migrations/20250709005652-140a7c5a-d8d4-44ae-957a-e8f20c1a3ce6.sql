-- Update 'The Whale' plan credit allowance to 32,000
UPDATE plans 
SET 
  monthly_credits_allowance = 32000,
  features = jsonb_set(
    COALESCE(features, '{}'),
    '{features}',
    (
      SELECT jsonb_agg(
        CASE 
          WHEN feature_text LIKE '%credits%' OR feature_text LIKE '%Credits%'
          THEN 'Up to 32,000 credits/month'
          ELSE feature_text
        END
      )
      FROM jsonb_array_elements_text(COALESCE(features->'features', '[]'::jsonb)) AS feature_text
    )
  )
WHERE name = 'The Whale';