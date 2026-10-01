-- Per-item delivery decisions on dispatch: which bottles are going out and which are unavailable.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfilment text NOT NULL DEFAULT 'pending';

UPDATE order_items oi SET fulfilment = 'delivering'
FROM orders o
WHERE oi.order_id = o.id AND o.status = 'out_for_delivery';
