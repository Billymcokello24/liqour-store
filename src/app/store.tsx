import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"

export type Product = {
  id: string
  variantId?: string
  brandId?: string
  categoryId?: string
  description?: string | null
  shortDescription?: string | null
  countryOfOrigin?: string | null
  alcoholPercentage?: number | null
  servingSuggestion?: string | null
  volumeMl?: number
  sku?: string
  name: string
  brand: string
  category: string
  newArrival?: boolean
  volume: string
  price: number
  oldPrice?: number
  stock: number
  rating: number
  image: string
  tag?: string
  status?: "active" | "draft" | "disabled"
}

export type Order = {
  id: string
  adminId?: string
  items: CartItem[]
  total: number
  deliveryFee: number
  customer: {
    name: string
    phone: string
    email: string
    address: string
    area: string
  }
  payment: string
  status: "confirmed" | "preparing" | "out-for-delivery" | "delivered"
  createdAt: string
}

export const demoProducts: Product[] = [
  {
    id: "p1",
    name: "Black Label Reserve",
    brand: "Johnnie Walker",
    category: "Whisky",
    volume: "700ml",
    price: 4500,
    oldPrice: 5000,
    stock: 18,
    rating: 4.9,
    tag: "Best seller",
    image:
      "https://images.unsplash.com/photo-1592620352607-53100d32f9fb?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p2",
    name: "Small Batch Bourbon",
    brand: "Craft Reserve",
    category: "Whisky",
    volume: "750ml",
    price: 6200,
    stock: 9,
    rating: 4.8,
    tag: "Staff pick",
    image:
      "https://images.unsplash.com/photo-1601053397261-2552332609fc?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p3",
    name: "Estate Red Blend",
    brand: "Aesop Wines",
    category: "Wine",
    volume: "750ml",
    price: 2800,
    stock: 24,
    rating: 4.7,
    tag: "New",
    image:
      "https://images.unsplash.com/photo-1592361557476-5c9eea53b04a?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p4",
    name: "Vintage Rosé",
    brand: "Maison No. 7",
    category: "Wine",
    volume: "750ml",
    price: 3400,
    oldPrice: 3800,
    stock: 14,
    rating: 4.6,
    tag: "Save KES 400",
    image:
      "https://images.unsplash.com/photo-1592119748016-a61c40a44320?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p5",
    name: "Premium Gin No. 4",
    brand: "Botanical House",
    category: "Gin",
    volume: "700ml",
    price: 3950,
    stock: 7,
    rating: 4.8,
    tag: "Limited",
    image:
      "https://images.unsplash.com/photo-1541491263892-731bc0c6a2ae?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p6",
    name: "Cellar Selection",
    brand: "Henry's",
    category: "Cognac",
    volume: "700ml",
    price: 8900,
    stock: 5,
    rating: 5,
    tag: "Premium",
    image:
      "https://images.unsplash.com/photo-1697115355209-46e7bce340fb?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p7",
    name: "Celebration Brut",
    brand: "Champagne House",
    category: "Champagne",
    volume: "750ml",
    price: 7200,
    stock: 11,
    rating: 4.9,
    image:
      "https://images.unsplash.com/photo-1700893417207-99da24343476?auto=format&fit=crop&w=720&q=85",
  },
  {
    id: "p8",
    name: "Classic Tennessee",
    brand: "Old No. 7",
    category: "Whisky",
    volume: "1L",
    price: 5800,
    stock: 16,
    rating: 4.7,
    image:
      "https://images.unsplash.com/photo-1611864072666-06ddb3070b19?auto=format&fit=crop&w=720&q=85",
  },
]

export const demoOrders: Order[] = [
  {
    id: "HLH-2048",
    items: [],
    total: 12450,
    deliveryFee: 300,
    customer: {
      name: "Grace Wanjiku",
      phone: "+254 712 345 678",
      email: "grace.w@email.com",
      address: "14 Ngong Road, Karen",
      area: "Karen",
    },
    payment: "M-Pesa",
    status: "preparing",
    createdAt: "2026-09-29T09:15:00Z",
  },
  {
    id: "HLH-2047",
    items: [],
    total: 6800,
    deliveryFee: 0,
    customer: {
      name: "David Otieno",
      phone: "+254 722 987 654",
      email: "d.otieno@email.com",
      address: "Apartment 4B, Kilimani Court",
      area: "Kilimani",
    },
    payment: "Card",
    status: "confirmed",
    createdAt: "2026-09-29T08:44:00Z",
  },
  {
    id: "HLH-2046",
    items: [],
    total: 48200,
    deliveryFee: 0,
    customer: {
      name: "Amara Events",
      phone: "+254 733 112 233",
      email: "events@amara.co.ke",
      address: "Gigiri Convention Centre, Gigiri",
      area: "Gigiri",
    },
    payment: "Bank",
    status: "out-for-delivery",
    createdAt: "2026-09-28T16:30:00Z",
  },
  {
    id: "HLH-2045",
    items: [],
    total: 3950,
    deliveryFee: 300,
    customer: {
      name: "Brian Kamau",
      phone: "+254 700 556 677",
      email: "bk@mail.com",
      address: "Unity Homes, Ruaka",
      area: "Ruaka",
    },
    payment: "M-Pesa",
    status: "delivered",
    createdAt: "2026-09-28T11:10:00Z",
  },
  {
    id: "HLH-2044",
    items: [],
    total: 9600,
    deliveryFee: 0,
    customer: {
      name: "Sheila Mwamba",
      phone: "+254 711 884 220",
      email: "sheila@mwamba.co.ke",
      address: "Lavington Green, Lavington",
      area: "Lavington",
    },
    payment: "M-Pesa",
    status: "delivered",
    createdAt: "2026-09-27T14:55:00Z",
  },
  {
    id: "HLH-2043",
    items: [],
    total: 22100,
    deliveryFee: 0,
    customer: {
      name: "TechHub Kenya",
      phone: "+254 708 123 400",
      email: "procurement@techhubke.com",
      address: "Westlands Business Park",
      area: "Westlands",
    },
    payment: "Bank",
    status: "delivered",
    createdAt: "2026-09-27T10:20:00Z",
  },
]

type CartItem = Product & { quantity: number }
export type AppliedCoupon = {
  code: string
  name: string
  discountKes: number
  freeDelivery: boolean
}
type StoreValue = {
  products: Product[]
  catalogueLoading: boolean
  cart: CartItem[]
  cartCount: number
  cartTotal: number
  orders: Order[]
  lastOrder: Order | null
  coupon: AppliedCoupon | null
  applyCoupon: (code: string, subtotalKes: number) => Promise<{ ok: boolean; reason?: string }>
  clearCoupon: () => void
  addToCart: (product: Product) => void
  changeQuantity: (id: string, change: number) => void
  removeFromCart: (id: string) => void
  clearCart: () => void
  completeOrder: (order: Order) => void
  placeOrder: (
    customer: Order["customer"],
    payment: string,
    deliveryFee: number,
  ) => Order
  createProduct: (product: Omit<Product, "id" | "rating">) => void
}

const StoreContext = createContext<StoreValue | null>(null)
const api = "/api"

export function getSessionToken() {
  return sessionStorage.getItem("henrys-session")
}

export function authHeaders(): Record<string, string> {
  const token = getSessionToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export type SessionClaims = { email: string; role: string }

let cachedToken: string | null = null
let cachedClaims: SessionClaims | null = null

export function getSessionClaims(): SessionClaims | null {
  const token = getSessionToken()
  if (!token) {
    cachedToken = null
    cachedClaims = null
    return null
  }
  if (token === cachedToken) return cachedClaims
  const payload = token.split(".")[1]
  let claims: SessionClaims | null = null
  try {
    if (!payload) throw new Error("Malformed session token.")
    const decoded = JSON.parse(
      atob(payload.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { email?: string; role?: string; exp?: number }
    if (decoded.exp && decoded.exp * 1000 < Date.now()) throw new Error("Expired session.")
    claims = { email: String(decoded.email ?? ""), role: String(decoded.role ?? "") }
  } catch {
    claims = null
  }
  cachedToken = claims ? token : null
  cachedClaims = claims
  return claims
}

export const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super Admin",
  manager: "Manager",
  sales: "Sales",
  inventory: "Inventory",
  delivery: "Delivery",
  support: "Support",
  customer: "Customer",
}

export const STAFF_ROLES = [
  "super_admin",
  "manager",
  "sales",
  "inventory",
  "delivery",
  "support",
]

export function isStaffRole(role: string | undefined) {
  return Boolean(role && role !== "customer" && STAFF_ROLES.includes(role))
}

export function clearSession() {
  sessionStorage.removeItem("henrys-session")
  sessionStorage.removeItem("henrys-return-to")
}

type ApiProduct = {
  id: string
  name: string
  brand: string
  category: string
  new_arrival: boolean
  primary_image: string | null
  variants: Array<{
    id: string
    volumeMl: number
    priceKes: number
    compareAtPriceKes: number | null
    stock: number
  }>
}

function toStoreProduct(product: ApiProduct): Product | null {
  const variant = product.variants[0]
  if (!variant) return null

  return {
    id: product.id,
    variantId: variant.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    volume: `${variant.volumeMl}ml`,
    price: variant.priceKes,
    oldPrice: variant.compareAtPriceKes ?? undefined,
    stock: variant.stock,
    rating: 0,
    newArrival: product.new_arrival,
    tag: product.new_arrival ? "New" : undefined,
    image:
      product.primary_image ??
      "https://images.unsplash.com/photo-1592620352607-53100d32f9fb?auto=format&fit=crop&w=720&q=85",
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState(demoProducts)
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("henrys-cart")
      return saved ? (JSON.parse(saved) as CartItem[]) : []
    } catch {
      return []
    }
  })
  const [orders, setOrders] = useState<Order[]>(demoOrders)
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)

  useEffect(() => {
    localStorage.setItem("henrys-cart", JSON.stringify(cart))
  }, [cart])

  useEffect(() => {
    fetch(`${api}/products`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { products: ApiProduct[] }) => {
        if (!Array.isArray(data.products)) return
        const mappedProducts = data.products
          .map(toStoreProduct)
          .filter((product): product is Product => product !== null)
        if (mappedProducts.length) setProducts(mappedProducts)
      })
      .catch(() => undefined)
      .finally(() => setCatalogueLoading(false))
  }, [])

  const value = useMemo<StoreValue>(
    () => ({
      products,
      catalogueLoading,
      cart,
      orders,
      lastOrder,
      coupon,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartTotal: cart.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
      ),
      applyCoupon: async (code, subtotalKes) => {
        const response = await fetch(`${api}/coupons/validate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ code, subtotalKes }),
        })
        const data = await response.json().catch(() => null)
        if (!response.ok || !data?.valid) {
          setCoupon(null)
          return { ok: false, reason: data?.reason ?? "We could not apply that coupon." }
        }
        setCoupon({
          code: data.coupon.code,
          name: data.coupon.name,
          discountKes: data.coupon.discountKes,
          freeDelivery: data.coupon.freeDelivery,
        })
        return { ok: true }
      },
      clearCoupon: () => setCoupon(null),
      addToCart: (product) =>
        setCart((current) => {
          const found = current.find((item) => item.id === product.id)
          return found
            ? current.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item,
              )
            : [...current, { ...product, quantity: 1 }]
        }),
      changeQuantity: (id, change) =>
        setCart((current) =>
          current.map((item) =>
            item.id === id
              ? { ...item, quantity: Math.max(1, item.quantity + change) }
              : item,
          ),
        ),
      removeFromCart: (id) =>
        setCart((current) => current.filter((item) => item.id !== id)),
      clearCart: () => setCart([]),
      completeOrder: (order) => {
        setOrders((current) => [order, ...current])
        setLastOrder(order)
        setCart([])
        setCoupon(null)
      },
      placeOrder: (customer, payment, deliveryFee) => {
        const num = Math.floor(Math.random() * 900) + 2050
        const order: Order = {
          id: `HLH-${num}`,
          items: cart,
          total:
            cart.reduce((sum, item) => sum + item.price * item.quantity, 0) +
            deliveryFee,
          deliveryFee,
          customer,
          payment,
          status: "confirmed",
          createdAt: new Date().toISOString(),
        }
        setOrders((prev) => [order, ...prev])
        setLastOrder(order)
        setCart([])
        return order
      },
      createProduct: (product) => {
        setProducts((current) => [
          {
            ...product,
            id: `p-${crypto.randomUUID()}`,
            rating: 0,
            status: product.status ?? "active",
          },
          ...current,
        ])
      },
    }),
    [products, catalogueLoading, cart, orders, lastOrder, coupon],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  const context = useContext(StoreContext)
  if (!context) throw new Error("useStore must be used inside StoreProvider")
  return context
}

export function formatPrice(value: number) {
  return `KES ${value.toLocaleString("en-KE")}`
}
