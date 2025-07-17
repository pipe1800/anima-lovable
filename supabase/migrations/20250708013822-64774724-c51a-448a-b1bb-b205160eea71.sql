-- Clear existing tags and insert the new standardized tag list
DELETE FROM public.character_tags;
DELETE FROM public.tags;

-- Insert the new standardized tags
INSERT INTO public.tags (name) VALUES
  ('Action'),
  ('Adventure'),
  ('Anime'),
  ('Comedy'),
  ('Drama'),
  ('Fantasy'),
  ('Horror'),
  ('Mystery'),
  ('Romance'),
  ('Sci-Fi'),
  ('Slice of Life'),
  ('Thriller'),
  ('Animals'),
  ('Assistant'),
  ('Historical'),
  ('OC'),
  ('Games'),
  ('RPG'),
  ('Storytelling'),
  ('Female'),
  ('Furry'),
  ('Male'),
  ('Non-binary'),
  ('NSFW'),
  ('Multiple Character');