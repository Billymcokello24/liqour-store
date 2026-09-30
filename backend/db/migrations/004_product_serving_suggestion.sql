-- Product merchandising details: server-stored serving suggestion so the
-- storefront detail page shows real, editable copy instead of hardcoded text.
ALTER TABLE products ADD COLUMN IF NOT EXISTS serving_suggestion text;
