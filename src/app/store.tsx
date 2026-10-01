import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react"
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

export const PLACEHOLDER_IMAGE =
  "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='800'%20height='800'%20viewBox='0%200%20800%20800'%3E%3Crect%20width='800'%20height='800'%20fill='%23e7e2d6'/%3E%3Cpath%20fill='none'%20stroke='%23b7ae9d'%20stroke-width='14'%20d='M355%20210h90v70l40%2055v280a30%2030%200%200%201-30%2030H345a30%2030%200%200%201-30-30V335l40-55z'/%3E%3Cpath%20fill='none'%20stroke='%23b7ae9d'%20stroke-width='14'%20d='M315%20360h170'/%3E%3C/svg%3E"

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
  cartToast: { name: string; quantity: number } | null
  dismissCartToast: () => void
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
    image: product.primary_image ?? PLACEHOLDER_IMAGE,
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem("henrys-cart")
      return saved ? (JSON.parse(saved) as CartItem[]) : []
    } catch {
      return []
    }
  })
  const [orders, setOrders] = useState<Order[]>([])
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [coupon, setCoupon] = useState<AppliedCoupon | null>(null)
  const [cartToast, setCartToast] = useState<{ name: string; quantity: number } | null>(null)
  const cartToastTimer = useRef<number | null>(null)

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
      addToCart: (product) => {
        setCart((current) => {
          const found = current.find((item) => item.id === product.id)
          return found
            ? current.map((item) =>
                item.id === product.id
                  ? { ...item, quantity: item.quantity + 1 }
                  : item,
              )
            : [...current, { ...product, quantity: 1 }]
        })
        setCartToast({
          name: product.name,
          quantity: (cart.find((item) => item.id === product.id)?.quantity ?? 0) + 1,
        })
        if (cartToastTimer.current !== null) window.clearTimeout(cartToastTimer.current)
        cartToastTimer.current = window.setTimeout(
          () => setCartToast(null),
          3200,
        )
      },
      cartToast,
      dismissCartToast: () => setCartToast(null),
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
    [products, catalogueLoading, cart, orders, lastOrder, coupon, cartToast],
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
