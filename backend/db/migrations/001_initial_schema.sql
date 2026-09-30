CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('super_admin', 'manager', 'sales', 'inventory', 'delivery', 'support', 'customer');
CREATE TYPE record_status AS ENUM ('draft', 'active', 'disabled', 'archived');
CREATE TYPE order_status AS ENUM ('pending_payment', 'payment_confirmed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'refunded');
CREATE TYPE payment_status AS ENUM ('pending', 'processing', 'successful', 'failed', 'cancelled', 'refunded');
CREATE TYPE booking_status AS ENUM ('new', 'contacted', 'quoted', 'confirmed', 'processing', 'completed', 'cancelled');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash text NOT NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  phone text,
  role user_role NOT NULL DEFAULT 'customer',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  status record_status NOT NULL DEFAULT 'active',
  seo_title text,
  seo_description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE brands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  logo_url text,
  image_url text,
  status record_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id uuid NOT NULL REFERENCES brands(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  short_description text,
  country_of_origin text,
  alcohol_percentage numeric(5,2),
  status record_status NOT NULL DEFAULT 'draft',
  featured boolean NOT NULL DEFAULT false,
  new_arrival boolean NOT NULL DEFAULT false,
  best_seller boolean NOT NULL DEFAULT false,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku text NOT NULL UNIQUE,
  barcode text,
  volume_ml integer NOT NULL CHECK (volume_ml > 0),
  price_kes integer NOT NULL CHECK (price_kes >= 0),
  compare_at_price_kes integer CHECK (compare_at_price_kes >= price_kes),
  cost_price_kes integer CHECK (cost_price_kes >= 0),
  stock_on_hand integer NOT NULL DEFAULT 0 CHECK (stock_on_hand >= 0),
  reserved_stock integer NOT NULL DEFAULT 0 CHECK (reserved_stock >= 0 AND reserved_stock <= stock_on_hand),
  reorder_level integer NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size integer NOT NULL CHECK (byte_size > 0 AND byte_size <= 8388608),
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  alt_text text,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE product_images (
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id uuid NOT NULL REFERENCES media_assets(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  PRIMARY KEY (product_id, media_id)
);
CREATE UNIQUE INDEX one_primary_image_per_product ON product_images(product_id) WHERE is_primary;

CREATE TABLE inventory_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id uuid NOT NULL REFERENCES product_variants(id),
  change_quantity integer NOT NULL,
  reason text NOT NULL CHECK (reason IN ('stock_in', 'stock_out', 'adjustment', 'damage', 'return', 'correction', 'order_reservation', 'order_release')),
  reference_type text,
  reference_id uuid,
  notes text,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE delivery_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  fee_kes integer NOT NULL CHECK (fee_kes >= 0),
  minimum_order_kes integer NOT NULL DEFAULT 0 CHECK (minimum_order_kes >= 0),
  estimated_minutes integer NOT NULL CHECK (estimated_minutes > 0),
  operating_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  recipient_name text NOT NULL,
  phone text NOT NULL,
  address_line_1 text NOT NULL,
  address_line_2 text,
  zone_id uuid REFERENCES delivery_zones(id),
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number text NOT NULL UNIQUE,
  customer_id uuid NOT NULL REFERENCES users(id),
  status order_status NOT NULL DEFAULT 'pending_payment',
  payment_status payment_status NOT NULL DEFAULT 'pending',
  payment_method text NOT NULL,
  delivery_type text NOT NULL CHECK (delivery_type IN ('delivery', 'pickup')),
  delivery_address jsonb,
  subtotal_kes integer NOT NULL CHECK (subtotal_kes >= 0),
  discount_kes integer NOT NULL DEFAULT 0 CHECK (discount_kes >= 0),
  delivery_fee_kes integer NOT NULL DEFAULT 0 CHECK (delivery_fee_kes >= 0),
  total_kes integer NOT NULL CHECK (total_kes >= 0),
  customer_note text,
  placed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  product_variant_id uuid REFERENCES product_variants(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_kes integer NOT NULL CHECK (unit_price_kes >= 0),
  product_snapshot jsonb NOT NULL,
  image_snapshot_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payment_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_reference text UNIQUE,
  status payment_status NOT NULL DEFAULT 'pending',
  amount_kes integer NOT NULL CHECK (amount_kes >= 0),
  provider_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_number text NOT NULL UNIQUE,
  customer_id uuid REFERENCES users(id),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  event_type text NOT NULL,
  event_date date NOT NULL,
  guest_count integer NOT NULL CHECK (guest_count > 0),
  budget_kes integer CHECK (budget_kes >= 0),
  location text NOT NULL,
  notes text,
  status booking_status NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed', 'free_delivery')),
  discount_value integer NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  minimum_order_kes integer NOT NULL DEFAULT 0,
  usage_limit integer,
  status record_status NOT NULL DEFAULT 'draft'
);

CREATE TABLE coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  promotion_id uuid NOT NULL REFERENCES promotions(id),
  usage_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES users(id),
  rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL CHECK (char_length(body) BETWEEN 5 AND 2000),
  is_verified_purchase boolean NOT NULL DEFAULT false,
  status record_status NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, customer_id)
);

CREATE TABLE wishlist_items (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE cms_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  status record_status NOT NULL DEFAULT 'draft',
  seo_title text,
  seo_description text,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  channel text NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'in_app')),
  template_key text NOT NULL,
  payload jsonb NOT NULL,
  provider_reference text,
  sent_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id uuid,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_catalogue_idx ON products(category_id, brand_id, status) WHERE deleted_at IS NULL;
CREATE INDEX variants_stock_idx ON product_variants(stock_on_hand, reorder_level);
CREATE INDEX orders_customer_idx ON orders(customer_id, placed_at DESC);
CREATE INDEX bookings_status_idx ON bookings(status, event_date);
