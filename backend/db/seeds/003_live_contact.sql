-- Contact directory shown on the Contact us page (managed via settings, upsert so the number can change).
INSERT INTO settings (key, value) VALUES
  ('contact', '{"phone": "+254111598990", "whatsapp": "+254111598990"}'::jsonb)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
