INSERT INTO categories (id, name, slug, description, image_url, sort_order)
VALUES
  ('10000000-0000-4000-8000-000000000001', 'Whisky', 'whisky', 'Single malts, blends and bourbon.', 'https://images.unsplash.com/photo-1592620352607-53100d32f9fb?auto=format&fit=crop&w=720&q=85', 1),
  ('10000000-0000-4000-8000-000000000002', 'Wine', 'wine', 'Red, white, rose and sparkling wine.', 'https://images.unsplash.com/photo-1592361557476-5c9eea53b04a?auto=format&fit=crop&w=720&q=85', 2),
  ('10000000-0000-4000-8000-000000000003', 'Gin', 'gin', 'Botanical gins for every serve.', 'https://images.unsplash.com/photo-1541491263892-731bc0c6a2ae?auto=format&fit=crop&w=720&q=85', 3)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  image_url = EXCLUDED.image_url;

INSERT INTO brands (id, name, slug, description)
VALUES
  ('20000000-0000-4000-8000-000000000001', 'Johnnie Walker', 'johnnie-walker', 'Scottish blended whisky.'),
  ('20000000-0000-4000-8000-000000000002', 'Aesop Wines', 'aesop-wines', 'Curated estate wines.'),
  ('20000000-0000-4000-8000-000000000003', 'Botanical House', 'botanical-house', 'Small-batch botanical gin.')
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description;

INSERT INTO products (id, brand_id, category_id, name, slug, short_description, status, featured, new_arrival, best_seller)
VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'Black Label Reserve', 'black-label-reserve', 'A smooth, layered blended Scotch for sharing.', 'active', true, false, true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'Estate Red Blend', 'estate-red-blend', 'A generous red blend with dark berry and spice.', 'active', true, true, false),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', 'Premium Gin No. 4', 'premium-gin-no-4', 'Citrus-led botanical gin for a crisp G&T.', 'active', false, true, false)
ON CONFLICT (slug) DO UPDATE SET
  short_description = EXCLUDED.short_description,
  status = EXCLUDED.status,
  featured = EXCLUDED.featured,
  new_arrival = EXCLUDED.new_arrival,
  best_seller = EXCLUDED.best_seller;

INSERT INTO product_variants (id, product_id, sku, volume_ml, price_kes, compare_at_price_kes, stock_on_hand, reorder_level)
VALUES
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'HLH-JW-BLR-700', 700, 4500, 5000, 18, 5),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', 'HLH-AW-ERB-750', 750, 2800, NULL, 24, 5),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', 'HLH-BH-PGN-700', 700, 3950, NULL, 7, 3)
ON CONFLICT (sku) DO UPDATE SET
  price_kes = EXCLUDED.price_kes,
  compare_at_price_kes = EXCLUDED.compare_at_price_kes,
  stock_on_hand = EXCLUDED.stock_on_hand,
  reorder_level = EXCLUDED.reorder_level,
  is_active = true;

INSERT INTO media_assets (id, storage_key, public_url, mime_type, byte_size, width, height, alt_text)
VALUES
  ('50000000-0000-4000-8000-000000000001', 'development/black-label-reserve.jpg', 'https://images.unsplash.com/photo-1592620352607-53100d32f9fb?auto=format&fit=crop&w=720&q=85', 'image/jpeg', 120000, 720, 900, 'Black Label Reserve bottle'),
  ('50000000-0000-4000-8000-000000000002', 'development/estate-red-blend.jpg', 'https://images.unsplash.com/photo-1592361557476-5c9eea53b04a?auto=format&fit=crop&w=720&q=85', 'image/jpeg', 120000, 720, 900, 'Estate Red Blend bottle'),
  ('50000000-0000-4000-8000-000000000003', 'development/premium-gin-no-4.jpg', 'https://images.unsplash.com/photo-1541491263892-731bc0c6a2ae?auto=format&fit=crop&w=720&q=85', 'image/jpeg', 120000, 720, 900, 'Premium Gin No. 4 bottle')
ON CONFLICT (storage_key) DO UPDATE SET
  public_url = EXCLUDED.public_url,
  alt_text = EXCLUDED.alt_text;

INSERT INTO product_images (product_id, media_id, sort_order, is_primary)
VALUES
  ('30000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 0, true),
  ('30000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 0, true),
  ('30000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003', 0, true)
ON CONFLICT (product_id, media_id) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  is_primary = EXCLUDED.is_primary;
