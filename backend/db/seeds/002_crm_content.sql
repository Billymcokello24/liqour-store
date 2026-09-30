INSERT INTO settings (key, value) VALUES
  ('business', '{"name": "Henry''s Liquor Hub", "tagline": "Good drinks, better occasions.", "currency": "KES", "legalAge": 18}'::jsonb),
  ('contact', '{"phone": "+254 700 000 100", "email": "hello@henrysliquorhub.ke", "whatsapp": "+254 700 000 100", "address": "Riverside Drive, Nairobi", "mapUrl": ""}'::jsonb),
  ('delivery', '{"zones": ["Nairobi CBD", "Westlands", "Kilimani", "Karen", "Lavington"], "feeKes": 300, "freeAboveKes": 5000, "sameDayCutoff": "16:00"}'::jsonb),
  ('hours', '{"weekday": "09:00 - 22:00", "weekend": "10:00 - 20:00"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

INSERT INTO promotions (name, discount_type, discount_value, starts_at, ends_at, minimum_order_kes, usage_limit, status)
VALUES ('Welcome WELCOME10', 'percentage', 10, now() - interval '1 day', now() + interval '90 days', 5000, 500, 'active')
RETURNING id;

INSERT INTO coupons (code, promotion_id)
SELECT 'WELCOME10', id FROM promotions WHERE name = 'Welcome WELCOME10'
ON CONFLICT (code) DO NOTHING;

INSERT INTO collections (name, slug, description, sort_order, status)
VALUES
  ('Premium Collection', 'premium', 'Our finest rare bottles, curated by the Henry''s cellar team.', 1, 'active'),
  ('Party Selection', 'party', 'Champagne, gin and mixers ready for celebration.', 2, 'active'),
  ('Gift Edit', 'gift-edit', 'Thoughtfully packaged bottles and sets for every occasion.', 3, 'active')
ON CONFLICT (slug) DO NOTHING;

INSERT INTO collection_items (collection_id, product_id, sort_order)
SELECT c.id, p.id, row_number() OVER (ORDER BY p.name) - 1
FROM collections c
JOIN categories cat ON cat.slug = CASE c.slug
    WHEN 'premium' THEN 'whisky'
    WHEN 'party' THEN 'gin'
    WHEN 'gift-edit' THEN 'wine' END
JOIN products p ON p.category_id = cat.id AND p.status = 'active' AND p.deleted_at IS NULL
WHERE NOT EXISTS (SELECT 1 FROM collection_items ci WHERE ci.collection_id = c.id)
ON CONFLICT DO NOTHING;

INSERT INTO banners (heading, body, cta_label, cta_url, desktop_image_url, is_active, sort_order)
VALUES (
  'Cellar-clear savings on selected single malts',
  'Up to 15% off premium whisky this month. While stock lasts.',
  'Shop offers', '/offers',
  'https://images.unsplash.com/photo-1582819509237-d5b75f20ff7a?auto=format&fit=crop&w=1800&q=88',
  true, 1
);
