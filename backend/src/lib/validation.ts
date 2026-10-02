import { z } from "zod";

export const productInput = z.object({
  name: z.string().trim().min(2).max(180),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  brandId: z.string().uuid(),
  categoryId: z.string().uuid(),
  description: z.string().trim().max(8000).optional(),
  shortDescription: z.string().trim().max(300).optional(),
  countryOfOrigin: z.string().trim().max(120).optional(),
  alcoholPercentage: z.number().min(0).max(100).nullable().optional(),
  servingSuggestion: z.string().trim().max(500).optional(),
  status: z.enum(["draft", "active", "disabled"]).default("draft"),
  featured: z.boolean().default(false),
  imageAssetId: z.string().uuid().optional(),
  variants: z.array(z.object({
    sku: z.string().trim().max(80).optional(),
    volumeMl: z.number().int().positive(),
    price: z.number().int().nonnegative(),
    compareAtPrice: z.number().int().nonnegative().nullable().optional(),
    stock: z.number().int().nonnegative(),
    barcode: z.string().trim().max(80).optional(),
  })).min(1),
});

export const bookingInput = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(255),
  phone: z.string().trim().min(8).max(32),
  eventType: z.string().trim().min(2).max(80),
  eventDate: z.string().date(),
  guests: z.number().int().positive().max(100000),
  budget: z.number().int().nonnegative().optional(),
  location: z.string().trim().min(2).max(255),
  notes: z.string().trim().max(3000).optional(),
});

export const registrationInput = z.object({
  name: z.string().trim().min(2).max(160),
  email: z.string().email().max(255),
  phone: z.string().trim().min(8).max(32),
  password: z.string().min(12).max(128),
  confirmPassword: z.string().min(12).max(128),
  legalAgeConfirmed: z.literal(true),
  termsAccepted: z.literal(true),
  marketingConsent: z.boolean().optional().default(false),
}).refine((data) => data.password === data.confirmPassword, { message: "Passwords do not match.", path: ["confirmPassword"] });

export const orderInput = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().positive().max(99) })).min(1).max(50),
  paymentMethod: z.enum(["mpesa", "card", "bank", "cash"]),
  deliveryType: z.enum(["delivery", "pickup"]),
  deliveryAddress: z.record(z.string(), z.unknown()).optional(),
  customerNote: z.string().trim().max(1000).optional(),
  couponCode: z.string().trim().max(64).optional(),
});

export const bannerImageField = z
  .string()
  .trim()
  .min(1)
  .max(500)
  .regex(/^(\/|[a-z]+:\/\/)/i, "Image must be a full URL or a /uploads path.");

export const bannerPatch = z.object({
  heading: z.string().trim().min(2).max(180).optional(),
  body: z.string().trim().max(500).nullable().optional(),
  ctaLabel: z.string().trim().max(60).nullable().optional(),
  ctaUrl: z.string().trim().max(500).nullable().optional(),
  desktopImageUrl: bannerImageField.optional(),
  mobileImageUrl: bannerImageField.nullable().optional(),
  startsAt: z.string().datetime({ offset: true }).optional(),
  endsAt: z.string().datetime({ offset: true }).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
});

export const couponValidationInput = z.object({
  code: z.string().trim().min(3).max(64),
  subtotalKes: z.number().int().nonnegative(),
});

export const supportTicketInput = z.object({
  subject: z.string().trim().min(3).max(180),
  category: z.enum(["order", "delivery", "payment", "product", "account", "bulk_order", "other"]),
  message: z.string().trim().min(3).max(4000),
  orderNumber: z.string().trim().max(40).optional(),
});

export const supportReplyInput = z.object({
  body: z.string().trim().min(1).max(4000),
});

export const addressInput = z.object({
  label: z.string().trim().min(2).max(60),
  recipientName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(8).max(32),
  addressLine1: z.string().trim().min(4).max(240),
  addressLine2: z.string().trim().max(240).optional(),
  zoneId: z.string().uuid().nullable().optional(),
  isDefault: z.boolean().default(false),
});
