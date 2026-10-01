-- Per-item delivery decisions on dispatch: which bottles are going out and which are unavailable.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilment text NOT NULL DEFAULT 'pending';

UPDATE order_items SET fulfilment = 'delivering' WHERE fulfilment = 'pending';
