import { useEffect, useMemo, useRef, useState } from "react"
import {
  createBrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
} from "react-router"
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Banknote,
  Box,
  CalendarDays,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardList,
  Clock,
  CreditCard,
  Download,
  Eye,
  EyeOff,
  Heart,
  LayoutDashboard,
  LayoutGrid,
  List,
  Lock,
  LogOut,
  Mail,
  MapPin,
  Menu,
  Minus,
  MoreVertical,
  Package,
  Pencil,
  Phone,
  Plus,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  SlidersHorizontal,
  Star,
  Store,
  Trash2,
  Truck,
  UploadCloud,
  Users,
  X,
} from "lucide-react"
import {
  authHeaders,
  clearSession,
  formatPrice,
  getSessionClaims,
  getSessionToken,
  isStaffRole,
  PLACEHOLDER_IMAGE,
  ROLE_LABELS,
  useStore,
} from "./store"
import type { Order, Product, SessionClaims } from "./store"


// ─── NOTIFICATION PULSE (tone + unread badge + toast) ───

type NotificationRow = {
  id: string
  channel: string
  template_key: string
  payload: Record<string, unknown> | null
  is_read: boolean
  created_at: string
}

type NotificationEvent = {
  id: string
  title: string
  lines: string[]
  time: string
}

let sharedAudioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  sharedAudioContext ??= new Ctor()
  return sharedAudioContext
}

function playNotificationTing() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    if (ctx.state === "suspended") void ctx.resume()
    const start = ctx.currentTime + 0.02
    for (const { freq, offset } of [
      { freq: 1174.7, offset: 0 },
      { freq: 1568.0, offset: 0.16 },
    ]) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = "triangle"
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.7)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(start + offset)
      osc.stop(start + offset + 0.75)
    }
  } catch {
    // the tone is a best-effort alert only
  }
}

let audioUnlockBound = false

function ensureAudioUnlock() {
  if (audioUnlockBound) return
  audioUnlockBound = true
  const unlock = () => {
    try {
      const ctx = getAudioContext()
      if (ctx?.state === "suspended") void ctx.resume()
    } catch {
      // ignore unlock failures
    }
  }
  window.addEventListener("pointerdown", unlock)
  window.addEventListener("keydown", unlock)
}

function describeNotification(
  row: NotificationRow,
): { title: string; lines: string[] } {
  const p = row.payload ?? {}
  const orderNumber = typeof p.orderNumber === "string" ? p.orderNumber : ""
  const totalKes =
    typeof p.totalKes === "number" ? formatPrice(p.totalKes) : ""
  if (row.channel === "order_alert") {
    const items = Array.isArray(p.items)
      ? (p.items as { name: string; quantity: number }[])
      : []
    return {
      title: `New order ${orderNumber}`.trim(),
      lines: [
        items.map((item) => `${item.name} × ${item.quantity}`).join(", "),
        [
          totalKes,
          typeof p.customerName === "string" ? p.customerName : "",
          typeof p.location === "string" ? p.location : "",
        ]
          .filter(Boolean)
          .join(" · "),
      ].filter(Boolean),
    }
  }
  return {
    title: orderNumber ? `Order ${orderNumber}` : "Notification",
    lines: [typeof p.message === "string" ? p.message : ""].filter(Boolean),
  }
}

function useNotificationPulse(enabled: boolean, scope: "admin" | "customer") {
  const [unread, setUnread] = useState(0)
  const [event, setEvent] = useState<NotificationEvent | null>(null)
  const prevUnread = useRef<number | null>(null)
  useEffect(() => {
    if (!enabled) return
    ensureAudioUnlock()
    let active = true
    const url =
      scope === "admin" ? "/api/notifications?scope=admin" : "/api/notifications"
    const load = async () => {
      const data = await fetch(url, { headers: authHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .catch(() => null)
      if (!active || !data) return
      const count = (data.unreadCount as number) ?? 0
      const rows = ((data.notifications ?? []) as NotificationRow[]).filter(
        (row) => row.channel === "in_app" || row.channel === "order_alert",
      )
      if (prevUnread.current !== null && count > prevUnread.current) {
        const newest = rows.find((row) => !row.is_read)
        if (newest) {
          const described = describeNotification(newest)
          setEvent({
            id: newest.id,
            ...described,
            time: new Date(newest.created_at).toLocaleString("en-KE", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            }),
          })
          playNotificationTing()
        }
      }
      prevUnread.current = count
      setUnread(count)
    }
    void load()
    const timer = window.setInterval(() => void load(), 12000)
    const onVisible = () => {
      if (document.visibilityState === "visible") void load()
    }
    const onCheck = () => void load()
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("henrys:notifications-check", onCheck)
    return () => {
      active = false
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("henrys:notifications-check", onCheck)
    }
  }, [enabled, scope])
  return {
    unread,
    event,
    dismiss: () => setEvent(null),
  }
}

function NotificationToast({
  pulse,
}: {
  pulse: { unread: number; event: NotificationEvent | null; dismiss: () => void }
}) {
  const { event, dismiss } = pulse
  useEffect(() => {
    if (!event) return
    const timer = window.setTimeout(dismiss, 12000)
    return () => window.clearTimeout(timer)
  }, [event, dismiss])
  if (!event) return null
  return (
    <div className="notif-toast" role="status">
      <span className="notif-toast-icon">
        <Bell />
      </span>
      <div>
        <strong>{event.title}</strong>
        {event.lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
        <small>{event.time}</small>
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={dismiss}
      >
        <X />
      </button>
    </div>
  )
}

// ─── CART TOAST ───

function CartToast() {
  const { cartToast, dismissCartToast } = useStore()
  if (!cartToast) return null
  return (
    <div className="cart-toast" role="status">
      <div className="cart-toast-copy">
        <strong>Added to cart</strong>
        <p>{cartToast.name}</p>
        <small>{cartToast.quantity} in cart</small>
      </div>
      <Link to="/cart" className="button button-dark" onClick={dismissCartToast}>
        View cart
      </Link>
      <button
        type="button"
        className="cart-toast-close"
        aria-label="Dismiss"
        onClick={dismissCartToast}
      >
        <X />
      </button>
    </div>
  )
}

// ─── PWA INSTALL PROMPT ───

type BeforeInstallPromptEvent = Event & {
  prompt: () => void
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferredInstallPrompt: BeforeInstallPromptEvent | null = null
const installListeners = new Set<() => void>()

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredInstallPrompt = event as BeforeInstallPromptEvent
    installListeners.forEach((notify) => notify())
  })
  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null
    try {
      localStorage.setItem("henrys-app-installed", "true")
    } catch {
      // storage may be unavailable
    }
    installListeners.forEach((notify) => notify())
  })
}

function isStandaloneApp() {
  if (typeof window === "undefined") return false
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone ===
      true ||
    localStorage.getItem("henrys-app-installed") === "true"
  )
}

function isIOSDevice() {
  return (
    typeof navigator !== "undefined" &&
    /iPad|iPhone|iPod/.test(navigator.userAgent)
  )
}

function installPopupSuppressed() {
  try {
    const raw = localStorage.getItem("henrys-install-prompted")
    if (!raw) return false
    return Date.now() - Number(raw) < 30 * 24 * 60 * 60 * 1000
  } catch {
    return true
  }
}

function useAppInstall() {
  const [, forceRender] = useState(0)
  const [open, setOpen] = useState(false)
  const [choice, setChoice] = useState<"pending" | "accepted" | "dismissed">(
    "pending",
  )
  useEffect(() => {
    const notify = () => forceRender((count) => count + 1)
    installListeners.add(notify)
    return () => {
      installListeners.delete(notify)
    }
  }, [])
  const installed = isStandaloneApp()
  const canNativeInstall = Boolean(deferredInstallPrompt)
  useEffect(() => {
    if (installed || (!canNativeInstall && !isIOSDevice()) || installPopupSuppressed())
      return
    const timer = window.setTimeout(() => {
      setOpen(true)
      try {
        localStorage.setItem("henrys-install-prompted", String(Date.now()))
      } catch {
        // storage may be unavailable
      }
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [installed, canNativeInstall])
  const promptInstall = async () => {
    if (!deferredInstallPrompt) return
    deferredInstallPrompt.prompt()
    const result = await deferredInstallPrompt.userChoice.catch(() => ({
      outcome: "dismissed" as const,
    }))
    setChoice(result.outcome)
    if (result.outcome === "accepted") {
      setOpen(false)
      deferredInstallPrompt = null
      installListeners.forEach((notify) => notify())
    }
  }
  const close = () => setOpen(false)
  return {
    installed,
    canNativeInstall,
    ios: isIOSDevice(),
    open,
    openPrompt: () => setOpen(true),
    close,
    promptInstall,
    choice,
  }
}

function InstallPromptModal({
  install,
}: {
  install: ReturnType<typeof useAppInstall>
}) {
  if (!install.open) return null
  return (
    <div
      className="install-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-prompt-title"
      onClick={(event) => {
        if (event.target === event.currentTarget) install.close()
      }}
    >
      <div className="install-panel">
        <button
          type="button"
          className="install-close"
          aria-label="Close"
          onClick={install.close}
        >
          <X />
        </button>
        <span className="install-icon">
          <Download />
        </span>
        <span className="eyebrow">Install</span>
        <h2 id="install-prompt-title">Get the Henry's Hub app</h2>
        <p>
          Add Henry's Liquor Hub to your home screen for one-tap reordering,
          faster browsing and alerts that ping the moment your order is
          confirmed or out for delivery.
        </p>
        <ul className="install-perks">
          <li>
            <Check /> Works offline and loads instantly
          </li>
          <li>
            <Check /> Order status pings and unread badges
          </li>
          <li>
            <Check /> No app store account needed
          </li>
        </ul>
        {install.canNativeInstall ? (
          <button
            type="button"
            className="button button-dark button-wide"
            onClick={() => void install.promptInstall()}
          >
            {install.choice === "accepted" ? "Installing…" : "Install app"}
          </button>
        ) : install.ios ? (
          <p className="install-steps">
            In Safari, tap the <strong>Share</strong> button, then choose{" "}
            <strong>Add to Home Screen</strong>.
          </p>
        ) : (
          <p className="install-steps">
            Open your browser menu and choose <strong>Install app</strong> or{" "}
            <strong>Add to Home screen</strong> to get the same experience.
          </p>
        )}
        <button type="button" className="text-button" onClick={install.close}>
          Not now — maybe later
        </button>
      </div>
    </div>
  )
}

function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Henry's Liquor Hub home">
      <span className="brand-mark">H</span>
      <span>
        <strong>HENRY'S</strong>
        <small>LIQUOR HUB</small>
      </span>
    </Link>
  )
}

function ActionMenu({
  onView,
  onEdit,
  onHide,
  onDelete,
  isHidden,
}: {
  onView?: () => void
  onEdit?: () => void
  onHide?: () => void
  onDelete?: () => void
  isHidden?: boolean
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="action-menu" ref={menuRef}>
      <button
        type="button"
        className="action-menu-trigger"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
        title="More options"
        aria-label="More options"
      >
        <MoreVertical size={16} />
      </button>
      {open && (
        <div className="action-menu-dropdown">
          {onView && (
            <button
              type="button"
              className="action-menu-item view-item"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onView()
              }}
            >
              <Eye size={14} /> View
            </button>
          )}
          {onEdit && (
            <button
              type="button"
              className="action-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onEdit()
              }}
            >
              <Pencil size={14} /> Edit
            </button>
          )}
          {onHide && (
            <button
              type="button"
              className="action-menu-item"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onHide()
              }}
            >
              {isHidden ? <Eye size={14} /> : <EyeOff size={14} />} {isHidden ? "Show" : "Hide"}
            </button>
          )}
          {onDelete && (
            <button
              type="button"
              className="action-menu-item danger"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onDelete()
              }}
            >
              <Trash2 size={14} /> Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}


function SiteHeader() {
  const { cartCount } = useStore()
  const headerClaims = getSessionClaims()
  const isCustomer = Boolean(headerClaims && !isStaffRole(headerClaims.role))
  const customerPulse = useNotificationPulse(isCustomer, "customer")
  const install = useAppInstall()
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <>
      <div className="announcement">
        <span>Same-day delivery in selected areas</span>
        <span className="announcement-right">Drink responsibly · 18+ only</span>
      </div>
      <header className="site-header">
        {mobileOpen && (
          <div
            className="site-nav-overlay"
            aria-hidden="true"
            onClick={() => setMobileOpen(false)}
          />
        )}
        <Brand />
        <nav
          className={mobileOpen ? "nav-links is-open" : "nav-links"}
          aria-label="Main navigation"
        >
          {[
            "Home",
            "Shop",
            "Categories",
            "Brands",
            "Offers",
            "New arrivals",
            "Collections",
          ].map((item) => (
            <NavLink
              key={item}
              to={
                item === "Home"
                  ? "/"
                  : item === "Shop"
                    ? "/shop"
                    : `/${item.toLowerCase().replace(" ", "-")}`
              }
              onClick={() => setMobileOpen(false)}
            >
              {item}
            </NavLink>
          ))}
        </nav>
        <div className="header-actions">
          {!install.installed && (
            <button
              type="button"
              className="install-button"
              onClick={install.openPrompt}
              title="Install the Henry's Hub app"
            >
              <Download />
              <span>Install</span>
            </button>
          )}
          <Link to="/shop" aria-label="Search products">
            <Search />
          </Link>
          {isCustomer && (
            <Link
              to="/account"
              className="header-bell"
              aria-label={`Notifications, ${customerPulse.unread} unread`}
              title="Your notifications"
            >
              <Bell />
              {customerPulse.unread > 0 && (
                <span className="bell-badge">
                  {customerPulse.unread > 99 ? "99+" : customerPulse.unread}
                </span>
              )}
            </Link>
          )}
          {headerClaims ? (
            <div className="flex items-center gap-2">
              <Link
                to={isStaffRole(headerClaims.role) ? "/admin" : "/account"}
                className="flex items-center gap-1 text-xs font-semibold hover:text-amber-800"
                title={isStaffRole(headerClaims.role) ? "Staff console" : "Account"}
              >
                <CircleUserRound />{" "}
                {isStaffRole(headerClaims.role) ? "Console" : "Account"}
              </Link>
              <button
                type="button"
                className="icon-button"
                title="Sign out"
                aria-label="Sign out"
                onClick={() => {
                  clearSession()
                  window.location.href = "/login"
                }}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link to="/login" aria-label="Account">
              <CircleUserRound />
            </Link>
          )}
          <button
            type="button"
            className="icon-button desktop-heart"
            aria-label="Wishlist"
          >
            <Heart />
          </button>
          <Link
            to="/cart"
            className="cart-link"
            aria-label={`Cart with ${cartCount} items`}
          >
            <ShoppingBag />
            <span>{cartCount}</span>
          </Link>
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      <NotificationToast pulse={customerPulse} />
      <CartToast />
      <InstallPromptModal install={install} />
    </>
  )
}

function AgeGate() {
  const [visible, setVisible] = useState(
    () => localStorage.getItem("henrys-age-confirmed") !== "true",
  )
  if (!visible) return null
  return (
    <div
      className="age-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="age-title"
    >
      <div className="age-panel">
        <Brand />
        <span className="eyebrow">Responsible retailing</span>
        <h2 id="age-title">Are you of legal drinking age?</h2>
        <p>
          Please confirm that you are 18 years of age or older before entering
          Henry's Liquor Hub.
        </p>
        <button
          type="button"
          className="button button-dark button-wide"
          onClick={() => {
            localStorage.setItem("henrys-age-confirmed", "true")
            setVisible(false)
          }}
        >
          Yes, enter the store
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => (window.location.href = "https://www.google.com")}
        >
          No, exit
        </button>
        <small>
          By entering, you agree to our age verification and responsible
          drinking policies.
        </small>
      </div>
    </div>
  )
}

function SiteLayout() {
  return (
    <div className="app-shell">
      <AgeGate />
      <SiteHeader />
      <main>
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

function ProductCard({ product }: { product: Product }) {
  const { addToCart } = useStore()
  const navigate = useNavigate()
  const [liked, setLiked] = useState(false)
  async function toggleWishlist(event: React.MouseEvent) {
    event.preventDefault()
    if (!getSessionToken()) {
      sessionStorage.setItem("henrys-return-to", window.location.pathname)
      navigate("/login")
      return
    }
    const next = !liked
    setLiked(next)
    try {
      const response = next
        ? await fetch("/api/wishlist", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...authHeaders(),
            },
            body: JSON.stringify({ productId: product.id }),
          })
        : await fetch(`/api/wishlist?productId=${product.id}`, {
            method: "DELETE",
            headers: authHeaders(),
          })
      if (!response.ok) setLiked(!next)
    } catch {
      setLiked(!next)
    }
  }
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`} className="product-image">
        {product.tag && <span className="product-tag">{product.tag}</span>}
        <button
          type="button"
          className={liked ? "heart-button is-liked" : "heart-button"}
          onClick={toggleWishlist}
          aria-label="Add to wishlist"
        >
          <Heart />
        </button>
        <img
          src={product.image}
          alt={`${product.name} bottle`}
          loading="lazy"
        />
      </Link>
      <div className="product-copy">
        <span className="product-brand">{product.brand}</span>
        <h3>
          <Link to={`/products/${product.id}`}>{product.name}</Link>
        </h3>
        <div className="rating">
          <Star fill="currentColor" /> {product.rating}{" "}
          <span>· {product.volume}</span>
        </div>
        <div className="price-row">
          <strong>{formatPrice(product.price)}</strong>
          {product.oldPrice && <del>{formatPrice(product.oldPrice)}</del>}
        </div>
        <div className="product-actions">
          <button
            type="button"
            className="button button-dark add-button"
            onClick={() => addToCart(product)}
          >
            Add to cart
          </button>
          <Link to={`/products/${product.id}`} className="product-detail-link">
            View details <ArrowRight />
          </Link>
        </div>
      </div>
    </article>
  )
}

function ProductSection({
  title,
  eyebrow,
  products,
}: {
  title: string
  eyebrow: string
  products: Product[]
}) {
  return (
    <section className="section product-section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <Link to="/shop" className="inline-link">
          View all <ArrowRight />
        </Link>
      </div>
      <div className="product-grid">
        {products.slice(0, 4).map((product) => (
          <ProductCard product={product} key={product.id} />
        ))}
      </div>
    </section>
  )
}

function HomePage() {
  const { products, catalogueLoading } = useStore()
  const [homeCategories, setHomeCategories] = useState<
    Array<{
      name: string
      slug: string
      image_url: string | null
      product_count: number
    }>
  >([])
  const [banners, setBanners] = useState<
    Array<{
      heading: string
      body: string | null
      cta_label: string | null
      cta_url: string | null
      desktop_image_url: string | null
    }>
  >([])
  useEffect(() => {
    fetch("/api/catalogue/categories")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { categories?: typeof homeCategories }) => {
        if (Array.isArray(data.categories)) setHomeCategories(data.categories)
      })
      .catch(() => undefined)
    fetch("/api/banners")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { banners?: typeof banners }) => {
        if (Array.isArray(data.banners)) setBanners(data.banners)
      })
      .catch(() => undefined)
  }, [])
  const hero = banners[0]
  const editorial = banners[1]
  const visibleCategories = homeCategories.filter((c) => c.product_count > 0)
  return (
    <>
      <section className="hero">
        {hero?.desktop_image_url ? (
          <img src={hero.desktop_image_url} alt={hero.heading} />
        ) : (
          <div className="hero-fallback" aria-hidden="true" />
        )}
        <div className="hero-shade" />
        <div className="hero-content">
          <span className="eyebrow light">
            {hero?.heading ??
              "Curated in Nairobi · Delivered to your door"}
          </span>
          <h1>
            Good drinks.
            <br />
            Good times.
          </h1>
          <p>
            {hero?.body ??
              "Discover exceptional spirits, wines and celebratory bottles selected for every kind of occasion."}
          </p>
          <div className="hero-actions">
            <Link to={hero?.cta_url || "/shop"} className="button button-light">
              {hero?.cta_label || "Shop the collection"}
            </Link>
            <Link to="/shop?view=premium" className="button button-ghost">
              Explore premium
            </Link>
          </div>
        </div>
        <div className="hero-note">
          <span>01</span>
          <p>
            Carefully selected
            <br />
            World-class bottles
          </p>
        </div>
      </section>

      {visibleCategories.length > 0 && (
        <section className="section categories-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Find your pour</span>
              <h2>Shop by category</h2>
            </div>
            <p>
              From quiet evenings to milestone celebrations, begin with a
              collection made for the moment.
            </p>
          </div>
          <div className="category-grid">
            {visibleCategories.map((category) => (
              <Link
                className="category-card"
                to={`/shop?category=${encodeURIComponent(category.name)}`}
                key={category.slug}
              >
                <img
                  src={category.image_url ?? PLACEHOLDER_IMAGE}
                  alt={`${category.name} collection`}
                />
                <div>
                  <span>
                    {category.product_count}{" "}
                    {category.product_count === 1 ? "bottle" : "bottles"}
                  </span>
                  <h3>{category.name}</h3>
                  <span className="category-action">
                    Explore <ArrowRight />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {products.length > 0 ? (
        <ProductSection
          eyebrow="The house edit"
          title="Bottles worth sharing"
          products={products}
        />
      ) : (
        !catalogueLoading && (
          <section className="section">
            <div className="empty-state">
              <LayoutGrid />
              <h2>The shelves are being stocked</h2>
              <p>New bottles are on the way — check back shortly.</p>
            </div>
          </section>
        )
      )}

      <section className="editorial-banner">
        <div className="editorial-image">
          {editorial?.desktop_image_url ? (
            <img
              src={editorial.desktop_image_url}
              alt="A considered collection of premium spirits"
              loading="lazy"
            />
          ) : (
            <div className="editorial-fallback" aria-hidden="true" />
          )}
        </div>
        <div className="editorial-copy">
          <span className="eyebrow light">For memorable gatherings</span>
          <h2>Planning something bigger?</h2>
          <p>
            From weddings and boardrooms to private celebrations, our team will
            curate the drinks, quantities and delivery plan around your
            occasion.
          </p>
          <Link to="/bulk-orders" className="button button-light">
            Plan an event order
          </Link>
        </div>
      </section>

      {products.length > 1 && (
        <ProductSection
          eyebrow="Fresh on the shelf"
          title="New arrivals"
          products={[...products].reverse()}
        />
      )}

      <section className="service-strip">
        {[
          {
            icon: Truck,
            title: "Reliable delivery",
            body: "Clear delivery windows and live order updates.",
          },
          {
            icon: ShieldCheck,
            title: "Responsible retail",
            body: "Age-verified service from checkout to handover.",
          },
          {
            icon: Phone,
            title: "Human support",
            body: "Real help for recommendations and large orders.",
          },
          {
            icon: CreditCard,
            title: "Secure payment",
            body: "M-Pesa, card and configured business payment options.",
          },
        ].map(({ icon: Icon, title, body }) => (
          <div key={title}>
            <Icon />
            <h3>{title}</h3>
            <p>{body}</p>
          </div>
        ))}
      </section>

      <section className="newsletter">
        <span className="eyebrow">The Henry's list</span>
        <h2>New bottles. Better occasions.</h2>
        <p>
          Receive considered recommendations, release notes and private offers.
        </p>
        <form onSubmit={(event) => event.preventDefault()}>
          <input
            type="email"
            aria-label="Email address"
            placeholder="Email address"
          />
          <button type="submit">
            Join the list <ArrowRight />
          </button>
        </form>
      </section>
    </>
  )
}

function ShopPage() {
  const { products } = useStore()
  const location = useLocation()
  const [search, setSearch] = useState(
    () => new URLSearchParams(window.location.search).get("q") ?? "",
  )
  useEffect(() => {
    const query = new URLSearchParams(location.search).get("q")
    if (query !== null) setSearch(query)
  }, [location.search])
  const [category, setCategory] = useState("All")
  const [sort, setSort] = useState("Featured")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  const filtered = useMemo(() => {
    const result = products.filter(
      (product) =>
        (category === "All" || product.category === category) &&
        `${product.name} ${product.brand} ${product.category}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    return [...result].sort((a, b) =>
      sort === "Price low"
        ? a.price - b.price
        : sort === "Price high"
          ? b.price - a.price
          : b.rating - a.rating,
    )
  }, [products, search, category, sort])
  const categoryOptions = [
    "All",
    ...new Set(products.map((product) => product.category)),
  ]
  return (
    <div className="shop-page">
      <div className="shop-intro">
        <span className="eyebrow">Henry's collection</span>
        <h1>Find your next bottle</h1>
        <p>
          Premium spirits, good wines and bar essentials—carefully sourced and
          ready for delivery.
        </p>
      </div>
      <div className="shop-toolbar">
        <label className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search by product, brand or category"
          />
        </label>
        <button
          type="button"
          className="button button-outline filter-toggle"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal /> Filters
        </button>
        <label className="sort-field">
          Sort by{" "}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            <option>Featured</option>
            <option>Price low</option>
            <option>Price high</option>
          </select>
          <ChevronDown />
        </label>
        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
            title="List view"
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>
      <div className="catalog-layout">
        <aside className={filtersOpen ? "filters is-open" : "filters"}>
          <div className="filter-heading">
            <strong>Filter products</strong>
            <button
              type="button"
              onClick={() => {
                setCategory("All")
                setSearch("")
              }}
            >
              Reset
            </button>
          </div>
          <div className="filter-group">
            <h3>Category</h3>
            {categoryOptions.map((item) => (
              <label key={item}>
                <input
                  type="radio"
                  name="category"
                  checked={category === item}
                  onChange={() => setCategory(item)}
                />{" "}
                <span>{item}</span>
                <small>
                  {item === "All"
                    ? products.length
                    : products.filter((product) => product.category === item)
                        .length}
                </small>
              </label>
            ))}
          </div>
          <div className="filter-group">
            <h3>Availability</h3>
            <label>
              <input type="checkbox" defaultChecked /> <span>In stock</span>
            </label>
            <label>
              <input type="checkbox" /> <span>On offer</span>
            </label>
          </div>
          <div className="filter-group">
            <h3>Price range</h3>
            <div className="price-inputs">
              <span>KES 0</span>
              <span>KES 10,000+</span>
            </div>
            <input
              className="range"
              type="range"
              min="0"
              max="10000"
              defaultValue="9000"
            />
          </div>
        </aside>
        <section className="catalog">
          <div className="catalog-meta">
            <p>
              <strong>{filtered.length}</strong> products
            </p>
          </div>
          {filtered.length ? (
            viewMode === "grid" ? (
              <div className="product-grid shop-grid">
                {filtered.map((product) => (
                  <ProductCard product={product} key={product.id} />
                ))}
              </div>
            ) : (
              <div className="product-list">
                {filtered.map((product) => (
                  <div className="product-list-row" key={product.id}>
                    <img src={product.image} alt={product.name} />
                    <div className="plr-info">
                      <strong>{product.name}</strong>
                      <small>{product.brand} · {product.volume} · {product.category}</small>
                    </div>
                    <div className="plr-price">{formatPrice(product.price)}</div>
                    <div className="plr-actions">
                      <Link
                        to={`/products/${product.id}`}
                        className="button button-outline"
                        style={{ fontSize: 12, padding: "6px 14px" }}
                      >
                        View
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="empty-state">
              <Search />
              <h2>No bottles found</h2>
              <p>Try another search or reset your filters.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

type ProductDetail = {
  product: {
    id: string
    name: string
    slug: string
    description: string | null
    short_description: string | null
    country_of_origin: string | null
    alcohol_percentage: number | null
    serving_suggestion: string | null
    brand: string
    brand_description: string | null
    category: string
    rating: number
    review_count: number
    variants: Array<{
      id: string
      sku: string
      volumeMl: number
      priceKes: number
      compareAtPriceKes: number | null
      stock: number
    }>
    images: Array<{ url: string; alt: string | null; isPrimary: boolean }>
  }
  reviews: Array<{
    id: string
    rating: number
    body: string
    is_verified_purchase: boolean
    created_at: string
    author: string
  }>
  related: Array<{
    id: string
    name: string
    slug: string
    brand: string
    category: string
    variants: Array<{ id: string; volumeMl: number; priceKes: number; compareAtPriceKes: number | null; stock: number }>
    primary_image: string | null
  }>
}

function toCardProduct(item: ProductDetail["related"][number]): Product {
  const variant = item.variants[0]
  return {
    id: item.id,
    variantId: variant?.id,
    name: item.name,
    brand: item.brand,
    category: item.category,
    volume: variant ? `${variant.volumeMl}ml` : "",
    price: variant?.priceKes ?? 0,
    oldPrice: variant?.compareAtPriceKes ?? undefined,
    stock: variant?.stock ?? 0,
    rating: 0,
    image: item.primary_image ?? PLACEHOLDER_IMAGE,
  }
}

function ProductDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { products, addToCart, catalogueLoading } = useStore()
  const navigate = useNavigate()
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState("Details")
  const [detail, setDetail] = useState<ProductDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(0)
  const [wishlisted, setWishlisted] = useState(false)
  const [reviewForm, setReviewForm] = useState({ rating: 5, body: "" })
  const [reviewMessage, setReviewMessage] = useState("")
  const listed = products.find((p) => p.id === id)

  useEffect(() => {
    if (!id) return
    let active = true
    setDetail(null)
    setDetailLoading(true)
    setSelectedImage(0)
    fetch(`/api/products/${id}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: ProductDetail) => active && setDetail(data))
      .catch(() => undefined)
      .finally(() => active && setDetailLoading(false))
    return () => {
      active = false
    }
  }, [id])

  const product =
    listed ??
    (detail
      ? toCardProduct({
          id: detail.product.id,
          name: detail.product.name,
          slug: detail.product.slug,
          brand: detail.product.brand,
          category: detail.product.category,
          variants: detail.product.variants,
          primary_image: detail.product.images[0]?.url ?? null,
        })
      : undefined)

  const related = detail
    ? detail.related.map(toCardProduct)
    : products
        .filter((p) => p.id !== id && p.category === product?.category)
        .slice(0, 3)

  if (!product && (catalogueLoading || detailLoading))
    return (
      <div className="page-wrap simple-page">
        <span className="eyebrow">Henry's Liquor Hub</span>
        <h1>Loading bottle details</h1>
        <p>Retrieving the latest product information.</p>
      </div>
    )

  if (!product)
    return (
      <div className="page-wrap simple-page">
        <span className="eyebrow">Henry's Liquor Hub</span>
        <h1>Product not found</h1>
        <p>
          This bottle may be out of stock or unavailable. Browse our full
          collection instead.
        </p>
        <Link to="/shop" className="button button-dark">
          Back to shop
        </Link>
      </div>
    )

  const d = detail?.product
  const galleryImages = d?.images.length
    ? d.images.map((image) => image.url)
    : product
      ? [product.image]
      : []
  const details: Record<string, string> = {
    Brand: product.brand,
    Category: product.category,
    Volume: product.volume,
    ABV: d?.alcohol_percentage != null ? `${d.alcohol_percentage}% vol` : "—",
    Country: d?.country_of_origin?.trim() || "—",
    "Serving suggestion": d?.serving_suggestion?.trim() || "—",
  }

  return (
    <div className="product-detail-page">
      <div className="detail-breadcrumb">
        <Link to="/">Home</Link>
        <ChevronRight />
        <Link to="/shop">Shop</Link>
        <ChevronRight />
        <span>{product.name}</span>
      </div>
      <div className="detail-layout">
        <div className="detail-gallery">
          <div className="detail-image-main">
            {product.tag && <span className="product-tag">{product.tag}</span>}
            <img
              src={galleryImages[selectedImage] ?? product.image}
              alt={`${product.name} bottle`}
            />
          </div>
          <div className="detail-thumbnails">
            {galleryImages.map((src, i) => (
              <button
                key={`${src}-${i}`}
                type="button"
                className={i === selectedImage ? "thumb active" : "thumb"}
                onClick={() => setSelectedImage(i)}
              >
                <img src={src} alt="" />
              </button>
            ))}
          </div>
        </div>

        <div className="detail-info">
          <span className="product-brand">{product.brand}</span>
          <h1>{product.name}</h1>
          <div className="rating detail-rating">
            {[...Array(5)].map((_, i) => (
              <Star
                key={i}
                fill={
                  i < Math.floor(Number(d?.rating ?? product.rating))
                    ? "currentColor"
                    : "none"
                }
              />
            ))}
            <span>{Number(d?.rating ?? product.rating)}</span>
            {d && (
              <span className="rating-count">· {d.review_count} reviews</span>
            )}
          </div>

          <div className="detail-price">
            <strong>{formatPrice(product.price)}</strong>
            {product.oldPrice && <del>{formatPrice(product.oldPrice)}</del>}
          </div>

          <p className="detail-description">
            {d?.description ??
              d?.short_description ??
              `A carefully selected expression from ${product.brand}, this ${product.volume} bottle delivers a smooth, well-balanced character with layered depth. Best suited to considered moments worth savouring.`}
          </p>

          <div className="detail-stock">
            <span className={product.stock > 5 ? "stock-ok" : "stock-low"}>
              {product.stock > 5 ? <CheckCircle /> : <AlertTriangle />}
              {product.stock > 5
                ? `In stock — ${product.stock} bottles available`
                : `Only ${product.stock} left`}
            </span>
          </div>

          <div className="detail-actions">
            <div className="quantity">
              <button
                type="button"
                onClick={() => setQty(Math.max(1, qty - 1))}
              >
                <Minus />
              </button>
              <span>{qty}</span>
              <button type="button" onClick={() => setQty(qty + 1)}>
                <Plus />
              </button>
            </div>
            <button
              type="button"
              className="button button-dark detail-add"
              onClick={() => {
                for (let i = 0; i < qty; i++) addToCart(product)
              }}
            >
              <ShoppingBag /> Add {qty > 1 ? `${qty} bottles` : "to cart"}
            </button>
            <button
              type="button"
              className={
                wishlisted
                  ? "icon-button wishlist-btn is-liked"
                  : "icon-button wishlist-btn"
              }
              aria-label="Save to wishlist"
              onClick={async () => {
                if (!getSessionToken()) {
                  sessionStorage.setItem(
                    "henrys-return-to",
                    `/products/${id}`,
                  )
                  navigate("/login")
                  return
                }
                const next = !wishlisted
                setWishlisted(next)
                try {
                  const response = next
                    ? await fetch("/api/wishlist", {
                        method: "POST",
                        headers: {
                          "Content-Type": "application/json",
                          ...authHeaders(),
                        },
                        body: JSON.stringify({ productId: product.id }),
                      })
                    : await fetch(`/api/wishlist?productId=${product.id}`, {
                        method: "DELETE",
                        headers: authHeaders(),
                      })
                  if (!response.ok) setWishlisted(!next)
                } catch {
                  setWishlisted(!next)
                }
              }}
            >
              <Heart />
            </button>
          </div>

          <div className="detail-delivery">
            <div>
              <Truck />
              <div>
                <strong>Same-day delivery</strong>
                <span>Order before 2 PM — delivered today</span>
              </div>
            </div>
            <div>
              <ShieldCheck />
              <div>
                <strong>Age-verified handover</strong>
                <span>ID check required at the door</span>
              </div>
            </div>
            <div>
              <Package />
              <div>
                <strong>Secure packaging</strong>
                <span>Padded and sealed for every bottle</span>
              </div>
            </div>
          </div>

          <div className="detail-tabs">
            {["Details", "Tasting notes", "Reviews"].map((t) => (
              <button
                key={t}
                type="button"
                className={tab === t ? "active" : ""}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="detail-tab-content">
            {tab === "Details" && (
              <table className="specs-table">
                <tbody>
                  {Object.entries(details).map(([k, v]) => (
                    <tr key={k}>
                      <th>{k}</th>
                      <td>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {tab === "Tasting notes" && (
              <div className="tasting-notes">
                <div>
                  <strong>Nose</strong>
                  <p>
                    Rich dried fruit, warm oak, and a hint of vanilla with
                    subtle spice.
                  </p>
                </div>
                <div>
                  <strong>Palate</strong>
                  <p>
                    Smooth and full-bodied with notes of caramel, dark
                    chocolate, and dried citrus peel.
                  </p>
                </div>
                <div>
                  <strong>Finish</strong>
                  <p>
                    Long, warming finish with lingering smoke and a touch of
                    sweetness.
                  </p>
                </div>
              </div>
            )}
            {tab === "Reviews" && (
              <div className="reviews-list">
                {detail?.reviews.length
                  ? detail.reviews.map((r) => (
                      <div key={r.id} className="review">
                        <div className="review-header">
                          <div className="review-avatar">
                            {r.author[0]?.toUpperCase() ?? "C"}
                          </div>
                          <div>
                            <strong>{r.author}</strong>
                            {r.is_verified_purchase && (
                              <span className="verified-purchase-label">
                                {" · Verified purchase"}
                              </span>
                            )}
                            <div className="rating">
                              {[...Array(r.rating)].map((_, i) => (
                                <Star key={i} fill="currentColor" />
                              ))}
                              <span>
                                {new Date(r.created_at).toLocaleDateString(
                                  "en-KE",
                                  { month: "short", year: "numeric" },
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p>{r.body}</p>
                      </div>
                    ))
                  : detail && (
                      <p>
                        No reviews yet. Be the first to share your thoughts on
                        this bottle.
                      </p>
                    )}
                <form
                  className="review-form"
                  onSubmit={async (event) => {
                    event.preventDefault()
                    if (!getSessionToken()) {
                      sessionStorage.setItem(
                        "henrys-return-to",
                        `/products/${id}`,
                      )
                      navigate("/login")
                      return
                    }
                    const response = await fetch("/api/reviews", {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(),
                      },
                      body: JSON.stringify({
                        productId: product.id,
                        rating: reviewForm.rating,
                        body: reviewForm.body,
                      }),
                    })
                    const data = await response.json().catch(() => null)
                    setReviewMessage(
                      response.ok
                        ? (data?.message ?? "Review submitted.")
                        : (data?.error ?? "We could not submit your review."),
                    )
                    if (response.ok) {
                      setReviewForm({ rating: 5, body: "" })
                      const refreshed = await fetch(`/api/products/${id}`).then(
                        (r) => r.json(),
                      )
                      setDetail(refreshed)
                    }
                  }}
                >
                  <h3>Write a review</h3>
                  <div className="review-form-rating">
                    {[1, 2, 3, 4, 5].map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-label={`${value} star${value > 1 ? "s" : ""}`}
                        className={
                          value <= reviewForm.rating
                            ? "star-pick is-active"
                            : "star-pick"
                        }
                        onClick={() =>
                          setReviewForm({ ...reviewForm, rating: value })
                        }
                      >
                        <Star size={18} />
                      </button>
                    ))}
                  </div>
                  <textarea
                    required
                    minLength={5}
                    maxLength={2000}
                    rows={3}
                    placeholder="Share what you enjoyed…"
                    value={reviewForm.body}
                    onChange={(e) =>
                      setReviewForm({ ...reviewForm, body: e.target.value })
                    }
                  />
                  {reviewMessage && (
                    <p className="review-form-message">{reviewMessage}</p>
                  )}
                  <button type="submit" className="button button-dark">
                    Submit review
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="section product-section detail-related">
          <div className="section-heading">
            <div>
              <span className="eyebrow">More from {product.category}</span>
              <h2>You may also like</h2>
            </div>
            <Link to="/shop" className="inline-link">
              View all <ArrowRight />
            </Link>
          </div>
          <div className="product-grid">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function CartPage() {
  const {
    cart,
    cartTotal,
    changeQuantity,
    removeFromCart,
    coupon,
    applyCoupon,
    clearCoupon,
  } = useStore()
  const navigate = useNavigate()
  const [couponCode, setCouponCode] = useState("")
  const [couponMessage, setCouponMessage] = useState("")
  return (
    <div className="cart-page page-wrap">
      <span className="eyebrow">Your selection</span>
      <h1>Shopping cart</h1>
      {!cart.length ? (
        <div className="empty-state">
          <ShoppingBag />
          <h2>Your cart is ready for a good bottle</h2>
          <p>Explore our collection and add something worth sharing.</p>
          <Link to="/shop" className="button button-dark">
            Explore the shop
          </Link>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.map((item) => (
              <article className="cart-item" key={item.id}>
                <img src={item.image} alt={item.name} />
                <div className="cart-item-copy">
                  <span>{item.brand}</span>
                  <h3>{item.name}</h3>
                  <p>{item.volume}</p>
                  <button type="button" onClick={() => removeFromCart(item.id)}>
                    Remove
                  </button>
                </div>
                <div className="quantity">
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, -1)}
                  >
                    <Minus />
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    type="button"
                    onClick={() => changeQuantity(item.id, 1)}
                  >
                    <Plus />
                  </button>
                </div>
                <strong>{formatPrice(item.price * item.quantity)}</strong>
              </article>
            ))}
          </div>
          <aside className="order-summary">
            <h2>Order summary</h2>
            <div>
              <span>Subtotal</span>
              <strong>{formatPrice(cartTotal)}</strong>
            </div>
            {coupon ? (
              <div>
                <span>Coupon ({coupon.code})</span>
                <strong>
                  −{formatPrice(coupon.discountKes)}{" "}
                  <button
                    type="button"
                    className="coupon-remove"
                    onClick={() => {
                      clearCoupon()
                      setCouponMessage("")
                    }}
                  >
                    Remove
                  </button>
                </strong>
              </div>
            ) : (
              <form
                className="coupon-form"
                onSubmit={async (event) => {
                  event.preventDefault()
                  if (!couponCode.trim()) return
                  const result = await applyCoupon(
                    couponCode.trim().toUpperCase(),
                    cartTotal,
                  )
                  setCouponMessage(result.ok ? "" : (result.reason ?? "Coupon failed."))
                  if (result.ok) setCouponCode("")
                }}
              >
                <input
                  value={couponCode}
                  onChange={(e) => setCouponCode(e.target.value)}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                />
                <button type="submit">Apply</button>
              </form>
            )}
            {couponMessage && <p className="coupon-message">{couponMessage}</p>}
            <div>
              <span>Delivery</span>
              <span>
                {coupon?.freeDelivery ? "Free with coupon" : "Calculated at checkout"}
              </span>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>{formatPrice(cartTotal - (coupon?.discountKes ?? 0))}</strong>
            </div>
            <button
              type="button"
              className="button button-dark button-wide"
              onClick={() => {
                if (!sessionStorage.getItem("henrys-session")) {
                  sessionStorage.setItem("henrys-return-to", "/checkout")
                  navigate("/login")
                  return
                }
                navigate("/checkout")
              }}
            >
              Proceed to checkout
            </button>
            <p>
              <ShieldCheck /> Secure checkout · Age verified delivery
            </p>
          </aside>
        </div>
      )}
    </div>
  )
}

// ─── CHECKOUT ────────────────────────────────────────────────────────────────

type CheckoutForm = {
  phone: string
  address: string
  area: string
  notes: string
}

function CheckoutPage() {
  const { cart, cartTotal, completeOrder, coupon } = useStore()
  const navigate = useNavigate()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [payMethod, setPayMethod] = useState<"mpesa" | "mpesa-till" | "card" | "bank">("mpesa-till")
  const [payOnDelivery, setPayOnDelivery] = useState(false)
  const [tillRef, setTillRef] = useState("")
  const [mpesaState, setMpesaState] =
    useState<"idle" | "sending" | "prompt" | "verified">("idle")
  const [checkoutError, setCheckoutError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState<CheckoutForm>({
    phone: "+254 7",
    address: "",
    area: "Westlands",
    notes: "",
  })
  const [account, setAccount] = useState<{ name: string; email: string } | null>(
    null,
  )
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const session = sessionStorage.getItem("henrys-session")

  useEffect(() => {
    if (!session) return
    fetch("/api/auth/me", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const user = data?.user as
          | { firstName?: string; lastName?: string; email?: string; phone?: string | null }
          | undefined
        if (!user) return
        setAccount({
          name: [user.firstName, user.lastName].filter(Boolean).join(" "),
          email: String(user.email ?? ""),
        })
        setForm((current) =>
          current.phone === "+254 7" && user.phone
            ? { ...current, phone: user.phone }
            : current,
        )
      })
      .catch(() => undefined)
  }, [session])

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    [],
  )

  // ── Login guard: show prompt before cart is even visible ──────────────────
  if (!session && cart.length > 0) {
    return (
      <div className="page-wrap">
        <div className="checkout-login-required">
          <Lock />
          <h2>Sign in to checkout</h2>
          <p>
            Create a free account or sign in to your existing account to place
            your order and track your delivery.
          </p>
          <div className="clr-actions">
            <button
              type="button"
              className="button button-dark"
              onClick={() => {
                sessionStorage.setItem("henrys-return-to", "/checkout")
                navigate("/login")
              }}
            >
              Sign in
            </button>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                sessionStorage.setItem("henrys-return-to", "/checkout")
                navigate("/register")
              }}
            >
              Create account
            </button>
          </div>
        </div>
      </div>
    )
  }

  const deliveryFee =
    coupon?.freeDelivery || cartTotal >= 5000 ? 0 : 300
  const total = Math.max(0, cartTotal - (coupon?.discountKes ?? 0)) + deliveryFee

  function field(key: keyof CheckoutForm) {
    return {
      value: form[key],
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
      ) => setForm({ ...form, [key]: e.target.value }),
    }
  }

  function requestMpesa() {
    setMpesaState("sending")
    timerRef.current = setTimeout(() => {
      setMpesaState("prompt")
      timerRef.current = setTimeout(() => setMpesaState("verified"), 4500)
    }, 1800)
  }

  async function handlePlaceOrder() {
    if (!session) {
      setCheckoutError("Please sign in before placing an order.")
      sessionStorage.setItem("henrys-return-to", "/checkout")
      navigate("/login")
      return
    }
    if (cart.some((item) => !item.variantId)) {
      setCheckoutError(
        "These products are not available for checkout yet. Refresh the catalogue and try again.",
      )
      return
    }

    setCheckoutError("")
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: cart.map((item) => ({
            variantId: item.variantId,
            quantity: item.quantity,
          })),
          paymentMethod:
            payOnDelivery && (payMethod === "mpesa" || payMethod === "mpesa-till")
              ? "cash"
              : payMethod === "mpesa-till"
                ? "mpesa"
                : payMethod,
          deliveryType: "delivery",
          couponCode: coupon?.code,
          deliveryAddress: {
            name: account?.name ?? "",
            phone: form.phone,
            email: account?.email ?? "",
            address: form.address,
            area: form.area,
          },
          customerNote:
            payMethod === "mpesa-till" && !payOnDelivery
              ? `M-Pesa Buy Goods Till 1755994 (Ref: ${tillRef || "1755994"}). ${form.notes}`
              : form.notes || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(
          data?.error ?? "We could not place your order. Please try again.",
        )
      }

      const order: Order = {
        id: data.order.order_number,
        items: cart,
        total: data.order.totalKes,
        deliveryFee: data.order.deliveryFeeKes,
        customer: {
          name: account?.name ?? "Customer",
          phone: form.phone,
          email: account?.email ?? "",
          address: form.address,
          area: form.area,
        },
        payment:
          payOnDelivery &&
          (payMethod === "mpesa" || payMethod === "mpesa-till")
            ? "Pay on delivery"
            : payMethod === "mpesa"
              ? "M-Pesa"
              : payMethod === "mpesa-till"
                ? "M-Pesa Buy Goods"
                : payMethod === "card"
                  ? "Card"
                  : "Bank Transfer",
        status: "confirmed",
        createdAt: new Date().toISOString(),
      }
      completeOrder(order)
      window.dispatchEvent(new Event("henrys:notifications-check"))
      navigate(`/order-confirmation?id=${order.id}`)
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "We could not place your order. Please try again.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!cart.length && step < 3)
    return (
      <div className="page-wrap simple-page">
        <span className="eyebrow">Checkout</span>
        <h1>Your cart is empty</h1>
        <p>Add some bottles to your cart before checking out.</p>
        <Link to="/shop" className="button button-dark">
          Browse the collection
        </Link>
      </div>
    )

  const areas = [
    "Westlands",
    "Kilimani",
    "Karen",
    "Lavington",
    "Gigiri",
    "Runda",
    "Muthaiga",
    "Upper Hill",
    "Lang'ata",
    "Parklands",
    "Ruaka",
    "Kasarani",
    "Thika Road",
  ]

  return (
    <div className="checkout-page">
      <div className="checkout-wrap">
        {/* Left: form */}
        <div className="checkout-form-col">
          <div className="checkout-progress">
            {(["Delivery", "Payment", "Review"] as const).map((label, i) => (
              <div
                key={label}
                className={`progress-step ${
                  step > i + 1 ? "done" : step === i + 1 ? "active" : ""
                }`}
              >
                <span>{step > i + 1 ? <Check /> : i + 1}</span>
                <strong>{label}</strong>
              </div>
            ))}
          </div>

          {step === 1 && (
            <form
              className="co-form"
              onSubmit={(e) => {
                e.preventDefault()
                setStep(2)
              }}
            >
              <h2>Where should we bring your order?</h2>
              <p className="co-subhead">
                Just your phone number and location — we will call you to
                confirm before the rider leaves.
              </p>
              <div className="co-fields">
                <label className="co-label span-2">
                  Phone number we can call
                  <input
                    required
                    placeholder="+254 7XX XXX XXX"
                    {...field("phone")}
                  />
                </label>
                <label className="co-label span-2">
                  Delivery location
                  <input
                    required
                    placeholder="Building, street or landmark"
                    {...field("address")}
                  />
                </label>
                <label className="co-label">
                  Nairobi area
                  <select {...field("area")}>
                    {areas.map((a) => (
                      <option key={a}>{a}</option>
                    ))}
                  </select>
                </label>
                <label className="co-label">
                  Notes (optional)
                  <input
                    placeholder="Gate code, floor, etc."
                    {...field("notes")}
                  />
                </label>
              </div>
              <div className="co-actions">
                <button type="submit" className="button button-dark">
                  Continue to payment <ArrowRight />
                </button>
              </div>
            </form>
          )}

          {step === 2 && (
            <div className="co-form">
              <button
                type="button"
                className="back-link"
                onClick={() => setStep(1)}
              >
                <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to
                delivery
              </button>
              <h2>Payment method</h2>
              <div className="pay-tabs">
                {([
                  { key: "mpesa-till", label: "Buy Goods (Till 1755994)", icon: QrCode },
                  { key: "mpesa", label: "Direct M-Pesa Express", icon: Smartphone },
                  { key: "card", label: "Card", icon: CreditCard },
                  { key: "bank", label: "Bank transfer", icon: Banknote },
                ] as {
                  key: typeof payMethod
                  label: string
                  icon: React.ElementType
                }[]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    className={`pay-tab ${payMethod === key ? "active" : ""}`}
                    onClick={() => {
                      setPayMethod(key)
                      setMpesaState("idle")
                    }}
                  >
                    <Icon /> {label}
                  </button>
                ))}
              </div>

              {payMethod === "mpesa-till" && (
                <div className="mpesa-panel">
                  <label className="cod-check">
                    <input
                      type="checkbox"
                      checked={payOnDelivery}
                      onChange={(e) => {
                        setPayOnDelivery(e.target.checked)
                        setMpesaState("idle")
                      }}
                    />
                    <span>
                      <strong>Pay on delivery</strong>
                      <small>
                        Skip the till payment now — pay the rider by M-Pesa or
                        cash when your order arrives at your door.
                      </small>
                    </span>
                  </label>
                  {!payOnDelivery && (
                    <>
                  <div className="mpesa-till-box">
                    <span className="eyebrow light">Lipa na M-Pesa</span>
                    <h3 style={{ fontSize: 18, margin: "6px 0", color: "#ffffff" }}>BUY GOODS TILL NUMBER</h3>
                    <div className="mpesa-till-number">1755994</div>
                    <p style={{ margin: "4px 0 0", color: "#d1fae5", fontSize: 13 }}>
                      Store Name: <strong>HENRY'S LIQUOR HUB</strong>
                    </p>

                    <div className="mpesa-steps">
                      <strong>How to pay via M-Pesa Till:</strong>
                      <ol>
                        <li>Go to M-Pesa menu on your phone</li>
                        <li>Select <strong>Lipa na M-Pesa</strong> &gt; <strong>Buy Goods and Services</strong></li>
                        <li>Enter Till Number: <strong style={{ color: "#34d399" }}>1755994</strong></li>
                        <li>Enter Amount: <strong>{formatPrice(total)}</strong></li>
                        <li>Enter your M-Pesa PIN and confirm payment</li>
                        <li>Enter your M-Pesa confirmation code (e.g. QJK892341X) below</li>
                      </ol>
                    </div>
                  </div>

                  <label className="co-label span-2" style={{ marginTop: 12 }}>
                    M-Pesa Confirmation Ref Code
                    <input
                      required
                      placeholder="e.g. QJK892341X"
                      value={tillRef}
                      onChange={(e) => setTillRef(e.target.value.toUpperCase())}
                    />
                  </label>

                  <div style={{ marginTop: 16 }}>
                    <button
                      type="button"
                      className="button button-dark"
                      onClick={() => {
                        if (!tillRef.trim() || tillRef.trim().length < 5) {
                          setCheckoutError("Please enter your M-Pesa transaction code (e.g. QJK892341X).")
                          return
                        }
                        setMpesaState("verified")
                        setCheckoutError("")
                      }}
                    >
                      <CheckCircle /> Confirm Buy Goods Payment (1755994)
                    </button>
                    {mpesaState === "verified" && (
                      <div className="mpesa-status success" style={{ marginTop: 12 }}>
                        <CheckCircle />
                        <span>Payment verified with Ref: {tillRef || "1755994"}. Click below to review.</span>
                      </div>
                    )}
                  </div>
                    </>
                  )}
                  {payOnDelivery && (
                    <div className="cod-panel">
                      <CheckCircle />
                      <div>
                        <strong>
                          Pay {formatPrice(total)} on delivery
                        </strong>
                        <p>
                          Nothing to pay now. Our rider will call{" "}
                          {form.phone} before leaving, and you settle the full
                          amount by M-Pesa or cash at your door.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {payMethod === "mpesa" && (
                <div className="mpesa-panel">
                  <label className="co-label mpesa-phone-label">
                    M-Pesa phone number
                    <input
                      placeholder="+254 7XX XXX XXX"
                      value={form.phone}
                      onChange={(e) =>
                        setForm({ ...form, phone: e.target.value })
                      }
                    />
                  </label>
                  <label className="cod-check">
                    <input
                      type="checkbox"
                      checked={payOnDelivery}
                      onChange={(e) => {
                        setPayOnDelivery(e.target.checked)
                        setMpesaState("idle")
                      }}
                    />
                    <span>
                      <strong>Pay on delivery</strong>
                      <small>
                        The most popular option — pay the rider by M-Pesa or
                        cash when your order arrives at your door.
                      </small>
                    </span>
                  </label>
                  {!payOnDelivery && (
                    <div className="mpesa-body">
                    <div className="mpesa-info">
                      <p>
                        Tap <strong>Request payment</strong> and you will
                        receive an M-Pesa PIN prompt on your phone. Enter your
                        PIN to complete the transaction.
                      </p>
                      <div className="mpesa-amount">
                        <span>Amount to pay</span>
                        <strong>{formatPrice(total)}</strong>
                      </div>
                      {mpesaState === "idle" && (
                        <button
                          type="button"
                          className="button button-dark"
                          onClick={requestMpesa}
                        >
                          <Smartphone /> Request M-Pesa payment
                        </button>
                      )}
                      {mpesaState === "sending" && (
                        <div className="mpesa-status sending">
                          <div className="mpesa-spinner" />
                          <span>Sending STK push to {form.phone}...</span>
                        </div>
                      )}
                      {(mpesaState === "prompt" ||
                        mpesaState === "verified") && (
                        <div
                          className={`mpesa-status ${
                            mpesaState === "verified" ? "success" : "waiting"
                          }`}
                        >
                          {mpesaState === "verified" ? (
                            <>
                              <CheckCircle />
                              <span>Payment confirmed — proceed to review</span>
                            </>
                          ) : (
                            <>
                              <div className="mpesa-spinner" />
                              <span>Waiting for PIN confirmation...</span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mpesa-phone-mockup" aria-hidden="true">
                      <div className="phone-frame">
                        <div className="phone-screen">
                          <div className="phone-statusbar">
                            <span>9:41</span>
                            <span>●●●</span>
                          </div>
                          {mpesaState === "idle" && (
                            <div className="phone-idle">
                              <div className="phone-app-icon">M</div>
                              <span>M-Pesa</span>
                            </div>
                          )}
                          {mpesaState === "sending" && (
                            <div className="phone-ringing">
                              <div className="phone-ring-anim" />
                              <div className="phone-app-icon">M</div>
                              <span>Incoming request...</span>
                            </div>
                          )}
                          {mpesaState === "prompt" && (
                            <div className="phone-prompt">
                              <div className="mpesa-logo-small">M-PESA</div>
                              <p className="phone-merchant">
                                Henry's Liquor Hub
                              </p>
                              <p className="phone-amount">
                                {formatPrice(total)}
                              </p>
                              <div className="phone-pin-label">
                                Enter M-Pesa PIN
                              </div>
                              <div className="phone-pin-dots">
                                {[0, 1, 2, 3].map((i) => (
                                  <span
                                    key={i}
                                    className="pin-dot"
                                    style={{ animationDelay: `${i * 0.3}s` }}
                                  />
                                ))}
                              </div>
                              <div className="phone-btns">
                                <button type="button">Cancel</button>
                                <button type="button">OK</button>
                              </div>
                            </div>
                          )}
                          {mpesaState === "verified" && (
                            <div className="phone-success">
                              <CheckCircle />
                              <strong>Confirmed</strong>
                              <span>{formatPrice(total)} paid</span>
                              <p>
                                Ref: QR
                                {Math.floor(Math.random() * 9000000) + 1000000}
                              </p>
                            </div>
                          )}
                        </div>
                        <div className="phone-home-bar" />
                      </div>
                    </div>
                  </div>
                  )}
                  {payOnDelivery && (
                    <div className="cod-panel">
                      <CheckCircle />
                      <div>
                        <strong>
                          Pay {formatPrice(total)} on delivery
                        </strong>
                        <p>
                          Your rider will call {form.phone || "your phone"} on
                          the way. Pay by M-Pesa or cash at handover — no
                          online payment needed now.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {payMethod === "card" && (
                <div className="card-panel co-fields">
                  <label className="co-label span-2">
                    Cardholder name
                    <input placeholder="Name on card" />
                  </label>
                  <label className="co-label span-2">
                    Card number
                    <input placeholder="•••• •••• •••• ••••" maxLength={19} />
                  </label>
                  <label className="co-label">
                    Expiry
                    <input placeholder="MM / YY" />
                  </label>
                  <label className="co-label">
                    CVV
                    <input placeholder="•••" maxLength={4} />
                  </label>
                  <div className="co-secure span-2">
                    <ShieldCheck /> Your card details are encrypted and never
                    stored.
                  </div>
                </div>
              )}

              {payMethod === "bank" && (
                <div className="bank-panel">
                  <p>
                    Transfer the exact amount to the account below. Include your
                    order number as the reference. Orders are processed within 1
                    business hour of payment confirmation.
                  </p>
                  <div className="bank-details">
                    {[
                      ["Bank", "Equity Bank Kenya"],
                      ["Account name", "Henry's Liquor Hub Ltd"],
                      ["Account number", "0140265801893"],
                      ["Branch code", "026"],
                      ["Amount", formatPrice(total)],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <span>{k}</span>
                        <strong>{v}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="co-actions">
                <button
                  type="button"
                  className="button button-dark"
                  disabled={
                    payMethod === "mpesa" && !payOnDelivery && mpesaState !== "verified"
                  }
                  onClick={() => setStep(3)}
                >
                  Review order <ArrowRight />
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="co-form">
              <button
                type="button"
                className="back-link"
                onClick={() => setStep(2)}
              >
                <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to
                payment
              </button>
              <h2>Review your order</h2>
              <div className="review-section">
                <div className="review-block">
                  <div className="review-block-head">
                    <MapPin />
                    <strong>Delivery to</strong>
                    <button type="button" onClick={() => setStep(1)}>
                      Edit
                    </button>
                  </div>
                  <p>
                    {(account?.name || "Your account") + " · " + form.phone}
                  </p>
                  <p>
                    {form.address}, {form.area}, Nairobi
                  </p>
                </div>
                <div className="review-block">
                  <div className="review-block-head">
                    <CreditCard />
                    <strong>Payment</strong>
                    <button type="button" onClick={() => setStep(2)}>
                      Edit
                    </button>
                  </div>
                  <p>
                    {payOnDelivery &&
                    (payMethod === "mpesa" || payMethod === "mpesa-till")
                      ? "Pay on delivery — M-Pesa or cash at the door"
                      : payMethod === "mpesa"
                        ? `M-Pesa · ${form.phone}`
                        : payMethod === "mpesa-till"
                          ? "M-Pesa Buy Goods (Till 1755994)"
                          : payMethod === "card"
                            ? "Visa / Mastercard"
                            : "Bank transfer"}
                  </p>
                </div>
              </div>
              <div className="review-items">
                {cart.map((item) => (
                  <div key={item.id} className="review-item">
                    <img src={item.image} alt={item.name} />
                    <div>
                      <strong>{item.name}</strong>
                      <span>
                        {item.brand} · {item.volume} · ×{item.quantity}
                      </span>
                    </div>
                    <strong>{formatPrice(item.price * item.quantity)}</strong>
                  </div>
                ))}
              </div>
              <div className="co-actions">
                {checkoutError && <p className="form-error">{checkoutError}</p>}
                <button
                  type="button"
                  className="button button-dark button-wide"
                  onClick={handlePlaceOrder}
                  disabled={isSubmitting}
                >
                  <ShieldCheck />{" "}
                  {isSubmitting
                    ? "Placing order..."
                    : `Place order — ${formatPrice(total)}`}
                </button>
                <p className="co-legal">
                  By placing this order you confirm you are 18+ and agree to our
                  Terms of Service.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: order summary */}
        <aside className="checkout-summary">
          <h3>Order summary</h3>
          <div className="co-summary-items">
            {cart.map((item) => (
              <div key={item.id} className="co-summary-item">
                <div className="co-img-wrap">
                  <img src={item.image} alt={item.name} />
                  <span>{item.quantity}</span>
                </div>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {item.brand} · {item.volume}
                  </small>
                </div>
                <span>{formatPrice(item.price * item.quantity)}</span>
              </div>
            ))}
          </div>
          <div className="co-summary-totals">
            <div>
              <span>Subtotal</span>
              <span>{formatPrice(cartTotal)}</span>
            </div>
            <div>
              <span>Delivery</span>
              <span>
                {deliveryFee === 0 ? "Free" : formatPrice(deliveryFee)}
              </span>
            </div>
            <div className="co-summary-grand">
              <span>Total</span>
              <strong>{formatPrice(total)}</strong>
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}

// ─── ORDER CONFIRMATION ───────────────────────────────────────────────────────

function OrderConfirmationPage() {
  const { lastOrder } = useStore()
  const id = new URLSearchParams(window.location.search).get("id") ?? "HLH-???"
  const eta = new Date(
    Date.now() +
      (lastOrder?.deliveryFee === 300 && lastOrder.customer
        ? 3600000 * 6
        : 3600000 * 24),
  )
  const etaStr = eta.toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  })
  const customer = lastOrder?.customer

  return (
    <div className="confirmation-page">
      <div className="confirmation-card">
        <div className="confirmation-icon">
          <CheckCircle />
        </div>
        <span className="eyebrow">Order placed</span>
        <h1>
          You are all set{customer ? `, ${customer.name.split(" ")[0]}` : ""}.
        </h1>
        <p className="confirm-sub">
          Order <strong>{id}</strong> has been confirmed and is being prepared.
        </p>

        <div className="confirm-meta">
          <div>
            <Clock />
            <div>
              <strong>Estimated delivery</strong>
              <span>{etaStr}</span>
            </div>
          </div>
          {customer && (
            <div>
              <MapPin />
              <div>
                <strong>Delivering to</strong>
                <span>
                  {customer.address}, {customer.area}
                </span>
              </div>
            </div>
          )}
          <div>
            <Smartphone />
            <div>
              <strong>Updates via SMS</strong>
              <span>{customer?.phone ?? "Your phone"}</span>
            </div>
          </div>
        </div>

        <div className="confirm-actions">
          <Link to="/track" className="button button-dark">
            Track your order
          </Link>
          <Link to="/shop" className="button button-outline">
            Continue shopping
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── ORDER TRACKING ───────────────────────────────────────────────────────────

const trackStepLabels: Record<string, { label: string; desc: string }> = {
  pending_payment: {
    label: "Order received",
    desc: "Your order has been placed and is awaiting payment confirmation.",
  },
  payment_confirmed: {
    label: "Payment confirmed",
    desc: "We have received your payment and are processing the order.",
  },
  confirmed: {
    label: "Order confirmed",
    desc: "Your order is confirmed and queued for picking.",
  },
  preparing: {
    label: "Being prepared",
    desc: "Our team is picking and packing your bottles.",
  },
  ready: {
    label: "Ready",
    desc: "Your order is packed and ready for handover or collection.",
  },
  out_for_delivery: {
    label: "Out for delivery",
    desc: "Your order is with our driver for delivery.",
  },
  delivered: {
    label: "Delivered",
    desc: "Your order has been delivered and signed for.",
  },
}

const paymentStatusLabels: Record<string, string> = {
  pending: "Awaiting payment",
  processing: "Payment processing",
  successful: "Paid",
  failed: "Payment failed",
  cancelled: "Payment cancelled",
  refunded: "Refunded",
}

// ─── PRINTABLE RECEIPT ────────────────────────────────────────────────────────

type ReceiptData = {
  orderNumber: string
  placedAt: string
  closedAt?: string | null
  customerName: string
  customerPhone?: string | null
  addressLine?: string | null
  deliveryType: string
  items: Array<{
    name: string
    quantity: number
    unitPriceKes: number
    fulfilment?: string
  }>
  subtotalKes: number
  discountKes: number
  deliveryFeeKes: number
  totalKes: number
  paymentMethod: string
  paymentStatus: string
}

function escReceipt(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function receiptDate(iso: string) {
  return new Date(iso).toLocaleString("en-KE", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function buildReceiptHtml(data: ReceiptData) {
  const money = (n: number) => `KES ${n.toLocaleString("en-KE")}`
  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td class="qty">${item.quantity} x</td>
          <td>${escReceipt(item.name)}${
            item.fulfilment === "excluded"
              ? '<br><span class="excl">NOT DELIVERED</span>'
              : ""
          }</td>
          <td class="num">${money(item.unitPriceKes * item.quantity)}</td>
        </tr>`,
    )
    .join("")
  const discountRow =
    data.discountKes > 0
      ? `<div class="tot"><span>Discount</span><span>-${money(data.discountKes)}</span></div>`
      : ""
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Receipt ${escReceipt(data.orderNumber)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #f4f2ec;
    font-family: "Courier New", Courier, monospace;
    color: #1c1a17;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 12px;
  }
  .btn-row { display: flex; gap: 10px; margin-bottom: 18px; }
  .btn {
    width: 155px;
    padding: 10px;
    font: inherit;
    cursor: pointer;
    letter-spacing: 1px;
    border: 1px solid #1c1a17;
  }
  .btn-print { background: #1c1a17; color: #fff; }
  .btn-download { background: #fff; color: #1c1a17; }
  .sheet {
    width: 320px;
    background: #fff;
    padding: 22px 18px 26px;
    box-shadow: 0 8px 28px rgba(28, 26, 23, 0.14);
    font-size: 12px;
    line-height: 1.5;
  }
  .brand { text-align: center; }
  .brand h1 { font-size: 17px; margin: 0; letter-spacing: 2px; }
  .brand p { margin: 2px 0 0; font-size: 10px; letter-spacing: 1px; text-transform: uppercase; }
  .cut { border: none; border-top: 1px dashed #b9b2a4; margin: 12px 0; }
  .kv { display: flex; justify-content: space-between; gap: 8px; }
  .kv span:first-child { text-transform: uppercase; font-size: 10px; }
  .center { text-align: center; text-transform: uppercase; letter-spacing: 1px; font-size: 11px; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 4px; }
  td { padding: 3px 0; vertical-align: top; }
  .qty { width: 34px; white-space: nowrap; }
  .num { text-align: right; white-space: nowrap; }
  .excl { color: #8f1d22; font-weight: bold; font-size: 10px; letter-spacing: 1px; }
  .totals { margin-top: 6px; }
  .tot { display: flex; justify-content: space-between; }
  .grand { border-top: 1px dashed #b9b2a4; margin-top: 6px; padding-top: 6px; font-weight: bold; }
  .pay { margin-top: 10px; }
  .bar { text-align: center; letter-spacing: 3px; margin-top: 14px; font-size: 16px; }
  .thanks { text-align: center; margin-top: 8px; font-size: 11px; }
  .fine { text-align: center; margin-top: 10px; font-size: 9.5px; color: #55504a; }
  @media print {
    body { background: #fff; padding: 0; }
    .btn { display: none; }
    .sheet { box-shadow: none; width: 76mm; }
  }
</style>
</head>
<body>
  <div class="btn-row">
    <button class="btn btn-print" onclick="window.print()">Print receipt</button>
    <button class="btn btn-download" onclick="downloadReceipt()">Download receipt</button>
  </div>
  <div class="sheet">
    <div class="brand">
      <h1>HENRY'S LIQUOR HUB</h1>
      <p>Order Receipt</p>
    </div>
    <hr class="cut" />
    <div class="kv"><span>Receipt No</span><strong>${escReceipt(data.orderNumber)}</strong></div>
    <div class="kv"><span>Placed</span><span>${escReceipt(receiptDate(data.placedAt))}</span></div>
    ${
      data.closedAt
        ? `<div class="kv"><span>Delivered</span><span>${escReceipt(receiptDate(data.closedAt))}</span></div>`
        : ""
    }
    <div class="kv"><span>Customer</span><span>${escReceipt(data.customerName || "Customer")}</span></div>
    ${
      data.customerPhone
        ? `<div class="kv"><span>Phone</span><span>${escReceipt(data.customerPhone)}</span></div>`
        : ""
    }
    ${
      data.addressLine
        ? `<div class="kv"><span>${data.deliveryType === "pickup" ? "Collection" : "Delivered to"}</span><span>${escReceipt(data.addressLine)}</span></div>`
        : ""
    }
    <hr class="cut" />
    <div class="center">Items</div>
    <table>
      <tbody>${itemRows}</tbody>
    </table>
    <hr class="cut" />
    <div class="totals">
      <div class="tot"><span>Subtotal</span><span>${money(data.subtotalKes)}</span></div>
      ${discountRow}
      <div class="tot">
        <span>Delivery</span>
        <span>${data.deliveryFeeKes === 0 ? "FREE" : money(data.deliveryFeeKes)}</span>
      </div>
      <div class="tot grand"><span>TOTAL</span><span>${money(data.totalKes)}</span></div>
    </div>
    <div class="pay">
      <div class="kv"><span>Payment</span><span>${escReceipt(PAYMENT_LABELS[data.paymentMethod] ?? data.paymentMethod)}</span></div>
      <div class="kv"><span>Status</span><span>${escReceipt((paymentStatusLabels[data.paymentStatus] ?? data.paymentStatus).toUpperCase())}</span></div>
    </div>
    <div class="bar">||| || ||| | |||| ||| || |||</div>
    <div class="thanks">Thank you for shopping with Henry's Liquor Hub.</div>
    <div class="fine">
      Goods sold are for personal consumption. Excluded by law from sale to
      persons under 18 years. Retain this receipt for any refund or exchange.
      ${
        data.items.some((item) => item.fulfilment === "excluded")
          ? " Items marked NOT DELIVERED will be refunded or rearranged — our team will call you."
          : ""
      }
    </div>
  </div>
<script>
  function downloadReceipt() {
    var blob = new Blob(["<!doctype html>" + document.documentElement.outerHTML], { type: "text/html" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "receipt-${escReceipt(data.orderNumber)}.html";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }
</script>
</body>
</html>`
}

function printReceipt(data: ReceiptData) {
  const win = window.open("", "_blank", "width=400,height=760")
  if (!win) return
  win.document.open()
  win.document.write(buildReceiptHtml(data))
  win.document.close()
  win.focus()
}

type TrackRecentOrder = {
  order_number: string
  status: string
  total_kes: number
  item_count: number
  placed_at: string
}

function OrderTrackingPage() {
  const { lastOrder } = useStore()
  const orderParam =
    new URLSearchParams(useLocation().search).get("order") ?? ""
  const autoLookupDone = useRef(false)
  const [orderNumber, setOrderNumber] = useState(orderParam || lastOrder?.id || "")
  const [contact, setContact] = useState(lastOrder?.customer.email ?? "")
  const [result, setResult] = useState<{
    order: {
      order_number: string
      status: string
      payment_status: string
      payment_method: string
      delivery_type: string
      subtotal_kes: number
      discount_kes: number
      delivery_fee_kes: number
      total_kes: number
      placed_at: string
      updated_at: string
      item_count: number
      customer_name: string
      delivery_address: {
        name?: string
        phone?: string
        email?: string
        address?: string
        area?: string
      } | null
      items: Array<{
        name: string
        quantity: number
        unitPriceKes: number
        image: string | null
        fulfilment: string
      }>
    }
    timeline: Array<{ step: string; reached: boolean }>
  } | null>(null)
  const [error, setError] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [recentOrders, setRecentOrders] = useState<TrackRecentOrder[]>([])

  async function runLookup(num: string, contactValue: string) {
    const orderTrimmed = num.trim()
    const contactTrimmed = contactValue.trim()
    const staff = isStaffRole(getSessionClaims()?.role)
    if (!orderTrimmed || (!contactTrimmed && !staff)) return
    setIsSearching(true)
    setError("")
    setResult(null)
    try {
      const response = await fetch(
        `/api/orders/track?orderNumber=${encodeURIComponent(orderTrimmed)}&contact=${encodeURIComponent(contactTrimmed.toLowerCase())}`,
        { headers: authHeaders() },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error ?? "No order matched those details.")
        return
      }
      setResult(data)
    } catch {
      setError("We could not reach the tracking service. Try again shortly.")
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const claims = getSessionClaims()
    if (!claims) return
    if (isStaffRole(claims.role)) {
      if (orderParam && !autoLookupDone.current) {
        autoLookupDone.current = true
        void runLookup(orderParam, "")
      }
      return
    }
    if (claims.role !== "customer") return
    let cancelled = false
    fetch("/api/auth/me", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { user?: { email?: string } }) => {
        if (cancelled) return
        const email = data?.user?.email ?? ""
        if (!email) return
        setContact((current) => current || email)
        if (orderParam && !autoLookupDone.current) {
          autoLookupDone.current = true
          void runLookup(orderParam, email)
        }
      })
      .catch(() => undefined)
    fetch("/api/orders", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { orders?: TrackRecentOrder[] }) => {
        if (!cancelled) setRecentOrders((data?.orders ?? []).slice(0, 5))
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const terminal =
    result?.order.status === "cancelled" || result?.order.status === "refunded"

  return (
    <div className="page-wrap track-page">
      <div className="track-intro">
        <span className="eyebrow">Henry's Liquor Hub</span>
        <h1>Track your order</h1>
        <p>
          Enter the order number from your confirmation message with the email
          or phone you checked out with, and we will show exactly where your
          bottles are.
        </p>
      </div>
      <form
        className="track-form"
        onSubmit={(event) => {
          event.preventDefault()
          void runLookup(orderNumber, contact)
        }}
      >
        <label>
          Order number
          <input
            required
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="HLH-260930-XXXXXX"
          />
        </label>
        <label>
          Email or phone used on the order
          <input
            required
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="you@email.com or +254 7…"
          />
        </label>
        <button type="submit" className="button button-dark" disabled={isSearching}>
          {isSearching ? "Searching…" : "Track order"}
        </button>
      </form>
      {recentOrders.length > 0 && (
        <div className="track-recent">
          <span className="eyebrow">Your recent orders</span>
          <div className="track-recent-list">
            {recentOrders.map((recent) => (
              <button
                key={recent.order_number}
                type="button"
                className="track-recent-chip"
                onClick={() => {
                  setOrderNumber(recent.order_number)
                  void runLookup(recent.order_number, contact)
                }}
              >
                <strong>#{recent.order_number}</strong>
                <span>
                  {trackStepLabels[recent.status]?.label ??
                    recent.status.replace(/_/g, " ")}
                </span>
                <span>{formatPrice(recent.total_kes)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
      {error && <div className="form-error">{error}</div>}
      {result && (
        <>
          <div className="track-hero">
            <div className="track-hero-main">
              <span className="eyebrow">
                Order #{result.order.order_number}
              </span>
              <h2>
                {terminal
                  ? `This order was ${result.order.status.replace(/_/g, " ")}`
                  : (trackStepLabels[result.order.status]?.label ??
                    result.order.status.replace(/_/g, " "))}
              </h2>
              <p>
                {terminal
                  ? "Contact our support team from your account if you need help."
                  : (trackStepLabels[result.order.status]?.desc ??
                    "We are working on your order.")}
              </p>
              <div className="track-hero-meta">
                <span>
                  <Clock />
                  Placed{" "}
                  {new Date(result.order.placed_at).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span>
                  <Truck />
                  {result.order.delivery_type === "pickup"
                    ? "Collection order"
                    : "Doorstep delivery"}
                </span>
                <span>
                  <Banknote />
                  {paymentStatusLabels[result.order.payment_status] ??
                    result.order.payment_status}
                </span>
              </div>
              {result.order.status === "delivered" && (
                <button
                  type="button"
                  className="button button-dark track-print-btn"
                  onClick={() =>
                    printReceipt({
                      orderNumber: result.order.order_number,
                      placedAt: result.order.placed_at,
                      closedAt: result.order.updated_at,
                      customerName: result.order.customer_name,
                      customerPhone:
                        result.order.delivery_address?.phone ?? null,
                      addressLine:
                        [
                          result.order.delivery_address?.address,
                          result.order.delivery_address?.area,
                        ]
                          .filter(Boolean)
                          .join(", ") || null,
                      deliveryType: result.order.delivery_type,
                      items: result.order.items,
                      subtotalKes: result.order.subtotal_kes,
                      discountKes: result.order.discount_kes,
                      deliveryFeeKes: result.order.delivery_fee_kes,
                      totalKes: result.order.total_kes,
                      paymentMethod: result.order.payment_method,
                      paymentStatus: result.order.payment_status,
                    })
                  }
                >
                  <Download />
                  Print your receipt
                </button>
              )}
            </div>
            <div className="track-hero-total">
              <span>Order total</span>
              <strong>{formatPrice(result.order.total_kes)}</strong>
              <em>
                {result.order.item_count}{" "}
                {result.order.item_count === 1 ? "bottle" : "bottles"}
              </em>
            </div>
          </div>
          {terminal ? (
            <div className="empty-state">
              <AlertTriangle />
              <h2>
                This order was {result.order.status.replace(/_/g, " ")}.
              </h2>
              <p>
                Contact our support team from your account if you need help.
              </p>
            </div>
          ) : (
            <div className="track-timeline">
              {result.timeline.map((step, i) => {
                const meta = trackStepLabels[step.step] ?? {
                  label: step.step.replace(/_/g, " "),
                  desc: "",
                }
                const currentIndex = result.timeline.findIndex(
                  (t) => t.reached && t.step === result.order.status,
                )
                return (
                  <div
                    key={step.step}
                    className={`track-step ${step.reached ? "done" : ""} ${
                      step.step === result.order.status ? "current" : ""
                    }`}
                  >
                    <div className="track-dot">
                      {step.reached && step.step !== result.order.status ? (
                        <Check />
                      ) : null}
                    </div>
                    {i < result.timeline.length - 1 && i !== currentIndex && (
                      <div className="track-line" />
                    )}
                    <div className="track-info">
                      <strong>{meta.label}</strong>
                      {step.reached && (
                        <span className="track-time">
                          {new Date(result.order.placed_at).toLocaleDateString(
                            "en-KE",
                            { day: "numeric", month: "short" },
                          )}
                        </span>
                      )}
                      {step.step === result.order.status && <p>{meta.desc}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          <div className="track-cards">
            <div className="track-card">
              <h3>
                <Truck />
                {result.order.delivery_type === "pickup"
                  ? "Collection details"
                  : "Delivery details"}
              </h3>
              {result.order.delivery_type === "pickup" ? (
                <p className="track-card-line">
                  This order is ready for pickup at our store. Our team will
                  call{" "}
                  <strong>
                    {result.order.delivery_address?.phone ??
                      "the number on the order"}
                  </strong>{" "}
                  when it is packed.
                </p>
              ) : (
                <>
                  <p className="track-card-line">
                    <MapPin />
                    <span>
                      <strong>
                        {result.order.delivery_address?.address ??
                          "Address to be confirmed with the rider"}
                      </strong>
                      {result.order.delivery_address?.area
                        ? `, ${result.order.delivery_address.area}`
                        : ""}
                    </span>
                  </p>
                  <p className="track-card-line">
                    <Phone />
                    <span>
                      {result.order.delivery_address?.phone ??
                        "No phone recorded on the order"}
                    </span>
                  </p>
                </>
              )}
              <p className="track-card-line muted">
                <CreditCard />
                <span>
                  {PAYMENT_LABELS[result.order.payment_method] ??
                    result.order.payment_method}{" "}
                  —{" "}
                  {paymentStatusLabels[result.order.payment_status] ??
                    result.order.payment_status}
                </span>
              </p>
            </div>
            <div className="track-card">
              <h3>
                <Package />
                Bottles in this order
              </h3>
              <div className="track-item-list">
                {result.order.items.map((item, i) => (
                  <div className="track-item" key={`${item.name}-${i}`}>
                    <img src={item.image ?? PLACEHOLDER_IMAGE} alt="" />
                    <div className="track-item-info">
                      <strong>{item.name}</strong>
                      <span>
                        Qty {item.quantity} · {formatPrice(item.unitPriceKes)}{" "}
                        each
                      </span>
                    </div>
                    {item.fulfilment === "delivering" && (
                      <span className="track-badge tb-delivering">
                        On the way
                      </span>
                    )}
                    {item.fulfilment === "excluded" && (
                      <span className="track-badge tb-excluded">
                        Not delivered
                      </span>
                    )}
                  </div>
                ))}
                {!result.order.items.length && (
                  <p className="track-card-line muted">
                    Item details will appear here shortly.
                  </p>
                )}
              </div>
            </div>
          </div>
        </>
      )}
      {!result && !error && !lastOrder && (
        <div className="empty-state">
          <Package />
          <h2>Enter your order details</h2>
          <p>
            Use the order number from your confirmation email along with the
            email or phone number you checked out with.
          </p>
          <Link to="/shop" className="button button-dark">
            Shop now
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── ADMIN ────────────────────────────────────────────────────────────────────

function CollectionPage({
  eyebrow,
  title,
  copy,
  products,
}: {
  eyebrow: string
  title: string
  copy: string
  products: Product[]
}) {
  return (
    <div className="collection-page">
      <header className="collection-hero">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{copy}</p>
        <Link to="/shop" className="button button-dark">
          Browse all bottles <ArrowRight />
        </Link>
      </header>
      <section className="collection-grid-wrap">
        <div className="collection-meta">
          <span>{products.length} curated bottles</span>
          <span>Available for delivery or collection</span>
        </div>
        <div className="product-grid shop-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  )
}

function OffersPage() {
  const { products } = useStore()
  return (
    <CollectionPage
      eyebrow="Limited offers"
      title="A little more to pour"
      copy="Selected bottles and collections, priced for the occasions worth gathering for."
      products={products.filter((product) => product.oldPrice)}
    />
  )
}

function NewArrivalsPage() {
  const { products } = useStore()
  return (
    <CollectionPage
      eyebrow="Just landed"
      title="New to the shelves"
      copy="Fresh additions to our collection, selected for their character and quality."
      products={products.filter((product) => product.newArrival)}
    />
  )
}

function BookingPage() {
  const [sent, setSent] = useState(false)
  const [bookingNumber, setBookingNumber] = useState("")
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function submitBooking(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    setError("")
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.get("name"),
          email: values.get("email"),
          phone: values.get("phone"),
          eventType: values.get("eventType"),
          eventDate: values.get("eventDate"),
          guests: Number(values.get("guests")),
          location: values.get("location"),
          notes: String(values.get("notes") || "").trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error ?? "We could not send your request.")
      }
      setBookingNumber(data.bookingNumber)
      setSent(true)
    } catch (bookingError) {
      setError(
        bookingError instanceof Error
          ? bookingError.message
          : "We could not send your request.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="booking-page">
      <section className="booking-intro">
        <span className="eyebrow light">Events & celebrations</span>
        <h1>
          Let's plan
          <br />
          the pour.
        </h1>
        <p>
          Tell us a little about your occasion. Our team will return a
          considered recommendation, quote and delivery plan.
        </p>
        <div>
          <CalendarDays />
          <span>Weddings, corporate events, private parties and gifting</span>
        </div>
      </section>
      <section className="booking-form-wrap">
        <form className="booking-form" onSubmit={submitBooking}>
          <span className="eyebrow">Request a proposal</span>
          <h2>Event or bulk order</h2>
          {sent ? (
            <div className="booking-success">
              <CheckCircle />
              <h3>Request received</h3>
              <p>
                Reference {bookingNumber}. Our events team will contact you
                within one business day.
              </p>
            </div>
          ) : (
            <>
              <div className="form-grid">
                <label>
                  Full name
                  <input name="name" required placeholder="Your name" />
                </label>
                <label>
                  Email address
                  <input
                    name="email"
                    required
                    type="email"
                    placeholder="you@email.com"
                  />
                </label>
                <label>
                  Phone number
                  <input name="phone" required placeholder="+254 7XX XXX XXX" />
                </label>
                <label>
                  Event type
                  <select name="eventType" required defaultValue="">
                    <option value="" disabled>
                      Select event type
                    </option>
                    <option>Wedding</option>
                    <option>Corporate event</option>
                    <option>Private party</option>
                    <option>Hospitality order</option>
                  </select>
                </label>
                <label>
                  Event date
                  <input name="eventDate" required type="date" />
                </label>
                <label>
                  Estimated guests
                  <input
                    name="guests"
                    required
                    type="number"
                    min="1"
                    placeholder="80"
                  />
                </label>
                <label className="span-2">
                  Delivery location
                  <input
                    name="location"
                    required
                    placeholder="Venue or delivery address"
                  />
                </label>
                <label className="span-2">
                  What are you planning?
                  <textarea
                    name="notes"
                    rows={4}
                    placeholder="Tell us about your drinks list, budget or any special requests."
                  />
                </label>
              </div>
              {error && <p className="form-error">{error}</p>}
              <button
                className="button button-dark"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Sending..." : "Send request"} <ArrowRight />
              </button>
            </>
          )}
        </form>
      </section>
    </div>
  )
}

type CmsSection = { heading?: string; body?: string }
type CmsPageBody = {
  eyebrow?: string
  copy?: string
  sections?: CmsSection[]
}

function EditorialPage({
  title,
  eyebrow,
  copy,
  slug,
}: {
  title: string
  eyebrow: string
  copy: string
  slug?: string
}) {
  const [cms, setCms] = useState<{ title: string; body: CmsPageBody } | null>(
    null,
  )
  useEffect(() => {
    if (!slug) return
    fetch(`/api/cms/pages?slug=${slug}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) =>
        data?.page &&
        setCms({
          title: data.page.title,
          body: (data.page.body ?? {}) as CmsPageBody,
        }),
      )
      .catch(() => undefined)
  }, [slug])
  return (
    <div className="editorial-page">
      <section>
        <span className="eyebrow">{cms?.body.eyebrow ?? eyebrow}</span>
        <h1>{cms?.title ?? title}</h1>
        <p>{cms?.body.copy ?? copy}</p>
        {cms?.body.sections?.map((section, index) => (
          <div className="editorial-section" key={index}>
            {section.heading && <h2>{section.heading}</h2>}
            {section.body && <p>{section.body}</p>}
          </div>
        ))}
      </section>
      <aside>
        <span>Henry's Liquor Hub</span>
        <p>
          Responsible retailing, expert recommendations and delivery you can
          rely on.
        </p>
        <Link to="/contact" className="inline-link">
          Speak to our team <ArrowRight />
        </Link>
      </aside>
    </div>
  )
}

type ContactInfo = {
  phone?: string
  email?: string
  whatsapp?: string
  address?: string
  mapUrl?: string
}

function ContactPage() {
  const [contact, setContact] = useState<ContactInfo | null>(null)
  const [hours, setHours] = useState<{ weekday?: string; weekend?: string } | null>(
    null,
  )
  useEffect(() => {
    let active = true
    fetch("/api/settings")
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!active || !data?.settings) return
        setContact((data.settings.contact ?? null) as ContactInfo | null)
        setHours(
          (data.settings.hours ?? null) as {
            weekday?: string
            weekend?: string
          } | null,
        )
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [])
  const whatsappNumber = (contact?.whatsapp ?? contact?.phone ?? "").replace(
    /[^0-9]/g,
    "",
  )
  const openingHours = [hours?.weekday, hours?.weekend].filter(Boolean).join(" · ")
  return (
    <div className="editorial-page">
      <section>
        <span className="eyebrow">Here to help</span>
        <h1>Speak with Henry&rsquo;s.</h1>
        <p>
          For recommendations, order questions, delivery help or a custom event
          proposal, our Nairobi team is ready to help.
        </p>
        <div className="contact-cards">
          {contact?.phone && (
            <a className="contact-card" href={`tel:${contact.phone}`}>
              <Phone />
              <span>Call the team</span>
              <strong>{contact.phone}</strong>
            </a>
          )}
          {whatsappNumber && (
            <a
              className="contact-card"
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noreferrer"
            >
              <Smartphone />
              <span>WhatsApp us</span>
              <strong>{contact?.whatsapp ?? contact?.phone}</strong>
            </a>
          )}
          {contact?.email && (
            <a className="contact-card" href={`mailto:${contact.email}`}>
              <Mail />
              <span>Email</span>
              <strong>{contact.email}</strong>
            </a>
          )}
          {contact?.address && (
            <div className="contact-card">
              <MapPin />
              <span>Visit / delivery coverage</span>
              <strong>{contact.address}</strong>
            </div>
          )}
          {openingHours && (
            <div className="contact-card">
              <Clock />
              <span>Opening hours</span>
              <strong>{openingHours}</strong>
            </div>
          )}
        </div>
        {contact === null && (
          <p className="empty-copy">Loading our contact details…</p>
        )}
      </section>
      <aside>
        <span>Henry&rsquo;s Liquor Hub</span>
        <p>
          Responsible retailing, expert recommendations and delivery you can
          rely on.
        </p>
        <Link to="/account" className="inline-link">
          Manage your account <ArrowRight />
        </Link>
      </aside>
    </div>
  )
}

function DynamicCmsPage() {
  const { slug } = useParams<{ slug: string }>()
  const [page, setPage] = useState<
    { title: string; body: CmsPageBody } | null | undefined
  >(undefined)
  useEffect(() => {
    if (!slug) {
      setPage(null)
      return
    }
    let active = true
    fetch(`/api/cms/pages?slug=${encodeURIComponent(slug)}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        active &&
        setPage(
          data?.page
            ? {
                title: data.page.title as string,
                body: (data.page.body ?? {}) as CmsPageBody,
              }
            : null,
        ),
      )
      .catch(() => active && setPage(null))
    return () => {
      active = false
    }
  }, [slug])
  if (page === undefined) {
    return (
      <div className="page-wrap simple-page">
        <p className="empty-copy">Loading…</p>
      </div>
    )
  }
  if (page === null) {
    return (
      <SimplePage
        title="This page is being stocked"
        body="The page you are looking for is not available yet. Our main shop is open and ready."
      />
    )
  }
  return (
    <div className="editorial-page">
      <section>
        {page.body.eyebrow && (
          <span className="eyebrow">{page.body.eyebrow}</span>
        )}
        <h1>{page.title}</h1>
        {page.body.copy && <p>{page.body.copy}</p>}
        {page.body.sections?.map((section, index) => (
          <div className="editorial-section" key={index}>
            {section.heading && <h2>{section.heading}</h2>}
            {section.body && <p>{section.body}</p>}
          </div>
        ))}
      </section>
      <aside>
        <span>Henry's Liquor Hub</span>
        <p>
          Responsible retailing, expert recommendations and delivery you can
          rely on.
        </p>
        <Link to="/contact" className="inline-link">
          Speak to our team <ArrowRight />
        </Link>
      </aside>
    </div>
  )
}

function SimplePage({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="page-wrap simple-page">
      <span className="eyebrow">Henry's Liquor Hub</span>
      <h1>{title}</h1>
      <p>{body}</p>
      <Link to="/shop" className="button button-dark">
        Browse the collection
      </Link>
    </div>
  )
}

function LoginPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<"customer" | "staff">("customer")
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="auth-page">
      <section className="auth-aside">
        <span className="eyebrow light">Henry's Liquor Hub</span>
        <h1>
          Good bottles,
          <br />
          within reach.
        </h1>
        <p>
          Sign in to manage your orders, saved bottles, addresses and delivery
          updates.
        </p>
        <div className="auth-aside-note">
          <ShieldCheck />
          <span>Age-verified checkout and responsible delivery.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <Link to="/" className="auth-back">
          <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to store
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Welcome back</span>
          <h2>{mode === "staff" ? "Staff access" : "Your account"}</h2>
          <p>
            {mode === "staff"
              ? "Use your authorized staff credentials to access operations."
              : "Enter your details to continue to your account."}
          </p>
          <div className="auth-switch" role="tablist" aria-label="Account type">
            <button
              type="button"
              className={mode === "customer" ? "active" : ""}
              onClick={() => setMode("customer")}
            >
              Customer
            </button>
            <button
              type="button"
              className={mode === "staff" ? "active" : ""}
              onClick={() => setMode("staff")}
            >
              Staff
            </button>
          </div>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setSubmitting(true)
              setError(null)
              setMessage(null)
              const values = new FormData(event.currentTarget)
              const response = await fetch("/api/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  email: values.get("email"),
                  password: values.get("password"),
                }),
              })
              const data = await response.json().catch(() => null)
              setSubmitting(false)
              if (!response.ok) {
                setError(
                  data?.error ?? "We could not sign you in. Please try again.",
                )
                return
              }
              sessionStorage.setItem("henrys-session", data.token)
              const staff = data.user.role !== "customer"
              const destination =
                sessionStorage.getItem("henrys-return-to") ??
                (staff ? "/admin" : "/account")
              sessionStorage.removeItem("henrys-return-to")
              setMessage(
                staff
                  ? "Signed in successfully. Opening the console…"
                  : "Signed in successfully. Opening your account…",
              )
              setTimeout(() => navigate(destination), 500)
            }}
          >
            <label>
              Email address
              <input
                required
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@email.com"
              />
            </label>
            <label>
              Password
              <input
                required
                name="password"
                type="password"
                autoComplete="current-password"
                placeholder="Enter your password"
              />
            </label>
            <div className="auth-form-row">
              <label className="remember">
                <input type="checkbox" /> Remember me
              </label>
              <Link to="/forgot-password" className="text-button">
                Forgot password?
              </Link>
            </div>
            {message && (
              <div className="form-message">
                <CheckCircle /> {message}
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <button
              type="submit"
              className="button button-dark button-wide"
              disabled={submitting}
            >
              {submitting ? "Signing in…" : "Sign in"} <ArrowRight />
            </button>
          </form>
          {mode === "staff" && (
            <p className="auth-register">
              Staff accounts are provisioned by an administrator.{" "}
              <Link to="/register">Need a customer account?</Link>
            </p>
          )}
          {mode === "customer" && (
            <p className="auth-register">
              New to Henry's? <Link to="/register">Create an account</Link>
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

function RegisterPage() {
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="auth-page">
      <section className="auth-aside">
        <span className="eyebrow light">Henry's Liquor Hub</span>
        <h1>
          Good bottles,
          <br />
          within reach.
        </h1>
        <p>
          Create an account to save your favourite bottles, track delivery and
          make checkout effortless.
        </p>
        <div className="auth-aside-note">
          <ShieldCheck />
          <span>Age-verified checkout and responsible delivery.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <Link to="/" className="auth-back">
          <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to store
        </Link>
        <div className="auth-form register-form">
          <span className="eyebrow">Customer account</span>
          <h2>Create an account</h2>
          <p>
            Join Henry's for considered recommendations and a seamless ordering
            experience.
          </p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setSubmitting(true)
              setError(null)
              setMessage(null)
              const values = new FormData(event.currentTarget)
              const response = await fetch("/api/auth/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  name: values.get("name"),
                  email: values.get("email"),
                  phone: values.get("phone"),
                  password: values.get("password"),
                  confirmPassword: values.get("confirmPassword"),
                  legalAgeConfirmed: values.get("legalAgeConfirmed") === "on",
                  termsAccepted: values.get("termsAccepted") === "on",
                }),
              })
              const data = await response.json()
              setSubmitting(false)
              if (!response.ok) {
                setError(
                  data.error ??
                    "We could not create your account. Please check your details and try again.",
                )
                return
              }
              setMessage(data.message)
              event.currentTarget.reset()
            }}
          >
            <div className="register-fields">
              <label>
                Full name
                <input
                  required
                  name="name"
                  autoComplete="name"
                  placeholder="Your full name"
                />
              </label>
              <label>
                Email address
                <input
                  required
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@email.com"
                />
              </label>
              <label>
                Phone number
                <input
                  required
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="+254 7XX XXX XXX"
                />
              </label>
              <label>
                Password
                <input
                  required
                  name="password"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="At least 12 characters"
                />
              </label>
              <label>
                Confirm password
                <input
                  required
                  name="confirmPassword"
                  type="password"
                  minLength={12}
                  autoComplete="new-password"
                  placeholder="Repeat password"
                />
              </label>
            </div>
            <label className="auth-consent">
              <input required name="legalAgeConfirmed" type="checkbox" /> I
              confirm that I am 18 or older.
            </label>
            <label className="auth-consent">
              <input required name="termsAccepted" type="checkbox" /> I agree to
              the Terms and Privacy Policy.
            </label>
            {message && (
              <div className="form-message">
                <CheckCircle /> {message}
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <button
              type="submit"
              className="button button-dark button-wide"
              disabled={submitting}
            >
              {submitting ? "Creating account…" : "Create account"}{" "}
              <ArrowRight />
            </button>
          </form>
          <p className="auth-register">
            Already have an account? <Link to="/login">Sign in</Link>
          </p>
        </div>
      </section>
    </div>
  )
}

function signOutCustomer(navigate: (to: string) => void) {
  clearSession()
  navigate("/login")
}

function AccountPage() {
  const claims = getSessionClaims()
  const [tab, setTab] = useState("Overview")
  const navigate = useNavigate()
  const [overview, setOverview] = useState<{
    orders: {
      order_number: string
      status: string
      payment_status: string
      payment_method: string
      delivery_type: string
      delivery_address: {
        phone?: string
        address?: string
        area?: string
      } | null
      customer_note: string | null
      total_kes: number
      placed_at: string
    }[]
    bookings: {
      booking_number: string
      event_type: string
      status: string
      event_date: string
      location: string | null
    }[]
    wishlistCount: number
    notificationCount: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState("")
  const [editingOrder, setEditingOrder] = useState<string | null>(null)
  const [orderForm, setOrderForm] = useState({
    phone: "",
    address: "",
    area: "",
    notes: "",
  })
  const [orderSaving, setOrderSaving] = useState(false)
  const [orderBusy, setOrderBusy] = useState<string | null>(null)
  const [orderActionError, setOrderActionError] = useState("")

  const EDITABLE_ORDER_STATUSES = [
    "pending_payment",
    "payment_confirmed",
    "confirmed",
    "preparing",
    "ready",
  ]

  async function loadOverview() {
    const token = getSessionToken()
    if (!token) {
      setLoadError("Sign in to view your account activity.")
      setIsLoading(false)
      return
    }
    try {
      const response = await fetch("/api/account/overview", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error("We could not load your account.")
      setOverview(await response.json())
      setLoadError("")
    } catch (error: unknown) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "We could not load your account.",
      )
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    void loadOverview()
  }, [])

  function openOrderEdit(order: NonNullable<typeof overview>["orders"][number]) {
    setOrderActionError("")
    setEditingOrder(order.order_number)
    setOrderForm({
      phone: order.delivery_address?.phone ?? "",
      address: order.delivery_address?.address ?? "",
      area: order.delivery_address?.area ?? "",
      notes: order.customer_note ?? "",
    })
  }

  async function cancelOrder(orderNumber: string) {
    if (!window.confirm(`Cancel order ${orderNumber}? This cannot be undone.`))
      return
    setOrderBusy(orderNumber)
    setOrderActionError("")
    try {
      const response = await fetch(`/api/orders/${orderNumber}/cancel`, {
        method: "POST",
        headers: authHeaders(),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not cancel this order.")
      window.dispatchEvent(new Event("henrys:notifications-check"))
      await loadOverview()
    } catch (error: unknown) {
      setOrderActionError(
        error instanceof Error ? error.message : "We could not cancel this order.",
      )
    } finally {
      setOrderBusy(null)
    }
  }

  async function saveOrderEdit(event: React.FormEvent) {
    event.preventDefault()
    if (!editingOrder) return
    setOrderSaving(true)
    setOrderActionError("")
    try {
      const response = await fetch(`/api/orders/${editingOrder}`, {
        method: "PATCH",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          phone: orderForm.phone,
          address: orderForm.address,
          area: orderForm.area,
          notes: orderForm.notes || null,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not save these changes.")
      setEditingOrder(null)
      await loadOverview()
    } catch (error: unknown) {
      setOrderActionError(
        error instanceof Error
          ? error.message
          : "We could not save these changes.",
      )
    } finally {
      setOrderSaving(false)
    }
  }

  useEffect(() => {
    if (getSessionToken()) void loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tabs = [
    "Overview",
    "Orders",
    "Bookings",
    "Wishlist",
    "Addresses",
    "Profile",
    "Notifications",
    "Support",
    "Security",
  ]

  const [wishlist, setWishlist] = useState<
    {
      id: string
      name: string
      slug: string
      brand: string
      variants: Array<{ id: string; volumeMl: number; priceKes: number; stock: number }>
      primary_image: string | null
    }[]
  >([])
  const [notifications, setNotifications] = useState<
    {
      id: string
      channel: string
      template_key: string
      payload: Record<string, unknown>
      is_read: boolean
      created_at: string
    }[]
  >([])
  const [tickets, setTickets] = useState<
    {
      id: string
      ticket_number: string
      subject: string
      category: string
      status: string
      created_at: string
      message_count: number
      last_message: string | null
    }[]
  >([])
  const [openTicket, setOpenTicket] = useState<string | null>(null)
  const [ticketMessages, setTicketMessages] = useState<
    { id: string; body: string; author_role: string; created_at: string }[]
  >([])
  const [ticketForm, setTicketForm] = useState({
    subject: "",
    category: "order",
    message: "",
  })
  const [ticketReply, setTicketReply] = useState("")
  const [accountMessage, setAccountMessage] = useState("")

  type ProfileRow = {
    email: string
    firstName: string
    lastName: string
    phone: string | null
    role: string
    emailVerified: boolean
    createdAt: string
  }
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [profileForm, setProfileForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  })
  const [profileMessage, setProfileMessage] = useState("")
  const [profileError, setProfileError] = useState("")
  const [savingProfile, setSavingProfile] = useState(false)

  const [addresses, setAddresses] = useState<
    {
      id: string
      label: string
      recipient_name: string
      phone: string
      address_line_1: string
      address_line_2: string | null
      zone_id: string | null
      zone_name: string | null
      fee_kes: number | null
      is_default: boolean
    }[]
  >([])
  const [zones, setZones] = useState<
    { id: string; name: string; fee_kes: number; minimum_order_kes: number; estimated_minutes: number }[]
  >([])
  const [addressForm, setAddressForm] = useState({
    label: "",
    recipientName: "",
    phone: "",
    addressLine1: "",
    addressLine2: "",
    zoneId: "",
    isDefault: false,
  })
  const [addressMessage, setAddressMessage] = useState("")

  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  })
  const [passwordMessage, setPasswordMessage] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [loginHistory, setLoginHistory] = useState<
    { created_at: string; ip_address: string | null; succeeded: boolean }[]
  >([])

  async function loadProfile() {
    const data = await fetch("/api/auth/me", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    if (data?.user) {
      setProfile(data.user)
      setProfileForm({
        firstName: data.user.firstName ?? "",
        lastName: data.user.lastName ?? "",
        phone: data.user.phone ?? "",
      })
    }
  }

  async function loadAddresses() {
    const data = await fetch("/api/account/addresses", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    if (data) {
      setAddresses(data.addresses ?? [])
      setZones(data.zones ?? [])
    }
  }

  async function loadLoginHistory() {
    const data = await fetch("/api/auth/login-history", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
    if (data) setLoginHistory(data.attempts ?? [])
  }

  useEffect(() => {
    if (tab === "Wishlist" && getSessionToken()) {
      fetch("/api/wishlist", { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setWishlist(data.items))
        .catch(() => undefined)
    }
    if (tab === "Notifications" && getSessionToken()) {
      fetch("/api/notifications", { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setNotifications(data.notifications))
        .catch(() => undefined)
    }
    if (tab === "Support" && getSessionToken()) {
      fetch("/api/support", { headers: authHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => data && setTickets(data.tickets))
        .catch(() => undefined)
    }
    if (tab === "Profile" && getSessionToken()) void loadProfile()
    if (tab === "Addresses" && getSessionToken()) void loadAddresses()
    if (tab === "Security" && getSessionToken()) void loadLoginHistory()
  }, [tab, overview])

  async function refreshOverview() {
    const token = getSessionToken()
    if (!token) return
    const response = await fetch("/api/account/overview", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (response.ok) setOverview(await response.json())
  }

  const renderWishlist = () => {
    if (loadError) return <p>{loadError}</p>
    if (!wishlist.length)
      return (
        <div className="empty-state">
          <Heart />
          <h2>No saved bottles yet</h2>
          <p>Tap the heart on any product to keep it here for later.</p>
          <Link to="/shop" className="button button-dark">
            Browse the shop
          </Link>
        </div>
      )
    return wishlist.map((item) => {
      const variant = item.variants[0]
      return (
        <div className="account-order" key={item.id}>
          <div>
            <strong>{item.name}</strong>
            <span>
              {item.brand} · {variant ? `${variant.volumeMl}ml` : ""}
            </span>
          </div>
          <strong>{variant ? formatPrice(variant.priceKes) : ""}</strong>
          <Link to={`/products/${item.id}`}>View</Link>
          <button
            type="button"
            onClick={async () => {
              await fetch(`/api/wishlist?productId=${item.id}`, {
                method: "DELETE",
                headers: authHeaders(),
              })
              setWishlist((current) => current.filter((w) => w.id !== item.id))
              refreshOverview()
            }}
          >
            Remove
          </button>
        </div>
      )
    })
  }

  const notificationCopy: Record<string, string> = {
    "order-created": "Order placed",
    "order-confirmed": "Order confirmed",
    "order-preparing": "Order being prepared",
    "order-out_for_delivery": "Out for delivery",
    "order-delivered": "Order delivered",
    "order-cancelled": "Order cancelled",
    "order-status": "Order update",
    "support-reply": "Support replied to your ticket",
    "password-reset": "Password reset requested",
    "password-changed": "Password changed",
    "verify-email": "Email verification",
  }

  const renderNotifications = () => {
    if (!notifications.length)
      return (
        <div className="empty-state">
          <Bell />
          <h2>No notifications yet</h2>
          <p>Order, delivery and support updates will appear here.</p>
        </div>
      )
    return (
      <>
        <button
          type="button"
          className="button button-outline"
          onClick={async () => {
            await fetch("/api/notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json", ...authHeaders() },
              body: JSON.stringify({ markAll: true }),
            })
            setNotifications((current) =>
              current.map((n) => ({ ...n, is_read: true })),
            )
          }}
        >
          Mark all as read
        </button>
        {notifications.map((n) => (
          <div
            key={n.id}
            className={n.is_read ? "account-order" : "account-order is-unread"}
          >
            <div>
              <strong>{notificationCopy[n.template_key] ?? n.template_key}</strong>
              <span>
                {new Date(n.created_at).toLocaleString("en-KE", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {n.payload?.orderNumber
                  ? ` · ${String(n.payload.orderNumber)}`
                  : ""}
                {typeof n.payload?.totalKes === "number"
                  ? ` · ${formatPrice(n.payload.totalKes)}`
                  : ""}
              </span>
              {typeof n.payload?.message === "string" && (
                <span>{String(n.payload.message)}</span>
              )}
            </div>
            {!n.is_read && (
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/notifications", {
                    method: "PATCH",
                    headers: {
                      "Content-Type": "application/json",
                      ...authHeaders(),
                    },
                    body: JSON.stringify({ id: n.id }),
                  })
                  setNotifications((current) =>
                    current.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)),
                  )
                }}
              >
                Mark read
              </button>
            )}
          </div>
        ))}
      </>
    )
  }

  const openTicketThread = async (ticketId: string) => {
    if (openTicket === ticketId) {
      setOpenTicket(null)
      return
    }
    setOpenTicket(ticketId)
    setTicketReply("")
    const response = await fetch(`/api/support/${ticketId}`, {
      headers: authHeaders(),
    })
    if (response.ok) {
      const data = await response.json()
      setTicketMessages(data.messages)
    }
  }

  const renderSupport = () => (
    <>
      <form
        className="support-create-form"
        onSubmit={async (event) => {
          event.preventDefault()
          const response = await fetch("/api/support", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(ticketForm),
          })
          if (response.ok) {
            setTicketForm({ subject: "", category: "order", message: "" })
            setAccountMessage("Ticket created. Our team will reply shortly.")
            const data = await response.json()
            setTickets((current) => [data.ticket, ...current])
          } else {
            const data = await response.json().catch(() => null)
            setAccountMessage(data?.error ?? "We could not create your ticket.")
          }
        }}
      >
        <h2>Open a support ticket</h2>
        {accountMessage && <p className="review-form-message">{accountMessage}</p>}
        <label>
          Subject
          <input
            required
            minLength={3}
            value={ticketForm.subject}
            onChange={(e) =>
              setTicketForm({ ...ticketForm, subject: e.target.value })
            }
          />
        </label>
        <label>
          Category
          <select
            value={ticketForm.category}
            onChange={(e) =>
              setTicketForm({ ...ticketForm, category: e.target.value })
            }
          >
            <option value="order">Order</option>
            <option value="delivery">Delivery</option>
            <option value="payment">Payment</option>
            <option value="product">Product</option>
            <option value="account">Account</option>
            <option value="bulk_order">Bulk order</option>
            <option value="other">Other</option>
          </select>
        </label>
        <label>
          How can we help?
          <textarea
            required
            minLength={3}
            rows={3}
            value={ticketForm.message}
            onChange={(e) =>
              setTicketForm({ ...ticketForm, message: e.target.value })
            }
          />
        </label>
        <button type="submit" className="button button-dark">
          Submit ticket
        </button>
      </form>
      {!tickets.length ? (
        <div className="empty-state">
          <Phone />
          <h2>No support tickets</h2>
          <p>Need a hand with an order or booking? Open a ticket above.</p>
        </div>
      ) : (
        tickets.map((ticket) => (
          <div className="account-card support-ticket" key={ticket.id}>
            <div className="account-order">
              <div>
                <strong>{ticket.subject}</strong>
                <span>
                  {ticket.ticket_number} · {ticket.category.replace(/_/g, " ")}
                </span>
              </div>
              <span className={`status status-${ticket.status}`}>
                {ticket.status.replace(/_/g, " ")}
              </span>
              <button type="button" onClick={() => openTicketThread(ticket.id)}>
                {openTicket === ticket.id ? "Hide" : `View (${ticket.message_count})`}
              </button>
            </div>
            {openTicket === ticket.id && (
              <div className="support-thread">
                {ticketMessages.map((message) => (
                  <div
                    key={message.id}
                    className={
                      message.author_role === "customer"
                        ? "support-message is-customer"
                        : "support-message is-staff"
                    }
                  >
                    <p>{message.body}</p>
                    <small>
                      {message.author_role === "customer"
                        ? "You"
                        : "Henry's team"}{" "}
                      ·{" "}
                      {new Date(message.created_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </small>
                  </div>
                ))}
                {ticket.status !== "closed" && (
                  <form
                    className="support-reply-form"
                    onSubmit={async (event) => {
                      event.preventDefault()
                      if (!ticketReply.trim()) return
                      const response = await fetch(
                        `/api/support/${ticket.id}`,
                        {
                          method: "POST",
                          headers: {
                            "Content-Type": "application/json",
                            ...authHeaders(),
                          },
                          body: JSON.stringify({ body: ticketReply.trim() }),
                        },
                      )
                      if (response.ok) {
                        setTicketReply("")
                        const refreshed = await fetch(
                          `/api/support/${ticket.id}`,
                          { headers: authHeaders() },
                        ).then((r) => r.json())
                        setTicketMessages(refreshed.messages)
                      }
                    }}
                  >
                    <input
                      value={ticketReply}
                      onChange={(e) => setTicketReply(e.target.value)}
                      placeholder="Write a reply…"
                    />
                    <button type="submit" className="button button-dark">
                      Reply
                    </button>
                  </form>
                )}
                <button
                  type="button"
                  className="text-button"
                  onClick={async () => {
                    await fetch(`/api/support/${ticket.id}`, {
                      method: "PATCH",
                      headers: {
                        "Content-Type": "application/json",
                        ...authHeaders(),
                      },
                      body: JSON.stringify({
                        action: ticket.status === "closed" ? "reopen" : "close",
                      }),
                    })
                    const data = await fetch("/api/support", {
                      headers: authHeaders(),
                    }).then((r) => r.json())
                    setTickets(data.tickets)
                    setOpenTicket(null)
                  }}
                >
                  {ticket.status === "closed" ? "Reopen ticket" : "Close ticket"}
                </button>
              </div>
            )}
          </div>
        ))
      )}
    </>
  )

  const renderOrders = () => {
    if (isLoading) return <p>Loading your order history…</p>
    if (loadError) return <p>{loadError}</p>
    if (!overview?.orders.length)
      return <p>No orders yet. Your completed purchases will appear here.</p>

    return (
      <>
        {orderActionError && (
          <p className="form-error">{orderActionError}</p>
        )}
        {overview.orders.map((order) => {
          const editable = EDITABLE_ORDER_STATUSES.includes(order.status)
          return (
            <div className="account-order" key={order.order_number}>
              <div>
                <strong>{order.order_number}</strong>
                <span>
                  Placed{" "}
                  {new Date(order.placed_at).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
              <span className={`status status-${order.status.replace(/_/g, "-")}`}>
                {order.status.replace(/_/g, " ")}
              </span>
              <strong>{formatPrice(order.total_kes)}</strong>
              <div className="account-order-actions">
                {editable && (
                  <>
                    <button
                      type="button"
                      onClick={() => openOrderEdit(order)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger-link"
                      disabled={orderBusy === order.order_number}
                      onClick={() => cancelOrder(order.order_number)}
                    >
                      {orderBusy === order.order_number
                        ? "Cancelling…"
                        : "Cancel"}
                    </button>
                  </>
                )}
                <Link to={`/track?order=${order.order_number}`}>Track</Link>
              </div>
            </div>
          )
        })}
        {editingOrder && (
          <div
            className="modal-overlay"
            role="dialog"
            aria-modal="true"
            onClick={() => setEditingOrder(null)}
          >
            <form
              className="product-modal order-edit-modal"
              onClick={(e) => e.stopPropagation()}
              onSubmit={saveOrderEdit}
            >
              <div className="modal-head">
                <div>
                  <span className="eyebrow">Edit order</span>
                  <h2>#{editingOrder}</h2>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setEditingOrder(null)}
                >
                  <X />
                </button>
              </div>
              {orderActionError && (
                <div className="form-error">{orderActionError}</div>
              )}
              <div className="co-fields">
                <label className="co-label span-2">
                  Phone number we can call
                  <input
                    required
                    value={orderForm.phone}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, phone: e.target.value })
                    }
                  />
                </label>
                <label className="co-label span-2">
                  Delivery location
                  <input
                    required
                    value={orderForm.address}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, address: e.target.value })
                    }
                  />
                </label>
                <label className="co-label span-2">
                  Nairobi area
                  <input
                    required
                    value={orderForm.area}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, area: e.target.value })
                    }
                  />
                </label>
                <label className="co-label span-2">
                  Notes (optional)
                  <textarea
                    rows={3}
                    value={orderForm.notes}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, notes: e.target.value })
                    }
                    placeholder="Gate code, landmark, timing…"
                  />
                </label>
              </div>
              <div className="co-actions">
                <button
                  type="submit"
                  className="button button-dark button-wide"
                  disabled={orderSaving}
                >
                  {orderSaving ? "Saving…" : "Save changes"}
                </button>
              </div>
            </form>
          </div>
        )}
      </>
    )
  }

  const renderBookings = () => {
    if (isLoading) return <p>Loading your event bookings…</p>
    if (loadError) return <p>{loadError}</p>
    if (!overview?.bookings.length)
      return <p>No event bookings yet. Your upcoming occasions will appear here.</p>

    return overview.bookings.map((booking) => (
      <div className="account-order account-booking" key={booking.booking_number}>
        <div>
          <strong>{booking.event_type}</strong>
          <span>{booking.booking_number}</span>
        </div>
        <span
          className={`status status-${booking.status.replace(/_/g, "-")}`}
        >
          {booking.status.replace(/_/g, " ")}
        </span>
        <div>
          <strong>
            {new Date(booking.event_date).toLocaleDateString("en-KE", {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </strong>
          {booking.location && <span>{booking.location}</span>}
        </div>
      </div>
    ))
  }

  const renderAddresses = () => (
    <>
      <form
        className="support-create-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setAddressMessage("")
          const response = await fetch("/api/account/addresses", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              ...addressForm,
              addressLine2: addressForm.addressLine2 || undefined,
              zoneId: addressForm.zoneId || null,
            }),
          })
          const data = await response.json().catch(() => null)
          if (!response.ok) {
            setAddressMessage(data?.error ?? "We could not save that address.")
            return
          }
          setAddresses(data.addresses ?? [])
          setAddressForm({
            label: "",
            recipientName: "",
            phone: "",
            addressLine1: "",
            addressLine2: "",
            zoneId: "",
            isDefault: false,
          })
          setAddressMessage("Address saved.")
        }}
      >
        <h2>Add a delivery address</h2>
        {addressMessage && (
          <p className="review-form-message">{addressMessage}</p>
        )}
        <label>
          Label
          <input
            required
            minLength={2}
            placeholder="Home, office…"
            value={addressForm.label}
            onChange={(e) =>
              setAddressForm({ ...addressForm, label: e.target.value })
            }
          />
        </label>
        <label>
          Recipient name
          <input
            required
            minLength={2}
            value={addressForm.recipientName}
            onChange={(e) =>
              setAddressForm({ ...addressForm, recipientName: e.target.value })
            }
          />
        </label>
        <label>
          Phone
          <input
            required
            minLength={8}
            placeholder="+2547…"
            value={addressForm.phone}
            onChange={(e) =>
              setAddressForm({ ...addressForm, phone: e.target.value })
            }
          />
        </label>
        <label>
          Street / estate
          <input
            required
            minLength={4}
            value={addressForm.addressLine1}
            onChange={(e) =>
              setAddressForm({ ...addressForm, addressLine1: e.target.value })
            }
          />
        </label>
        <label>
          Apartment, floor, landmark
          <input
            value={addressForm.addressLine2}
            onChange={(e) =>
              setAddressForm({ ...addressForm, addressLine2: e.target.value })
            }
          />
        </label>
        <label>
          Delivery zone
          <select
            value={addressForm.zoneId}
            onChange={(e) =>
              setAddressForm({ ...addressForm, zoneId: e.target.value })
            }
          >
            <option value="">Not sure yet</option>
            {zones.map((zone) => (
              <option key={zone.id} value={zone.id}>
                {zone.name} — KES {zone.fee_kes}
              </option>
            ))}
          </select>
        </label>
        <label className="remember">
          <input
            type="checkbox"
            checked={addressForm.isDefault}
            onChange={(e) =>
              setAddressForm({ ...addressForm, isDefault: e.target.checked })
            }
          />{" "}
          Use as my default address
        </label>
        <button type="submit" className="button button-dark">
          Save address
        </button>
      </form>
      {!addresses.length ? (
        <div className="empty-state">
          <MapPin />
          <h2>No saved addresses</h2>
          <p>Add one above and checkout will offer it at the next order.</p>
        </div>
      ) : (
        addresses.map((address) => (
          <div className="account-card address-card" key={address.id}>
            <div className="account-order">
              <div>
                <strong>
                  {address.label}
                  {address.is_default ? " · Default" : ""}
                </strong>
                <span>
                  {address.recipient_name} · {address.phone}
                </span>
                <span>
                  {address.address_line_1}
                  {address.address_line_2 ? `, ${address.address_line_2}` : ""}
                  {address.zone_name ? ` · ${address.zone_name}` : ""}
                </span>
              </div>
              {!address.is_default && (
                <button
                  type="button"
                  onClick={async () => {
                    const response = await fetch(
                      `/api/account/addresses/${address.id}`,
                      {
                        method: "PATCH",
                        headers: {
                          "Content-Type": "application/json",
                          ...authHeaders(),
                        },
                        body: JSON.stringify({ isDefault: true }),
                      },
                    )
                    const data = await response.json().catch(() => null)
                    if (data?.addresses) setAddresses(data.addresses)
                  }}
                >
                  Make default
                </button>
              )}
              <button
                type="button"
                onClick={async () => {
                  const response = await fetch(
                    `/api/account/addresses/${address.id}`,
                    { method: "DELETE", headers: authHeaders() },
                  )
                  const data = await response.json().catch(() => null)
                  if (data?.addresses) setAddresses(data.addresses)
                }}
              >
                Remove
              </button>
            </div>
          </div>
        ))
      )}
    </>
  )

  const renderProfile = () => (
    <form
      className="support-create-form"
      onSubmit={async (event) => {
        event.preventDefault()
        setSavingProfile(true)
        setProfileError("")
        setProfileMessage("")
        const response = await fetch("/api/account/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(profileForm),
        })
        const data = await response.json().catch(() => null)
        setSavingProfile(false)
        if (!response.ok) {
          setProfileError(data?.error ?? "We could not update your profile.")
          return
        }
        setProfileMessage("Profile updated.")
        void loadProfile()
        void refreshOverview()
      }}
    >
      <h2>Your details</h2>
      {profileError && <div className="form-error">{profileError}</div>}
      {profileMessage && (
        <div className="form-message">{profileMessage}</div>
      )}
      <label>
        First name
        <input
          required
          minLength={2}
          value={profileForm.firstName}
          onChange={(e) =>
            setProfileForm({ ...profileForm, firstName: e.target.value })
          }
        />
      </label>
      <label>
        Last name
        <input
          required
          minLength={2}
          value={profileForm.lastName}
          onChange={(e) =>
            setProfileForm({ ...profileForm, lastName: e.target.value })
          }
        />
      </label>
      <label>
        Phone
        <input
          required
          minLength={8}
          value={profileForm.phone}
          onChange={(e) =>
            setProfileForm({ ...profileForm, phone: e.target.value })
          }
        />
      </label>
      <button
        type="submit"
        className="button button-dark"
        disabled={savingProfile}
      >
        {savingProfile ? "Saving…" : "Save changes"}
      </button>
      {profile && (
        <div className="profile-meta">
          <div>
            <span>Email</span>
            <strong>{profile.email}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>
              {profile.emailVerified ? "Verified" : "Not verified"}
            </strong>
          </div>
          <div>
            <span>Member since</span>
            <strong>
              {new Date(profile.createdAt).toLocaleDateString("en-KE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </strong>
          </div>
        </div>
      )}
    </form>
  )

  const renderSecurity = () => (
    <>
      <form
        className="support-create-form"
        onSubmit={async (event) => {
          event.preventDefault()
          setPasswordError("")
          setPasswordMessage("")
          const response = await fetch("/api/auth/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(passwordForm),
          })
          const data = await response.json().catch(() => null)
          if (!response.ok) {
            setPasswordError(
              data?.error ?? "We could not change your password.",
            )
            return
          }
          setPasswordForm({
            currentPassword: "",
            newPassword: "",
            confirmPassword: "",
          })
          setPasswordMessage("Password changed. Use it the next time you sign in.")
          void loadLoginHistory()
        }}
      >
        <h2>Change password</h2>
        {passwordError && <div className="form-error">{passwordError}</div>}
        {passwordMessage && (
          <div className="form-message">{passwordMessage}</div>
        )}
        <label>
          Current password
          <input
            required
            type="password"
            autoComplete="current-password"
            value={passwordForm.currentPassword}
            onChange={(e) =>
              setPasswordForm({
                ...passwordForm,
                currentPassword: e.target.value,
              })
            }
          />
        </label>
        <label>
          New password
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={passwordForm.newPassword}
            onChange={(e) =>
              setPasswordForm({ ...passwordForm, newPassword: e.target.value })
            }
          />
        </label>
        <label>
          Confirm new password
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={passwordForm.confirmPassword}
            onChange={(e) =>
              setPasswordForm({
                ...passwordForm,
                confirmPassword: e.target.value,
              })
            }
          />
        </label>
        <p className="section-copy">
          Use at least 12 characters. We hash and salt every password, and never
          store it in plain text.
        </p>
        <button type="submit" className="button button-dark">
          Update password
        </button>
      </form>
      <div className="account-card">
        <span className="eyebrow">Sign-in activity</span>
        <h2>Recent sign-ins</h2>
        {!loginHistory.length ? (
          <p>No sign-ins recorded yet.</p>
        ) : (
          loginHistory.map((attempt, index) => (
            <div className="account-order" key={`${attempt.created_at}-${index}`}>
              <div>
                <strong>
                  {new Date(attempt.created_at).toLocaleString("en-KE", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </strong>
                <span>{attempt.ip_address ?? "Unknown device"}</span>
              </div>
              <span
                className={`status status-${attempt.succeeded ? "delivered" : "failed"}`}
              >
                {attempt.succeeded ? "Success" : "Failed"}
              </span>
            </div>
          ))
        )}
        <p className="section-copy">
          Not you? Change your password above and tell us through the Support
          tab.
        </p>
      </div>
    </>
  )

  const unavailableTab = (
    <div className="account-card account-unavailable">
      <span className="eyebrow">{tab}</span>
      <h2>{tab} is coming soon</h2>
      <p>
        We are preparing this section of your account. Your {tab.toLowerCase()}{" "}
        will be available here when the feature launches.
      </p>
      <span className="account-unavailable-label">Feature in development</span>
    </div>
  )

  if (!claims) {
    sessionStorage.setItem("henrys-return-to", "/account")
    return <Navigate to="/login" replace />
  }

  const greeting = profile
    ? `Good to see you, ${profile.firstName}.`
    : "Good to see you."

  return (
    <div className="account-page page-wrap">
      <div className="account-heading flex justify-between items-start">
        <div>
          <span className="eyebrow">Your account</span>
          <h1>{greeting}</h1>
          <p>
            Keep track of your bottles, deliveries and account preferences in one
            place. Signed in as {claims.email}.{" "}
            {isStaffRole(claims.role) ? (
              <Link to="/admin" className="text-button">
                Open the staff console
              </Link>
            ) : null}
          </p>
        </div>
        <button
          type="button"
          className="button button-outline"
          onClick={() => signOutCustomer(navigate)}
        >
          <LogOut size={16} /> Sign out
        </button>
      </div>
      <div className="account-layout">
        <aside>
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
          <button
            type="button"
            onClick={() => signOutCustomer(navigate)}
          >
            <LogOut size={14} /> Sign out
          </button>
        </aside>
        <section className="account-content">
          {tab === "Overview" ? (
            <>
              <div className="account-metrics">
                <article>
                  <span>Orders placed</span>
                  <strong>{overview?.orders.length ?? 0}</strong>
                </article>
                <article>
                  <span>Saved bottles</span>
                  <strong>{overview?.wishlistCount ?? 0}</strong>
                </article>
                <article>
                  <span>Event bookings</span>
                  <strong>{overview?.bookings.length ?? 0}</strong>
                </article>
                <article>
                  <span>Notifications sent</span>
                  <strong>{overview?.notificationCount ?? 0}</strong>
                </article>
              </div>
              <div className="account-card">
                <span className="eyebrow">Recent orders</span>
                <h2>Order history</h2>
                {renderOrders()}
              </div>
            </>
          ) : tab === "Orders" ? (
            <div className="account-card">
              <span className="eyebrow">Orders</span>
              <h2>Order history</h2>
              {renderOrders()}
            </div>
          ) : tab === "Bookings" ? (
            <div className="account-card">
              <span className="eyebrow">Bookings</span>
              <h2>Your event bookings</h2>
              {renderBookings()}
            </div>
          ) : tab === "Wishlist" ? (
            <div className="account-card">
              <span className="eyebrow">Wishlist</span>
              <h2>Saved bottles</h2>
              {renderWishlist()}
            </div>
          ) : tab === "Notifications" ? (
            <div className="account-card">
              <span className="eyebrow">Notifications</span>
              <h2>Your updates</h2>
              {renderNotifications()}
            </div>
          ) : tab === "Support" ? (
            <div className="account-card">
              <span className="eyebrow">Support</span>
              {renderSupport()}
            </div>
          ) : tab === "Addresses" ? (
            <div className="account-card">
              <span className="eyebrow">Addresses</span>
              <h2>Delivery addresses</h2>
              {renderAddresses()}
            </div>
          ) : tab === "Profile" ? (
            <div className="account-card">
              <span className="eyebrow">Profile</span>
              {renderProfile()}
            </div>
          ) : tab === "Security" ? (
            <div className="account-card">
              <span className="eyebrow">Security</span>
              {renderSecurity()}
            </div>
          ) : (
            unavailableTab
          )}
        </section>
      </div>
    </div>
  )
}

const ALL_STAFF = [
  "super_admin",
  "manager",
  "sales",
  "inventory",
  "delivery",
  "support",
]
const CATALOGUE_ROLES = ["super_admin", "manager", "sales", "inventory"]
const FINANCE_ROLES = ["super_admin", "manager"]

const adminNav = [
  {
    key: "dashboard",
    path: "",
    label: "Dashboard",
    icon: LayoutDashboard,
    roles: ALL_STAFF,
  },
  {
    key: "products",
    path: "products",
    label: "Products",
    icon: Package,
    roles: CATALOGUE_ROLES,
  },
  {
    key: "categories",
    path: "categories",
    label: "Categories",
    icon: Box,
    roles: CATALOGUE_ROLES,
  },
  {
    key: "brands",
    path: "brands",
    label: "Brands",
    icon: Star,
    roles: CATALOGUE_ROLES,
  },
  {
    key: "inventory",
    path: "inventory",
    label: "Inventory",
    icon: Box,
    roles: CATALOGUE_ROLES,
  },
  {
    key: "orders",
    path: "orders",
    label: "Orders",
    icon: ClipboardList,
    roles: ["super_admin", "manager", "sales", "delivery"],
  },
  {
    key: "bookings",
    path: "bookings",
    label: "Bookings",
    icon: CalendarDays,
    roles: ["super_admin", "manager", "sales"],
  },
  {
    key: "deliveries",
    path: "deliveries",
    label: "Deliveries",
    icon: Truck,
    roles: ["super_admin", "manager", "delivery"],
  },
  {
    key: "customers",
    path: "customers",
    label: "Customers",
    icon: Users,
    roles: ["super_admin", "manager", "sales", "support"],
  },
  {
    key: "promotions",
    path: "promotions",
    label: "Promotions",
    icon: Banknote,
    roles: FINANCE_ROLES,
  },
  {
    key: "reviews",
    path: "reviews",
    label: "Reviews",
    icon: Star,
    roles: ["super_admin", "manager", "support"],
  },
  {
    key: "support",
    path: "support",
    label: "Support",
    icon: Phone,
    roles: ["super_admin", "manager", "support"],
  },
  {
    key: "website",
    path: "website",
    label: "Website",
    icon: LayoutGrid,
    roles: FINANCE_ROLES,
  },
  {
    key: "reports",
    path: "reports",
    label: "Reports",
    icon: BarChart3,
    roles: FINANCE_ROLES,
  },
  {
    key: "notifications",
    path: "notifications",
    label: "Notifications",
    icon: Bell,
    roles: ALL_STAFF,
  },
  {
    key: "staff",
    path: "staff",
    label: "Staff",
    icon: Users,
    roles: FINANCE_ROLES,
  },
  {
    key: "audit",
    path: "audit",
    label: "Audit Logs",
    icon: Eye,
    roles: FINANCE_ROLES,
  },
  {
    key: "settings",
    path: "settings",
    label: "Settings",
    icon: Settings,
    roles: FINANCE_ROLES,
  },
]

function adminSectionForPath(pathname: string) {
  const segment = pathname.split("/").filter(Boolean)[1]?.toLowerCase()
  return adminNav.find((item) => item.path === (segment ?? ""))?.key ?? "dashboard"
}

function ApiState<T>({
  loading,
  error,
  children,
}: {
  loading: boolean
  error: string
  children: React.ReactNode
}) {
  if (loading) return <p className="empty-copy">Loading live data…</p>
  if (error) return <p className="form-error">{error}</p>
  return <>{children}</>
}

function useStaffProfile(claims: SessionClaims | null) {
  const [profile, setProfile] = useState<{
    firstName: string
    lastName: string
    email: string
    role: string
  } | null>(null)
  useEffect(() => {
    if (!claims) return
    let active = true
    fetch("/api/auth/me", { headers: authHeaders() })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (active && data?.user) {
          setProfile({
            firstName: data.user.firstName,
            lastName: data.user.lastName,
            email: data.user.email,
            role: data.user.role,
          })
        }
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [claims])
  return profile
}

type AdminView = "grid" | "list"

const rowCaches = new Map<string, unknown[]>()

function readRowCache<T>(key: string): T[] | null {
  const hit = rowCaches.get(key)
  return hit ? (hit as T[]) : null
}

function writeRowCache<T>(key: string, rows: T[]) {
  rowCaches.set(key, rows)
}

function ViewToggle({
  view,
  onChange,
}: {
  view: AdminView
  onChange: (next: AdminView) => void
}) {
  return (
    <div className="view-toggle" role="group" aria-label="Layout">
      <button
        type="button"
        className={view === "grid" ? "active" : ""}
        aria-label="Grid view"
        onClick={() => onChange("grid")}
      >
        <LayoutGrid />
      </button>
      <button
        type="button"
        className={view === "list" ? "active" : ""}
        aria-label="List view"
        onClick={() => onChange("list")}
      >
        <List />
      </button>
    </div>
  )
}

type MediaAssetRow = {
  id: string
  public_url: string
  alt_text: string | null
  used_by: string | null
}

function ImagePicker({
  value,
  onPick,
}: {
  value: string
  onPick: (asset: { id: string; url: string }) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [library, setLibrary] = useState<MediaAssetRow[] | null>(null)
  const [error, setError] = useState("")

  async function upload(file: File) {
    setUploading(true)
    setError("")
    try {
      const body = new FormData()
      body.append("file", file)
      const response = await fetch("/api/upload", {
        method: "POST",
        headers: authHeaders(),
        body,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not upload that image.")
      rowCaches.delete("media")
      onPick({ id: data.media.id, url: data.media.url })
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "We could not upload that image.",
      )
    } finally {
      setUploading(false)
    }
  }

  function openLibrary() {
    const next = !showLibrary
    setShowLibrary(next)
    if (next && library === null) {
      const cached = readRowCache<MediaAssetRow>("media")
      if (cached) {
        setLibrary(cached)
        return
      }
      fetch("/api/admin/media", { headers: authHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { media?: MediaAssetRow[] } | null) => {
          const rows = data?.media ?? []
          writeRowCache("media", rows)
          setLibrary(rows)
        })
        .catch(() => setLibrary([]))
    }
  }

  return (
    <div className="image-picker">
      <div className="image-picker-preview">
        {value ? (
          <img src={value} alt="Selected" />
        ) : (
          <span>No image selected</span>
        )}
      </div>
      <div className="image-picker-actions">
        <label className="button button-outline image-upload">
          <UploadCloud />
          {uploading ? "Uploading…" : "Upload image"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void upload(file)
              event.target.value = ""
            }}
          />
        </label>
        <button type="button" className="text-button" onClick={openLibrary}>
          {showLibrary ? "Hide library" : "Choose from library"}
        </button>
      </div>
      {error && <p className="form-error">{error}</p>}
      {showLibrary && (
        <div className="image-library">
          {library === null ? (
            <p>Loading library…</p>
          ) : library.length === 0 ? (
            <p>No images uploaded yet. Use the button above.</p>
          ) : (
            library.map((asset) => (
              <button
                type="button"
                key={asset.id}
                className={
                  value === asset.public_url
                    ? "image-thumb active"
                    : "image-thumb"
                }
                title={asset.alt_text ?? "Media asset"}
                onClick={() =>
                  onPick({ id: asset.id, url: asset.public_url })
                }
              >
                <img src={asset.public_url} alt={asset.alt_text ?? ""} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

type AdminCategory = {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  status?: string
  product_count?: number
}

type AdminBrand = {
  id: string
  name: string
  slug: string
  description?: string | null
  image_url?: string | null
  status?: string
  product_count?: number
}

function AdminCategories() {
  const claims = getSessionClaims()
  const canDelete = ["super_admin", "manager"].includes(claims?.role ?? "")
  const [categories, setCategories] = useState<AdminCategory[] | null>(() =>
    readRowCache<AdminCategory>("admin-categories"),
  )
  const [view, setView] = useState<AdminView>("grid")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AdminCategory | null>(null)

  function loadCategories() {
    fetch("/api/admin/categories", { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load categories.")
        return data.categories as AdminCategory[]
      })
      .then((data) => {
        setCategories(data)
        writeRowCache("admin-categories", data)
        setError("")
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load categories.",
        ),
      )
  }

  useEffect(() => {
    void loadCategories()
  }, [])

  async function patchCategory(
    category: AdminCategory,
    body: Record<string, unknown>,
  ) {
    setBusy(category.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "We could not update this category.")
      }
      loadCategories()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not update this category.",
      )
    } finally {
      setBusy(null)
    }
  }

  async function removeCategory(category: AdminCategory) {
    if (
      !window.confirm(
        `Delete “${category.name}” permanently? Products in it must be moved first.`,
      )
    )
      return
    setBusy(category.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/categories/${category.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "We could not delete this category.")
      }
      loadCategories()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not delete this category.",
      )
    } finally {
      setBusy(null)
    }
  }

  const statusClass: Record<string, string> = {
    active: "status-delivered",
    draft: "status-confirmed",
    disabled: "status-out-for-delivery",
  }

  const renderActions = (category: AdminCategory) => (
    <div className="table-actions">
      <Link to={`/shop?q=${encodeURIComponent(category.name)}`}>View</Link>
      <button type="button" disabled={busy === category.id} onClick={() => setEditing(category)}>
        Edit
      </button>
      <button
        type="button"
        disabled={busy === category.id}
        onClick={() =>
          patchCategory(
            category,
            category.status === "disabled"
              ? { status: "active" }
              : { status: "disabled" },
          )
        }
      >
        {category.status === "disabled" ? "Show" : "Hide"}
      </button>
      {canDelete && (
        <button
          type="button"
          disabled={busy === category.id}
          onClick={() => removeCategory(category)}
        >
          Delete
        </button>
      )}
    </div>
  )

  return (
    <>
      <section className="table-card products-table">
        <div className="admin-card-head">
          <div>
            <span>Catalogue</span>
            <h2>
              Categories <small>{categories?.length ?? 0}</small>
            </h2>
          </div>
          <div className="admin-product-actions">
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowCreate(true)}
            >
              <Plus /> Add category
            </button>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        {categories === null ? (
          <p className="admin-loading">Loading categories…</p>
        ) : categories.length === 0 ? (
          <p className="admin-loading">No categories yet. Create the first one.</p>
        ) : view === "grid" ? (
          <div className="admin-card-grid">
            {categories.map((category) => (
              <article key={category.id} className="admin-entity-card">
                <div className="admin-entity-image">
                  {category.image_url ? (
                    <img src={category.image_url} alt={category.name} />
                  ) : (
                    <Package />
                  )}
                </div>
                <div className="admin-entity-body">
                  <strong>{category.name}</strong>
                  <span>{category.slug}</span>
                  <div className="admin-entity-meta">
                    <span>{category.product_count ?? 0} products</span>
                    <span className={`status ${statusClass[category.status ?? "active"] ?? ""}`}>
                      {category.status ?? "active"}
                    </span>
                  </div>
                </div>
                {renderActions(category)}
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Products</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>
                      <strong>{category.name}</strong>
                    </td>
                    <td>{category.slug}</td>
                    <td>{category.product_count ?? 0}</td>
                    <td>
                      <span className={`status ${statusClass[category.status ?? "active"] ?? ""}`}>
                        {category.status ?? "active"}
                      </span>
                    </td>
                    <td>{renderActions(category)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showCreate && (
        <CategoryModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            loadCategories()
          }}
        />
      )}
      {editing && (
        <CategoryModal
          category={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadCategories()
          }}
        />
      )}
    </>
  )
}

function CategoryModal({
  category,
  onClose,
  onSaved,
}: {
  category?: AdminCategory
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageUrl, setImageUrl] = useState(category?.image_url ?? "")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to manage categories.")
      return
    }

    const values = new FormData(event.currentTarget)
    const name = String(values.get("name") ?? "").trim()
    const slug = String(values.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    setError("")
    setIsSubmitting(true)
    try {
      const response = await fetch(
        category
          ? `/api/admin/categories/${category.id}`
          : "/api/admin/categories",
        {
          method: category ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${session}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            slug,
            description:
              String(values.get("description") ?? "").trim() || undefined,
            imageUrl: imageUrl || undefined,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(
          data?.error ?? "We could not save this category.",
        )
      onSaved()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save this category.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Catalogue management</span>
            <h2>{category ? "Edit category" : "Add category"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close category form"
          >
            <X />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="form-grid">
              <label>
                Category name
                <input name="name" required minLength={2} defaultValue={category?.name} />
              </label>
              <label>
                Slug
                <input name="slug" required pattern="[a-z0-9-]+" defaultValue={category?.slug} />
              </label>
              <label className="span-2">
                Description <small>(optional)</small>
                <textarea name="description" rows={4} defaultValue={category?.description ?? ""} />
              </label>
            </div>
            <h3>Category image</h3>
            <ImagePicker value={imageUrl} onPick={(asset) => setImageUrl(asset.url)} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-dark" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : category ? "Save changes" : "Create category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdminBrands() {
  const claims = getSessionClaims()
  const canDelete = ["super_admin", "manager"].includes(claims?.role ?? "")
  const [brands, setBrands] = useState<AdminBrand[] | null>(() =>
    readRowCache<AdminBrand>("admin-brands"),
  )
  const [view, setView] = useState<AdminView>("grid")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<AdminBrand | null>(null)

  function loadBrands() {
    fetch("/api/admin/brands", { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load brands.")
        return data.brands as AdminBrand[]
      })
      .then((data) => {
        setBrands(data)
        writeRowCache("admin-brands", data)
        setError("")
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load brands.",
        ),
      )
  }

  useEffect(() => {
    void loadBrands()
  }, [])

  async function patchBrand(brand: AdminBrand, body: Record<string, unknown>) {
    setBusy(brand.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "We could not update this brand.")
      }
      loadBrands()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not update this brand.",
      )
    } finally {
      setBusy(null)
    }
  }

  async function removeBrand(brand: AdminBrand) {
    if (
      !window.confirm(
        `Delete “${brand.name}” permanently? Its products must be moved first.`,
      )
    )
      return
    setBusy(brand.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/brands/${brand.id}`, {
        method: "DELETE",
        headers: authHeaders(),
      })
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "We could not delete this brand.")
      }
      loadBrands()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not delete this brand.",
      )
    } finally {
      setBusy(null)
    }
  }

  const statusClass: Record<string, string> = {
    active: "status-delivered",
    draft: "status-confirmed",
    disabled: "status-out-for-delivery",
  }

  const renderActions = (brand: AdminBrand) => (
    <div className="table-actions">
      <Link to={`/shop?q=${encodeURIComponent(brand.name)}`}>View</Link>
      <button type="button" disabled={busy === brand.id} onClick={() => setEditing(brand)}>
        Edit
      </button>
      <button
        type="button"
        disabled={busy === brand.id}
        onClick={() =>
          patchBrand(
            brand,
            brand.status === "disabled"
              ? { status: "active" }
              : { status: "disabled" },
          )
        }
      >
        {brand.status === "disabled" ? "Show" : "Hide"}
      </button>
      {canDelete && (
        <button
          type="button"
          disabled={busy === brand.id}
          onClick={() => removeBrand(brand)}
        >
          Delete
        </button>
      )}
    </div>
  )

  return (
    <>
      <section className="table-card products-table">
        <div className="admin-card-head">
          <div>
            <span>Catalogue</span>
            <h2>
              Brands <small>{brands?.length ?? 0}</small>
            </h2>
          </div>
          <div className="admin-product-actions">
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowCreate(true)}
            >
              <Plus /> Add brand
            </button>
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        {brands === null ? (
          <p className="admin-loading">Loading brands…</p>
        ) : brands.length === 0 ? (
          <p className="admin-loading">No brands yet. Create the first one.</p>
        ) : view === "grid" ? (
          <div className="admin-card-grid">
            {brands.map((brand) => (
              <article key={brand.id} className="admin-entity-card">
                <div className="admin-entity-image">
                  {brand.image_url ? (
                    <img src={brand.image_url} alt={brand.name} />
                  ) : (
                    <Star />
                  )}
                </div>
                <div className="admin-entity-body">
                  <strong>{brand.name}</strong>
                  <span>{brand.slug}</span>
                  <div className="admin-entity-meta">
                    <span>{brand.product_count ?? 0} products</span>
                    <span className={`status ${statusClass[brand.status ?? "active"] ?? ""}`}>
                      {brand.status ?? "active"}
                    </span>
                  </div>
                </div>
                {renderActions(brand)}
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Slug</th>
                  <th>Products</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {brands.map((brand) => (
                  <tr key={brand.id}>
                    <td>
                      <strong>{brand.name}</strong>
                    </td>
                    <td>{brand.slug}</td>
                    <td>{brand.product_count ?? 0}</td>
                    <td>
                      <span className={`status ${statusClass[brand.status ?? "active"] ?? ""}`}>
                        {brand.status ?? "active"}
                      </span>
                    </td>
                    <td>{renderActions(brand)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {showCreate && (
        <BrandModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            setShowCreate(false)
            loadBrands()
          }}
        />
      )}
      {editing && (
        <BrandModal
          brand={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            loadBrands()
          }}
        />
      )}
    </>
  )
}

function BrandModal({
  brand,
  onClose,
  onSaved,
}: {
  brand?: AdminBrand
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [imageUrl, setImageUrl] = useState(brand?.image_url ?? "")

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to manage brands.")
      return
    }

    const values = new FormData(event.currentTarget)
    const name = String(values.get("name") ?? "").trim()
    const slug = String(values.get("slug") ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")

    setError("")
    setIsSubmitting(true)
    try {
      const response = await fetch(
        brand ? `/api/admin/brands/${brand.id}` : "/api/admin/brands",
        {
          method: brand ? "PATCH" : "POST",
          headers: {
            Authorization: `Bearer ${session}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name,
            slug,
            description:
              String(values.get("description") ?? "").trim() || undefined,
            imageUrl: imageUrl || undefined,
          }),
        },
      )
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not save this brand.")
      onSaved()
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "We could not save this brand.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Catalogue management</span>
            <h2>{brand ? "Edit brand" : "Add brand"}</h2>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Close brand form"
          >
            <X />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <div className="form-grid">
              <label>
                Brand name
                <input name="name" required minLength={2} defaultValue={brand?.name} />
              </label>
              <label>
                Slug
                <input name="slug" required pattern="[a-z0-9-]+" defaultValue={brand?.slug} />
              </label>
              <label className="span-2">
                Description <small>(optional)</small>
                <textarea name="description" rows={4} defaultValue={brand?.description ?? ""} />
              </label>
            </div>
            <h3>Brand image</h3>
            <ImagePicker value={imageUrl} onPick={(asset) => setImageUrl(asset.url)} />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-dark" disabled={isSubmitting}>
              {isSubmitting ? "Saving…" : brand ? "Save changes" : "Create brand"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function AdminPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const claims = getSessionClaims()
  const profile = useStaffProfile(claims)
  const staffPulse = useNotificationPulse(
    Boolean(claims && isStaffRole(claims.role)),
    "admin",
  )
  const adminInstall = useAppInstall()
  const [showAdd, setShowAdd] = useState(false)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [pendingOrders, setPendingOrders] = useState(0)
  const [openSupport, setOpenSupport] = useState(0)
  const [navOpen, setNavOpen] = useState(false)
  const [catalogueVersion, setCatalogueVersion] = useState(0)
  const section = adminSectionForPath(location.pathname)

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const role = claims?.role
  const activeItem = adminNav.find((item) => item.key === section) ?? adminNav[0]
  const allowed = Boolean(role && activeItem.roles.includes(role))

  useEffect(() => {
    if (!claims || !isStaffRole(claims.role)) return
    const canOrders = ["super_admin", "manager", "sales", "delivery"].includes(
      claims.role,
    )
    const canSupport = ["super_admin", "manager", "support"].includes(
      claims.role,
    )
    if (canOrders) {
      fetch("/api/admin/dashboard", { headers: authHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: AdminDashboardData | null) =>
          setPendingOrders(data?.orders?.pending ?? 0),
        )
        .catch(() => undefined)
    }
    if (canSupport) {
      fetch(`/api/admin/support?limit=100`, { headers: authHeaders() })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { tickets?: { status: string }[] } | null) =>
          setOpenSupport(
            (data?.tickets ?? []).filter((t) => t.status !== "closed").length,
          ),
        )
        .catch(() => undefined)
    }
  }, [claims])

  if (!claims) {
    sessionStorage.setItem("henrys-return-to", "/admin")
    return <Navigate to="/login" replace />
  }
  if (!isStaffRole(claims.role)) {
    return (
      <div className="admin-gate">
        <ShieldCheck />
        <h1>Staff access only</h1>
        <p>
          You are signed in as a customer. The administration area is reserved
          for authorised Henry's team members.
        </p>
        <div className="admin-gate-actions">
          <button
            type="button"
            className="button button-dark"
            onClick={() => {
              clearSession()
              navigate("/login")
            }}
          >
            Sign in with a staff account
          </button>
          <Link to="/account" className="button button-outline">
            Go to my account
          </Link>
        </div>
      </div>
    )
  }

  const displayName = profile
    ? `${profile.firstName} ${profile.lastName}`
    : (claims.email.split("@")[0] ?? "Team member")
  const initials = displayName
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("")

  return (
    <div className="admin-shell">
      <aside className={navOpen ? "admin-sidebar open" : "admin-sidebar"}>
        <div className="admin-sidebar-top">
          <Brand />
          <button
            type="button"
            className="admin-nav-close"
            aria-label="Close menu"
            onClick={() => setNavOpen(false)}
          >
            <X />
          </button>
        </div>
        <nav>
          {adminNav
            .filter((item) => role && item.roles.includes(role))
            .map(({ icon: Icon, label, path, key }) => (
              <button
                type="button"
                key={label}
                className={section === key ? "active" : ""}
                onClick={() => navigate(path ? `/admin/${path}` : "/admin")}
              >
                <Icon /> {label}
                {key === "orders" && pendingOrders > 0 && (
                  <small>{pendingOrders}</small>
                )}
                {key === "support" && openSupport > 0 && (
                  <small>{openSupport}</small>
                )}
                {key === "notifications" && staffPulse.unread > 0 && (
                  <small>{staffPulse.unread}</small>
                )}
              </button>
            ))}
        </nav>
        <div className="admin-profile">
          <span>{initials || "HL"}</span>
          <div>
            <strong>{displayName}</strong>
            <small>{ROLE_LABELS[claims.role] ?? claims.role}</small>
          </div>
          <button
            type="button"
            className="admin-signout"
            title="Sign out"
            aria-label="Sign out"
            onClick={() => {
              clearSession()
              navigate("/login")
            }}
          >
            <LogOut />
          </button>
        </div>
      </aside>
      {navOpen && (
        <div
          className="admin-nav-overlay"
          aria-hidden="true"
          onClick={() => setNavOpen(false)}
        />
      )}
      <main className="admin-main">
        <header className="admin-header">
          <button
            type="button"
            className="admin-menu-button"
            aria-label="Open menu"
            onClick={() => setNavOpen(true)}
          >
            <Menu />
          </button>
          <div className="admin-heading">
            <span>Administration</span>
            <h1>{activeItem.label}</h1>
          </div>
          <div className="admin-header-actions">
            {!adminInstall.installed && (
              <button
                type="button"
                className="install-button"
                onClick={adminInstall.openPrompt}
                title="Install the Henry's Hub app"
              >
                <Download />
                <span>Install</span>
              </button>
            )}
            <Link
              to="/admin/notifications"
              className="admin-bell"
              aria-label={`Notifications, ${staffPulse.unread} unread`}
              title="Notifications"
            >
              <Bell />
              {staffPulse.unread > 0 && (
                <span className="bell-badge">
                  {staffPulse.unread > 99 ? "99+" : staffPulse.unread}
                </span>
              )}
            </Link>
            <Link to="/" className="store-link">
              <Store /> View store
            </Link>
          </div>
        </header>
        {!allowed ? (
          <section className="table-card admin-placeholder">
            <ShieldCheck />
            <h2>Access restricted</h2>
            <p>
              Your role ({ROLE_LABELS[claims.role] ?? claims.role}) does not
              include this workspace. Contact a super admin if you need access.
            </p>
          </section>
        ) : section === "dashboard" ? (
          <AdminDashboard
            setSection={(next) => {
              const item = adminNav.find((n) => n.label === next)
              navigate(item?.path ? `/admin/${item.path}` : "/admin")
            }}
            profileName={profile ? profile.firstName : undefined}
          />
        ) : section === "products" ? (
          <AdminProducts
            key={catalogueVersion}
            onAdd={() => setShowAdd(true)}
            onEdit={setEditingProduct}
          />
        ) : section === "categories" ? (
          <AdminCategories />
        ) : section === "brands" ? (
          <AdminBrands />
        ) : section === "orders" ? (
          <AdminOrders />
        ) : section === "bookings" ? (
          <AdminBookings />
        ) : section === "deliveries" ? (
          <AdminDeliveries />
        ) : section === "inventory" ? (
          <AdminInventory />
        ) : section === "customers" ? (
          <AdminCustomers />
        ) : section === "promotions" ? (
          <AdminPromotions />
        ) : section === "reviews" ? (
          <AdminReviews />
        ) : section === "support" ? (
          <AdminSupportInbox />
        ) : section === "website" ? (
          <AdminWebsite />
        ) : section === "reports" ? (
          <AdminReports />
        ) : section === "notifications" ? (
          <AdminNotifications />
        ) : section === "staff" ? (
          <AdminStaff />
        ) : section === "audit" ? (
          <AdminAudit />
        ) : section === "settings" ? (
          <AdminSettings />
        ) : (
          <AdminPlaceholder section={section} />
        )}
      </main>
      <NotificationToast pulse={staffPulse} />
      <InstallPromptModal install={adminInstall} />
      {showAdd && (
        <ProductModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            setShowAdd(false)
            setCatalogueVersion((v) => v + 1)
          }}
        />
      )}
      {editingProduct && (
        <EditProductModal
          product={editingProduct}
          onClose={() => setEditingProduct(null)}
          onSaved={() => {
            setEditingProduct(null)
            setCatalogueVersion((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

type AdminDashboardData = {
  revenue: {
    month_revenue: number
    today_revenue: number
  }
  orders: {
    total: number
    pending: number
    completed: number
  }
  inventory: {
    low_stock: number
    out_of_stock: number
  }
  bookings: { open_bookings: number }
  recentOrders: Array<{
    order_number: string
    status: string
    total_kes: number
    payment_method: string
    payment_status: string
    placed_at: string
    customer_name: string
  }>
}

function AdminDashboard({
  setSection,
  profileName,
}: {
  setSection: (section: string) => void
  profileName?: string
}) {
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null)
  const [dashboardError, setDashboardError] = useState("")
  const [chart, setChart] = useState<
    { day: string; revenue: number; orders: number }[]
  >([])

  useEffect(() => {
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setDashboardError("Sign in with a staff account to view live operations.")
      return
    }

    fetch("/api/admin/dashboard", {
      headers: { Authorization: `Bearer ${session}` },
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok) {
          throw new Error(
            data?.error ??
              "Your account does not have access to live operations.",
          )
        }
        return data as AdminDashboardData
      })
      .then(setDashboard)
      .catch((error: unknown) =>
        setDashboardError(
          error instanceof Error
            ? error.message
            : "We could not load the live operations dashboard.",
        ),
      )

    const claims = getSessionClaims()
    if (claims && FINANCE_ROLES.includes(claims.role)) {
      fetch("/api/admin/reports", { headers: { Authorization: `Bearer ${session}` } })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: { ordersByDay?: { day: string; revenue: number; orders: number }[] } | null) =>
          setChart((data?.ordersByDay ?? []).slice(-14)),
        )
        .catch(() => undefined)
    }
  }, [])

  const metrics = dashboard
    ? [
        {
          label: "Revenue this month",
          value: formatPrice(dashboard.revenue.month_revenue),
          change: `${formatPrice(dashboard.revenue.today_revenue)} today`,
          icon: BarChart3,
        },
        {
          label: "Orders",
          value: String(dashboard.orders.total),
          change: `${dashboard.orders.pending} awaiting fulfilment`,
          icon: ClipboardList,
        },
        {
          label: "Open bookings",
          value: String(dashboard.bookings.open_bookings),
          change: "Requires follow-up",
          icon: Users,
        },
        {
          label: "Low stock",
          value: String(dashboard.inventory.low_stock),
          change: `${dashboard.inventory.out_of_stock} out of stock`,
          icon: Box,
        },
      ]
    : [
        {
          label: "Revenue this month",
          value: "—",
          change: "Loading live data",
          icon: BarChart3,
        },
        {
          label: "Orders",
          value: "—",
          change: "Loading live data",
          icon: ClipboardList,
        },
        {
          label: "Open bookings",
          value: "—",
          change: "Loading live data",
          icon: Users,
        },
        {
          label: "Low stock",
          value: "—",
          change: "Loading live data",
          icon: Box,
        },
      ]
  const activity = dashboard?.recentOrders ?? []

  return (
    <>
      <section className="admin-welcome">
        <div>
          <span className="status-dot" />{" "}
          {dashboard
            ? "Store operations are healthy"
            : dashboardError
              ? "Live data unavailable"
              : "Connecting to live operations"}
        </div>
        <p>
          {profileName ? `Good day, ${profileName}.` : "Good day."} Here is
          what is happening today.
        </p>
      </section>
      {dashboardError && <p className="form-error">{dashboardError}</p>}
      <section className="metric-grid">
        {metrics.map(({ label, value, change, icon: Icon }) => (
          <article key={label}>
            <div>
              <span>{label}</span>
              <Icon />
            </div>
            <strong>{value}</strong>
            <small>{change}</small>
          </article>
        ))}
      </section>
      <section className="admin-grid">
        <article className="chart-card">
          <div className="admin-card-head">
            <div>
              <span>Performance</span>
              <h2>Revenue overview</h2>
            </div>
            <select aria-label="Chart period" disabled>
              <option>Last 14 days</option>
            </select>
          </div>
          {chart.length ? (
            <div className="live-chart">
              {chart.map((point) => {
                const max = Math.max(...chart.map((p) => p.revenue), 1)
                return (
                  <div
                    className="live-chart-col"
                    key={point.day}
                    title={`${formatPrice(point.revenue)} · ${point.orders} orders`}
                  >
                    <div
                      className="live-chart-bar"
                      style={{ height: `${Math.max(3, (point.revenue / max) * 100)}%` }}
                    />
                    <span>
                      {new Date(point.day).toLocaleDateString("en-KE", {
                        day: "numeric",
                      })}
                    </span>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="empty-copy">
              Revenue will chart itself here as confirmed orders come in.
            </p>
          )}
        </article>
        <article className="activity-card">
          <div className="admin-card-head">
            <div>
              <span>Live feed</span>
              <h2>Recent activity</h2>
            </div>
          </div>
          {activity.length ? activity.slice(0, 4).map((order, index) => (
              <div className="activity" key={order.order_number}>
                <span className={`activity-icon activity-${index}`}>
                  <Check />
                </span>
                <div>
                  <strong>
                    Order #{order.order_number}{" "}
                    {order.status.replace(/_/g, " ")}
                  </strong>
                  <small>
                    {new Date(order.placed_at).toLocaleString("en-KE", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                </div>
              </div>
            )) : <p className="empty-copy">
              Recent order activity will appear here.
            </p>}
        </article>
      </section>
      <section className="table-card">
        <div className="admin-card-head">
          <div>
            <span>Fulfilment</span>
            <h2>Recent orders</h2>
          </div>
          <button type="button" onClick={() => setSection("Orders")}>
            View all <ArrowRight />
          </button>
        </div>
        <OrderTable orders={activity} />
      </section>
    </>
  )
}

function OrderTable({
  orders,
}: {
  orders: AdminDashboardData["recentOrders"]
}) {
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Total</th>
            <th>Payment</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr key={order.order_number}>
              <td>
                <strong>#{order.order_number}</strong>
              </td>
              <td>{order.customer_name}</td>
              <td>{formatPrice(order.total_kes)}</td>
              <td>{order.payment_method}</td>
              <td>
                <span
                  className={`status status-${order.status.replace(/_/g, "-")}`}
                >
                  {order.status.replace(/_/g, " ")}
                </span>
              </td>
              <td>
                <button type="button">•••</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

type AdminProductRow = {
  id: string
  name: string
  slug: string
  status: string
  description: string | null
  short_description: string | null
  country_of_origin: string | null
  alcohol_percentage: number | null
  serving_suggestion: string | null
  brand_id: string
  category_id: string
  brand: string
  category: string
  created_at: string
  primary_image: string | null
  variants: Array<{
    id: string
    sku: string
    volumeMl: number
    priceKes: number
    compareAtPriceKes: number | null
    stock: number
    reserved?: number
    reorderLevel: number
  }> | null
}

function AdminProducts({
  onAdd,
  onEdit,
}: {
  onAdd: () => void
  onEdit: (product: Product) => void
}) {
  const [rows, setRows] = useState<AdminProductRow[] | null>(() =>
    readRowCache<AdminProductRow>("admin-products"),
  )
  const [view, setView] = useState<AdminView>("grid")
  const [error, setError] = useState("")
  const [updating, setUpdating] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  const loadProducts = () => {
    fetch("/api/admin/products", { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load the catalogue.")
        return data.products as AdminProductRow[]
      })
      .then((data) => {
        setRows(data)
        writeRowCache("admin-products", data)
        setError("")
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load the catalogue.",
        ),
      )
  }

  useEffect(() => {
    void loadProducts()
  }, [])

  async function manageProduct(
    row: AdminProductRow,
    method: "PATCH" | "DELETE",
    body?: Record<string, unknown>,
  ) {
    setUpdating(row.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/products/${row.id}`, {
        method,
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:
          method === "PATCH"
            ? JSON.stringify(body ?? { status: "disabled" })
            : undefined,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not update this product.")
      loadProducts()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not update this product.",
      )
    } finally {
      setUpdating(null)
    }
  }

  const term = search.trim().toLowerCase()
  const visible = (rows ?? []).filter((row) =>
    term
      ? `${row.name} ${row.brand} ${row.category} ${
          row.variants?.[0]?.sku ?? ""
        }`
          .toLowerCase()
          .includes(term)
      : true,
  )

  const statusClass: Record<string, string> = {
    active: "status-delivered",
    draft: "status-confirmed",
    disabled: "status-out-for-delivery",
  }

  const editPayload = (row: AdminProductRow): Product => {
    const variant = row.variants?.[0]
    return {
      id: row.id,
      variantId: variant?.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      volume: variant ? `${variant.volumeMl}ml` : "700ml",
      price: variant?.priceKes ?? 0,
      stock: variant?.stock ?? 0,
      rating: 0,
      image: row.primary_image ?? "",
      status: row.status as Product["status"],
      brandId: row.brand_id,
      categoryId: row.category_id,
      description: row.description,
      shortDescription: row.short_description,
      countryOfOrigin: row.country_of_origin,
      alcoholPercentage: row.alcohol_percentage,
      servingSuggestion: row.serving_suggestion,
      volumeMl: variant?.volumeMl,
      sku: variant?.sku,
    }
  }

  const renderActions = (row: AdminProductRow) => (
    <div className="table-actions">
      <Link to={`/products/${row.slug}`}>View</Link>
      <button type="button" onClick={() => onEdit(editPayload(row))}>
        Edit
      </button>
      <button
        type="button"
        disabled={updating === row.id}
        onClick={() =>
          manageProduct(
            row,
            "PATCH",
            row.status === "disabled"
              ? { status: "active" }
              : { status: "disabled" },
          )
        }
      >
        {row.status === "disabled" ? "Show" : "Hide"}
      </button>
      <button
        type="button"
        disabled={updating === row.id}
        onClick={() => {
          if (window.confirm(`Delete “${row.name}”?`))
            manageProduct(row, "DELETE")
        }}
      >
        Delete
      </button>
    </div>
  )

  return (
    <section className="table-card products-table">
      <div className="admin-card-head">
        <div>
          <span>Catalogue</span>
          <h2>
            All products <small>{visible.length}</small>
          </h2>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="admin-product-actions">
          <label>
            <Search />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products or SKU"
            />
          </label>
          <ViewToggle view={view} onChange={setView} />
          <button type="button" className="button button-dark" onClick={onAdd}>
            <Plus /> Add product
          </button>
        </div>
      </div>
      {rows === null ? (
        <p className="admin-loading">Loading the catalogue…</p>
      ) : visible.length === 0 ? (
        <p className="admin-loading">No products match this search.</p>
      ) : view === "grid" ? (
        <div className="admin-card-grid">
          {visible.map((row) => {
            const variant = row.variants?.[0]
            return (
              <article key={row.id} className="admin-entity-card">
                <Link
                  to={`/products/${row.slug}`}
                  className="admin-entity-image"
                  aria-label={`View ${row.name} in the store`}
                >
                  {row.primary_image ? (
                    <img src={row.primary_image} alt={row.name} />
                  ) : (
                    <Package />
                  )}
                </Link>
                <div className="admin-entity-body">
                  <strong>{row.name}</strong>
                  <span>
                    {row.brand} · {variant ? `${variant.volumeMl}ml` : "—"}
                  </span>
                  <div className="admin-entity-meta">
                    <strong>
                      {variant ? formatPrice(variant.priceKes) : "—"}
                    </strong>
                    <span>{variant?.stock ?? 0} in stock</span>
                    <span
                      className={`status ${statusClass[row.status] ?? ""}`}
                    >
                      {row.status}
                    </span>
                  </div>
                </div>
                {renderActions(row)}
              </article>
            )
          })}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => {
                const variant = row.variants?.[0]
                return (
                  <tr key={row.id}>
                    <td>
                      <div className="table-product">
                        <img src={row.primary_image ?? ""} alt="" />
                        <div>
                          <strong>{row.name}</strong>
                          <span>
                            {row.brand} ·{" "}
                            {variant ? `${variant.volumeMl}ml` : "—"}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{variant?.sku ?? "—"}</td>
                    <td>{row.category}</td>
                    <td>{variant ? formatPrice(variant.priceKes) : "—"}</td>
                    <td>
                      <strong>{variant?.stock ?? 0}</strong>
                    </td>
                    <td>
                      <span className={`status ${statusClass[row.status] ?? ""}`}>
                        {row.status}
                      </span>
                    </td>
                    <td>{renderActions(row)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ─── ADMIN ORDERS ─────────────────────────────────────────────────────────────

type AdminOrderRecord = {
  id: string
  order_number: string
  status: string
  payment_method: string
  delivery_address: Record<string, unknown> | null
  delivery_fee_kes: number
  total_kes: number
  placed_at: string
  customer_name: string
  customer_email: string
  customer_phone: string | null
}

type AdminOrderItem = {
  id: string
  name: string
  quantity: number
  unitPriceKes: number
  image: string | null
  fulfilment: "pending" | "delivering" | "excluded"
}

const PAYMENT_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  card: "Card",
  bank: "Bank transfer",
  cash: "Pay on delivery",
}

type AdminOrderDetail = {
  order_number: string
  status: string
  payment_method: string
  payment_status: string
  delivery_type: string
  subtotal_kes: number
  discount_kes: number
  delivery_fee_kes: number
  total_kes: number
  placed_at: string
  updated_at: string
  customer_name: string
  customer_email: string | null
  customer_phone: string | null
  delivery_address: {
    name?: string
    phone?: string
    address?: string
    area?: string
  } | null
  items: AdminOrderItem[]
}

function AdminOrders() {
  const { orders: localOrders } = useStore()
  const [orders, setOrders] = useState<Order[]>(localOrders)
  const [filter, setFilter] = useState("All")
  const [selected, setSelected] = useState<Order | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)
  const [error, setError] = useState("")
  const [detailOrder, setDetailOrder] = useState<AdminOrderDetail | null>(null)
  const [detailItems, setDetailItems] = useState<AdminOrderItem[]>([])
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailError, setDetailError] = useState("")
  const [delivering, setDelivering] = useState(false)
  const [deliverNotice, setDeliverNotice] = useState("")
  const statusFilters = [
    "All",
    "confirmed",
    "preparing",
    "out-for-delivery",
    "delivered",
  ]
  const filtered =
    filter === "All" ? orders : orders.filter((o) => o.status === filter)
  const statusLabel: Record<string, string> = {
    confirmed: "Confirmed",
    preparing: "Preparing",
    "out-for-delivery": "Out for delivery",
    delivered: "Delivered",
  }

  useEffect(() => {
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to manage orders.")
      return
    }
    fetch("/api/admin/orders", {
      headers: { Authorization: `Bearer ${session}` },
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          orders?: AdminOrderRecord[]
          error?: string
        }
        if (!response.ok)
          throw new Error(data.error ?? "We could not load orders.")
        return data.orders ?? []
      })
      .then((rows) =>
        setOrders(
          rows.map((row) => {
            const address = row.delivery_address ?? {}
            let status: Order["status"] = "confirmed"
            if (row.status === "preparing") status = "preparing"
            if (row.status === "out_for_delivery") status = "out-for-delivery"
            if (row.status === "delivered") status = "delivered"
            return {
              id: row.order_number,
              adminId: row.id,
              items: [],
              total: row.total_kes,
              deliveryFee: row.delivery_fee_kes,
              customer: {
                name: row.customer_name,
                email: row.customer_email,
                phone:
                  typeof address.phone === "string"
                    ? address.phone
                    : (row.customer_phone ?? "Not provided"),
                address:
                  typeof address.address === "string"
                    ? address.address
                    : "Collection order",
                area:
                  typeof address.area === "string" ? address.area : "Pickup",
              },
              payment: row.payment_method,
              status,
              createdAt: row.placed_at,
            }
          }),
        ),
      )
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load orders.",
        ),
      )
  }, [])

  useEffect(() => {
    setDetailItems([])
    setDetailOrder(null)
    setDetailError("")
    setDeliverNotice("")
    const adminId = selected?.adminId
    if (!adminId) return
    const session = sessionStorage.getItem("henrys-session")
    if (!session) return
    let cancelled = false
    setDetailLoading(true)
    fetch(`/api/admin/orders/${adminId}`, {
      headers: { Authorization: `Bearer ${session}` },
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          order?: AdminOrderDetail
          error?: string
        }
        if (!response.ok)
          throw new Error(data.error ?? "We could not load this order.")
        return data.order ?? null
      })
      .then((order) => {
        if (cancelled || !order) return
        setDetailOrder(order)
        setDetailItems(order.items)
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setDetailError(
            loadError instanceof Error
              ? loadError.message
              : "We could not load this order.",
          )
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected?.adminId])

  function toggleItem(itemId: string, on: boolean) {
    setDetailItems((current) =>
      current.map((item) =>
        item.id === itemId
          ? { ...item, fulfilment: on ? "delivering" : "excluded" }
          : item,
      ),
    )
  }

  async function dispatchOrder() {
    const session = sessionStorage.getItem("henrys-session")
    if (!session || !selected?.adminId) {
      setError("Sign in with a staff account to dispatch orders.")
      return
    }
    if (!detailItems.length) {
      setError("Load the order products before dispatching.")
      return
    }
    if (!detailItems.some((item) => item.fulfilment !== "excluded")) {
      setError("Tick at least one product that is being delivered.")
      return
    }
    setDelivering(true)
    setError("")
    setDeliverNotice("")
    try {
      const response = await fetch(
        `/api/admin/orders/${selected.adminId}/deliver`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            items: detailItems.map((item) => ({
              id: item.id,
              delivering: item.fulfilment !== "excluded",
            })),
          }),
        },
      )
      const data = (await response.json().catch(() => null)) as {
        error?: string
        delivering?: string[]
        excluded?: string[]
      } | null
      if (!response.ok)
        throw new Error(data?.error ?? "We could not dispatch this order.")
      setOrders((current) =>
        current.map((order) =>
          order.id === selected.id
            ? { ...order, status: "out-for-delivery" as const }
            : order,
        ),
      )
      setSelected((current) =>
        current?.id === selected.id
          ? { ...current, status: "out-for-delivery" as const }
          : current,
      )
      setDetailOrder((current) =>
        current ? { ...current, status: "out_for_delivery" } : current,
      )
      const excluded = data?.excluded ?? []
      setDeliverNotice(
        excluded.length
          ? `Dispatched. The customer was notified: ${detailItems.length - excluded.length} of ${detailItems.length} products on the way; not delivered: ${excluded.join(", ")}.`
          : `Dispatched. The customer was notified that all ${detailItems.length} products are on the way.`,
      )
    } catch (dispatchError) {
      setError(
        dispatchError instanceof Error
          ? dispatchError.message
          : "We could not dispatch this order.",
      )
    } finally {
      setDelivering(false)
    }
  }

  async function updateStatus(order: Order, newStatus: Order["status"]) {
    const session = sessionStorage.getItem("henrys-session")
    if (!session || !order.adminId) {
      setError("This order cannot be updated without a staff session.")
      return
    }
    setUpdating(order.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/orders/${order.adminId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: newStatus.replace(/-/g, "_") }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not update this order.")
      setOrders((current) =>
        current.map((currentOrder) =>
          currentOrder.id === order.id
            ? { ...currentOrder, status: newStatus }
            : currentOrder,
        ),
      )
      setSelected((current) =>
        current?.id === order.id ? { ...current, status: newStatus } : current,
      )
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "We could not update this order.",
      )
    } finally {
      setUpdating(null)
    }
  }

  return (
    <>
      <div className="admin-orders">
        {error && <p className="form-error">{error}</p>}
        <div className="orders-filters">
          {statusFilters.map((f) => (
            <button
              key={f}
              type="button"
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "All" ? "All orders" : statusLabel[f]}
              <span>
                {f === "All"
                  ? orders.length
                  : orders.filter((o) => o.status === f).length}
              </span>
            </button>
          ))}
        </div>
        <div className="table-card orders-table-card">
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Area</th>
                  <th>Total</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filtered.map((order) => (
                  <tr
                    key={order.id}
                    className={selected?.id === order.id ? "selected-row" : ""}
                    onClick={() =>
                      setSelected(order === selected ? null : order)
                    }
                  >
                    <td>
                      <strong>#{order.id}</strong>
                    </td>
                    <td>
                      <div className="customer-cell">
                        <span className="cust-avatar">
                          {order.customer.name[0]}
                        </span>
                        <div>
                          <strong>{order.customer.name}</strong>
                          <small>{order.customer.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>{order.customer.area}</td>
                    <td>{formatPrice(order.total)}</td>
                    <td>
                      <span className="pay-badge">
                        {PAYMENT_LABELS[order.payment] ?? order.payment}
                      </span>
                    </td>
                    <td>
                      <span className={`status status-${order.status}`}>
                        {updating === order.id
                          ? "Updating..."
                          : statusLabel[order.status]}
                      </span>
                    </td>
                    <td>
                      {new Date(order.createdAt).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelected(order)
                        }}
                      >
                        <Eye />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="order-drawer-overlay" onClick={() => setSelected(null)}>
          <div className="order-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-head">
              <div>
                <span className="eyebrow">Order details</span>
                <h2>#{selected.id}</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => setSelected(null)}
              >
                <X />
              </button>
            </div>
            <div className="drawer-body">
              <div className="drawer-section">
                <h3>Customer</h3>
                <div className="drawer-row">
                  <CircleUserRound />
                  <div>
                    <strong>{selected.customer.name}</strong>
                    <span>{selected.customer.email}</span>
                  </div>
                </div>
                <div className="drawer-row">
                  <Phone />
                  <span>{selected.customer.phone}</span>
                </div>
                <div className="drawer-row">
                  <MapPin />
                  <span>
                    {selected.customer.address}, {selected.customer.area}
                  </span>
                </div>
              </div>
              <div className="drawer-section">
                <h3>Ordered products</h3>
                {detailError && <p className="form-error">{detailError}</p>}
                {detailLoading && (
                  <p className="drawer-muted">Loading products…</p>
                )}
                {!detailLoading && !detailError && !detailItems.length && (
                  <p className="drawer-muted">
                    No product line was recorded for this order.
                  </p>
                )}
                {!detailLoading && detailItems.length > 0 && (
                  <div className="dispatch-items">
                    {detailItems.map((item) => {
                      const on = item.fulfilment !== "excluded"
                      return (
                        <div
                          key={item.id}
                          className={`dispatch-item ${on ? "" : "off"}`}
                        >
                          <img
                            src={item.image ?? PLACEHOLDER_IMAGE}
                            alt=""
                          />
                          <div className="dispatch-info">
                            <strong>{item.name}</strong>
                            <span>
                              Qty {item.quantity} ·{" "}
                              {formatPrice(item.unitPriceKes)}
                            </span>
                          </div>
                          <div className="dispatch-toggle">
                            <button
                              type="button"
                              className={on ? "active" : ""}
                              title="Being delivered"
                              onClick={() => toggleItem(item.id, true)}
                            >
                              <Check />
                            </button>
                            <button
                              type="button"
                              className={on ? "" : "active"}
                              title="Not delivered / unavailable"
                              onClick={() => toggleItem(item.id, false)}
                            >
                              <X />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {deliverNotice && (
                  <p className="dispatch-notice">{deliverNotice}</p>
                )}
                <button
                  type="button"
                  className="button button-dark button-wide dispatch-btn"
                  disabled={
                    delivering ||
                    detailLoading ||
                    detailItems.length === 0
                  }
                  onClick={dispatchOrder}
                >
                  {delivering
                    ? "Dispatching…"
                    : "Deliver order & notify customer"}
                </button>
              </div>
              <div className="drawer-section">
                <h3>Update status</h3>
                <div className="status-update-grid">
                  {([
                    "confirmed",
                    "preparing",
                    "out-for-delivery",
                    "delivered",
                  ] as Order["status"][]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`status-update-btn ${
                        selected.status === s ? "active" : ""
                      }`}
                      onClick={() => {
                        updateStatus(selected, s)
                      }}
                    >
                      {statusLabel[s]}
                    </button>
                  ))}
                </div>
              </div>
              <div className="drawer-section">
                <h3>Order summary</h3>
                <div className="drawer-totals">
                  <div>
                    <span>Subtotal</span>
                    <span>
                      {formatPrice(selected.total - selected.deliveryFee)}
                    </span>
                  </div>
                  <div>
                    <span>Delivery</span>
                    <span>
                      {selected.deliveryFee === 0
                        ? "Free"
                        : formatPrice(selected.deliveryFee)}
                    </span>
                  </div>
                  <div>
                    <span>Payment</span>
                    <span>
                      {PAYMENT_LABELS[selected.payment] ?? selected.payment}
                    </span>
                  </div>
                  <div className="drawer-total">
                    <span>Total</span>
                    <strong>{formatPrice(selected.total)}</strong>
                  </div>
                </div>
              </div>
              <div className="drawer-actions">
                <button
                  type="button"
                  className="button button-dark button-wide"
                  disabled={!detailOrder}
                  onClick={() => {
                    if (!detailOrder) return
                    printReceipt({
                      orderNumber: detailOrder.order_number,
                      placedAt: detailOrder.placed_at,
                      closedAt:
                        detailOrder.status === "delivered"
                          ? detailOrder.updated_at
                          : null,
                      customerName: detailOrder.customer_name,
                      customerPhone:
                        detailOrder.delivery_address?.phone ??
                        detailOrder.customer_phone,
                      addressLine:
                        [
                          detailOrder.delivery_address?.address,
                          detailOrder.delivery_address?.area,
                        ]
                          .filter(Boolean)
                          .join(", ") || null,
                      deliveryType: detailOrder.delivery_type,
                      items: detailItems,
                      subtotalKes: detailOrder.subtotal_kes,
                      discountKes: detailOrder.discount_kes,
                      deliveryFeeKes: detailOrder.delivery_fee_kes,
                      totalKes: detailOrder.total_kes,
                      paymentMethod: detailOrder.payment_method,
                      paymentStatus: detailOrder.payment_status,
                    })
                  }}
                >
                  Print receipt
                </button>
                <button
                  type="button"
                  className="button button-outline button-wide"
                >
                  Contact customer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ─── ADMIN INVENTORY ──────────────────────────────────────────────────────────

type AdminBooking = {
  id: string
  booking_number: string
  name: string
  email: string
  phone: string
  event_type: string
  event_date: string
  guest_count: number
  location: string
  status: string
}

function AdminBookings() {
  const [bookings, setBookings] = useState<AdminBooking[]>([])
  const [error, setError] = useState("")
  const [updating, setUpdating] = useState<string | null>(null)

  useEffect(() => {
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to manage bookings.")
      return
    }
    fetch("/api/admin/bookings", {
      headers: { Authorization: `Bearer ${session}` },
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok)
          throw new Error(data.error ?? "We could not load bookings.")
        return data.bookings as AdminBooking[]
      })
      .then(setBookings)
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load bookings.",
        ),
      )
  }, [])

  async function updateStatus(booking: AdminBooking, status: string) {
    const session = sessionStorage.getItem("henrys-session")
    if (!session) return
    setUpdating(booking.id)
    setError("")
    try {
      const response = await fetch(`/api/admin/bookings/${booking.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not update this booking.")
      setBookings((current) =>
        current.map((item) =>
          item.id === booking.id ? { ...item, status } : item,
        ),
      )
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "We could not update this booking.",
      )
    } finally {
      setUpdating(null)
    }
  }

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Events & bulk orders</span>
          <h2>
            Booking requests <small>{bookings.length}</small>
          </h2>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Reference</th>
              <th>Customer</th>
              <th>Event</th>
              <th>Guests</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>
                  <strong>{booking.booking_number}</strong>
                </td>
                <td>
                  <strong>{booking.name}</strong>
                  <small>{booking.email}</small>
                </td>
                <td>
                  {booking.event_type}
                  <small>
                    {new Date(booking.event_date).toLocaleDateString("en-KE")}
                  </small>
                </td>
                <td>{booking.guest_count}</td>
                <td>{booking.location}</td>
                <td>
                  <select
                    aria-label={`Status for ${booking.booking_number}`}
                    value={booking.status}
                    disabled={updating === booking.id}
                    onChange={(event) =>
                      updateStatus(booking, event.target.value)
                    }
                  >
                    {[
                      "new",
                      "contacted",
                      "quoted",
                      "confirmed",
                      "processing",
                      "completed",
                      "cancelled",
                    ].map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function AdminInventory() {
  const [rows, setRows] = useState<AdminProductRow[] | null>(null)
  const [error, setError] = useState("")
  const [adjusting, setAdjusting] = useState<string | null>(null)
  const [search, setSearch] = useState("")

  function loadInventory() {
    fetch("/api/admin/products", { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load inventory.")
        return data.products as AdminProductRow[]
      })
      .then((data) => {
        setRows(data)
        setError("")
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load inventory.",
        ),
      )
  }

  useEffect(() => {
    loadInventory()
  }, [])

  async function adjust(variantId: string, change: number) {
    if (!variantId) return
    setAdjusting(variantId)
    setError("")
    try {
      const response = await fetch(`/api/admin/inventory/${variantId}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ change }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error ?? "We could not adjust this stock level.")
      }
      setRows((current) =>
        (current ?? []).map((row) => ({
          ...row,
          variants: (row.variants ?? []).map((variant) =>
            variant.id === variantId
              ? { ...variant, stock: data.variant.stock_on_hand }
              : variant,
          ),
        })),
      )
    } catch (adjustError) {
      setError(
        adjustError instanceof Error
          ? adjustError.message
          : "We could not adjust this stock level.",
      )
    } finally {
      setAdjusting(null)
    }
  }

  const variants = (rows ?? []).flatMap((row) =>
    (row.variants ?? []).map((variant) => ({ row, variant })),
  )
  const term = search.trim().toLowerCase()
  const shown = variants.filter(({ row, variant }) =>
    term ? `${row.name} ${row.brand} ${variant.sku}`.toLowerCase().includes(term) : true,
  )
  const outCount = variants.filter(({ variant }) => variant.stock - (variant.reserved ?? 0) <= 0).length
  const lowCount = variants.filter(
    ({ variant }) => variant.stock > 0 && variant.stock <= variant.reorderLevel,
  ).length

  return (
    <div className="admin-inventory">
      {error && <p className="form-error">{error}</p>}
      <div className="inventory-alerts">
        {outCount > 0 && (
          <div className="inv-alert critical">
            <AlertTriangle /> {outCount} variant{outCount > 1 ? "s" : ""} with no
            sellable stock — restock urgently
          </div>
        )}
        {lowCount > 0 && (
          <div className="inv-alert warning">
            <AlertTriangle /> {lowCount} variant{lowCount > 1 ? "s" : ""} at or
            below the reorder level
          </div>
        )}
      </div>
      <div className="table-card">
        <div className="admin-card-head">
          <div>
            <span>Stock control</span>
            <h2>
              Variant inventory <small>{shown.length}</small>
            </h2>
          </div>
          <div className="admin-product-actions">
            <label>
              <Search />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search products or SKU"
              />
            </label>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th>Price</th>
                <th>On hand</th>
                <th>Reserved</th>
                <th>Adjust</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map(({ row, variant }) => {
                const sellable = variant.stock - (variant.reserved ?? 0)
                const level =
                  sellable <= 0
                    ? "out"
                    : variant.stock <= variant.reorderLevel
                      ? "critical"
                      : variant.stock <= variant.reorderLevel * 2
                        ? "low"
                        : "ok"
                return (
                  <tr key={variant.id || row.id}>
                    <td>
                      <div className="table-product">
                        <img src={row.primary_image ?? ""} alt="" />
                        <div>
                          <strong>{row.name}</strong>
                          <span>
                            {row.brand} · {variant.volumeMl}ml
                          </span>
                        </div>
                      </div>
                    </td>
                    <td>{variant.sku}</td>
                    <td>{formatPrice(variant.priceKes)}</td>
                    <td>
                      <div className="stock-cell">
                        <div className="stock-bar-wrap">
                          <div
                            className="stock-bar"
                            style={{
                              width: `${Math.min(100, (variant.stock / 40) * 100)}%`,
                            }}
                            data-level={level}
                          />
                        </div>
                        <span className={`stock-count stock-${level}`}>
                          {variant.stock}
                        </span>
                      </div>
                    </td>
                    <td>{variant.reserved ?? 0}</td>
                    <td>
                      <div className="stock-adj">
                        <button
                          type="button"
                          disabled={adjusting === variant.id}
                          onClick={() => adjust(variant.id, -1)}
                          aria-label={`Reduce stock of ${variant.sku}`}
                        >
                          <Minus />
                        </button>
                        <span>{sellable}</span>
                        <button
                          type="button"
                          disabled={adjusting === variant.id}
                          onClick={() => adjust(variant.id, 5)}
                          aria-label={`Add stock to ${variant.sku}`}
                        >
                          +5
                        </button>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status ${
                          level === "ok"
                            ? "status-delivered"
                            : level === "low"
                              ? "status-out-for-delivery"
                              : "status-preparing"
                        }`}
                      >
                        {level === "ok"
                          ? "In stock"
                          : level === "low"
                            ? "Low"
                            : level === "critical"
                              ? "Critical"
                              : "Out"}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── ADMIN CUSTOMERS ──────────────────────────────────────────────────────────

type AdminCustomer = {
  id: string
  name: string
  email: string
  phone: string | null
  created_at: string
  order_count: number
  total_spend: number
}

type AdminCustomerDetail = {
  customer: {
    id: string
    email: string
    first_name: string
    last_name: string
    phone: string | null
    status: boolean
    created_at: string
  }
  orders: Array<{
    id: string
    order_number: string
    status: string
    payment_status: string
    total_kes: number
    placed_at: string
  }>
  addresses: Array<{
    id: string
    label: string
    recipient_name: string
    phone: string
    address_line_1: string
    address_line_2: string | null
    is_default: boolean
  }>
}

function CustomerDetailModal({
  customer,
  onClose,
}: {
  customer: AdminCustomer
  onClose: () => void
}) {
  const [detail, setDetail] = useState<AdminCustomerDetail | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    let active = true
    fetch(`/api/admin/customers/${customer.id}`, { headers: authHeaders() })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load this customer.")
        return data as AdminCustomerDetail
      })
      .then((data) => active && setDetail(data))
      .catch((loadError: unknown) =>
        active &&
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load this customer.",
        ),
      )
    return () => {
      active = false
    }
  }, [customer.id])

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Customer</span>
            <h2>{customer.name}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        {error && <p className="form-error">{error}</p>}
        {!detail && !error && (
          <p className="admin-loading">Loading customer…</p>
        )}
        {detail && (
          <div className="form-section">
            <div className="profile-meta">
              <div>
                <span>Email</span>
                <strong>{detail.customer.email}</strong>
              </div>
              <div>
                <span>Phone</span>
                <strong>{detail.customer.phone ?? "—"}</strong>
              </div>
              <div>
                <span>Joined</span>
                <strong>
                  {new Intl.DateTimeFormat("en-KE", {
                    dateStyle: "medium",
                  }).format(new Date(detail.customer.created_at))}
                </strong>
              </div>
              <div>
                <span>Lifetime spend</span>
                <strong>{formatPrice(customer.total_spend)}</strong>
              </div>
            </div>
            <h3>Recent orders</h3>
            {detail.orders.length === 0 ? (
              <p className="admin-loading">No orders yet.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Placed</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={`/track?order=${order.order_number}`}>
                          {order.order_number}
                        </Link>
                      </td>
                      <td>
                        {new Intl.DateTimeFormat("en-KE", {
                          dateStyle: "medium",
                        }).format(new Date(order.placed_at))}
                      </td>
                      <td>{formatPrice(order.total_kes)}</td>
                      <td>
                        <span className={`status ${order.status === "delivered" ? "status-delivered" : ""}`}>
                          {order.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <h3>Saved addresses</h3>
            {detail.addresses.length === 0 ? (
              <p className="admin-loading">No saved addresses.</p>
            ) : (
              detail.addresses.map((address) => (
                <div key={address.id} className="address-card">
                  <strong>
                    {address.label}
                    {address.is_default ? " · default" : ""}
                  </strong>
                  <span>
                    {address.recipient_name} · {address.phone}
                  </span>
                  <span>
                    {address.address_line_1}
                    {address.address_line_2
                      ? `, ${address.address_line_2}`
                      : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="button button-dark"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

function AdminCustomers() {
  const [customers, setCustomers] = useState<AdminCustomer[] | null>(() =>
    readRowCache<AdminCustomer>("admin-customers"),
  )
  const [view, setView] = useState<AdminView>("grid")
  const [search, setSearch] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)
  const [viewing, setViewing] = useState<AdminCustomer | null>(null)

  useEffect(() => {
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to view customers.")
      setLoading(false)
      return
    }

    const controller = new AbortController()
    fetch("/api/admin/customers", {
      headers: { Authorization: `Bearer ${session}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null)
        if (!response.ok)
          throw new Error(data?.error ?? "We could not load customers.")
        setCustomers(data.customers as AdminCustomer[])
        writeRowCache("admin-customers", data.customers as AdminCustomer[])
      })
      .catch((loadError: unknown) => {
        if (
          loadError instanceof DOMException &&
          loadError.name === "AbortError"
        )
          return
        setError(
          loadError instanceof Error
            ? loadError.message
            : "We could not load customers.",
        )
      })
      .finally(() => setLoading(false))

    return () => controller.abort()
  }, [])

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return customers ?? []
    return (customers ?? []).filter((customer) =>
      `${customer.name} ${customer.email} ${customer.phone ?? ""}`
        .toLowerCase()
        .includes(term),
    )
  }, [customers, search])

  function exportCsv() {
    const header = "Name,Email,Phone,Orders,Total spent,Joined\n"
    const body = filteredCustomers
      .map((customer) =>
        [
          `"${customer.name.replace(/"/g, '""')}"`,
          customer.email,
          customer.phone ?? "",
          customer.order_count,
          customer.total_spend,
          new Date(customer.created_at).toISOString().slice(0, 10),
        ].join(","),
      )
      .join("\n")
    const blob = new Blob([header + body], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "customers.csv"
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const joined = (customer: AdminCustomer) =>
    new Intl.DateTimeFormat("en-KE", {
      month: "short",
      year: "numeric",
    }).format(new Date(customer.created_at))

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>CRM</span>
          <h2>
            All customers <small>{filteredCustomers.length}</small>
          </h2>
        </div>
        <div className="admin-product-actions">
          <label>
            <Search />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by name or email"
            />
          </label>
          <ViewToggle view={view} onChange={setView} />
          <button
            type="button"
            className="button button-outline"
            onClick={exportCsv}
            disabled={filteredCustomers.length === 0}
          >
            <Pencil /> Export
          </button>
        </div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {customers === null && loading ? (
        <p className="admin-loading">Loading customers…</p>
      ) : filteredCustomers.length === 0 ? (
        <p className="admin-loading">No customers found.</p>
      ) : view === "grid" ? (
        <div className="admin-card-grid">
          {filteredCustomers.map((customer) => (
            <article key={customer.id} className="admin-entity-card">
              <div className="admin-entity-body">
                <div className="customer-cell">
                  <span className="cust-avatar">{customer.name[0]}</span>
                  <div>
                    <strong>{customer.name}</strong>
                    <small>{customer.email}</small>
                  </div>
                </div>
                <div className="admin-entity-meta">
                  <span>{customer.order_count} orders</span>
                  <span>{formatPrice(customer.total_spend)}</span>
                  <span>joined {joined(customer)}</span>
                </div>
              </div>
              <div className="table-actions">
                <button type="button" onClick={() => setViewing(customer)}>
                  View
                </button>
                <a href={`mailto:${customer.email}`}>Email</a>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Customer</th>
                <th>Phone</th>
                <th>Orders</th>
                <th>Total spent</th>
                <th>Joined</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map((customer) => (
                <tr key={customer.id}>
                  <td>
                    <div className="customer-cell">
                      <span className="cust-avatar">{customer.name[0]}</span>
                      <div>
                        <strong>{customer.name}</strong>
                        <small>{customer.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{customer.phone ?? "—"}</td>
                  <td>{customer.order_count}</td>
                  <td>{formatPrice(customer.total_spend)}</td>
                  <td>{joined(customer)}</td>
                  <td>
                    <div className="table-actions">
                      <button
                        type="button"
                        onClick={() => setViewing(customer)}
                      >
                        View
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {viewing && (
        <CustomerDetailModal
          customer={viewing}
          onClose={() => setViewing(null)}
        />
      )}
    </section>
  )
}

// ─── ADMIN CMS WORKSPACES ────────────────────────────────────

async function adminFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      ...authHeaders(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) throw new Error(data?.error ?? "Request failed.")
  return data as T
}

function AdminNotice({
  message,
  tone = "error",
}: {
  message: string
  tone?: "error" | "success"
}) {
  if (!message) return null
  return (
    <p className={tone === "error" ? "form-error" : "form-success"}>
      {message}
    </p>
  )
}

// ─── DELIVERIES ───

function AdminDeliveries() {
  const [rows, setRows] = useState<
    {
      id: string
      order_number: string
      status: string
      customer_name: string
      customer_phone: string | null
      delivery_address: { address?: string; area?: string } | null
      total_kes: number
      placed_at: string
    }[]
  >([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminFetch<{ deliveries: typeof rows }>("/api/admin/deliveries")
      .then((data) => setRows(data.deliveries))
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load deliveries."),
      )
      .finally(() => setLoading(false))
  }, [])

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Logistics</span>
          <h2>
            Active deliveries <small>{rows.length}</small>
          </h2>
        </div>
      </div>
      <AdminNotice message={error} />
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Phone</th>
                <th>Destination</th>
                <th>Total</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <strong>#{row.order_number}</strong>
                    <small>
                      {new Date(row.placed_at).toLocaleDateString("en-KE", {
                        day: "numeric",
                        month: "short",
                      })}
                    </small>
                  </td>
                  <td>{row.customer_name}</td>
                  <td>{row.customer_phone ?? "—"}</td>
                  <td>
                    {row.delivery_address?.address ?? "Pickup"}
                    {row.delivery_address?.area ? `, ${row.delivery_address.area}` : ""}
                  </td>
                  <td>{formatPrice(row.total_kes)}</td>
                  <td>
                    <span className={`status status-${row.status.replace(/_/g, "-")}`}>
                      {row.status.replace(/_/g, " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-copy">
          Nothing is awaiting dispatch. Orders move here once they are confirmed.
        </p>
      )}
    </section>
  )
}

// ─── PROMOTIONS & COUPONS ───

type AdminCoupon = {
  id: string
  code: string
  usage_count: number
  promotion_id: string
  name: string
  discount_type: string
  discount_value: number
  starts_at: string
  ends_at: string
  minimum_order_kes: number
  usage_limit: number | null
  status: string
}

function toIsoOffset(value: string) {
  return new Date(value).toISOString()
}

function AdminPromotions() {
  const [coupons, setCoupons] = useState<AdminCoupon[] | null>(() =>
    readRowCache<AdminCoupon>("admin-coupons"),
  )
  const [view, setView] = useState<AdminView>("grid")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const load = () => {
    adminFetch<{ coupons: AdminCoupon[] }>("/api/admin/coupons")
      .then((data) => {
        setCoupons(data.coupons)
        writeRowCache("admin-coupons", data.coupons)
        setError("")
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load coupons."),
      )
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    void load()
  }, [])

  async function setStatus(coupon: AdminCoupon, status: string) {
    try {
      await adminFetch(`/api/admin/coupons`, {
        method: "PATCH",
        body: JSON.stringify({ id: coupon.id, status }),
      })
      setCoupons((current) =>
        current
          ? current.map((c) => (c.id === coupon.id ? { ...c, status } : c))
          : current,
      )
      setNotice(`${coupon.code} is now ${status}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not update the coupon.")
    }
  }

  const discountLabel = (coupon: AdminCoupon) =>
    coupon.discount_type === "percentage"
      ? `${coupon.discount_value}%`
      : coupon.discount_type === "fixed"
        ? formatPrice(coupon.discount_value)
        : "Free delivery"

  const statusBadge = (coupon: AdminCoupon) => (
    <span
      className={`status status-${
        coupon.status === "active"
          ? "delivered"
          : coupon.status === "draft"
            ? "confirmed"
            : "out-for-delivery"
      }`}
    >
      {coupon.status}
    </span>
  )

  const renderActions = (coupon: AdminCoupon) => (
    <div className="table-actions">
      {coupon.status !== "active" && (
        <button type="button" onClick={() => setStatus(coupon, "active")}>
          Activate
        </button>
      )}
      {coupon.status === "active" && (
        <button type="button" onClick={() => setStatus(coupon, "disabled")}>
          Pause
        </button>
      )}
      {coupon.status !== "archived" && coupon.status !== "disabled" && (
        <button type="button" onClick={() => setStatus(coupon, "archived")}>
          Archive
        </button>
      )}
    </div>
  )

  return (
    <>
      <section className="table-card">
        <div className="admin-card-head">
          <div>
            <span>Discounts</span>
            <h2>
              Promotions & coupons <small>{coupons?.length ?? 0}</small>
            </h2>
          </div>
          <div className="admin-product-actions">
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              className="button button-dark"
              onClick={() => setShowForm(!showForm)}
            >
              <Plus /> New coupon
            </button>
          </div>
        </div>
        <AdminNotice message={error} />
        <AdminNotice message={notice} tone="success" />
        {showForm && <CouponForm onCreated={load} />}
        {coupons === null && loading ? (
          <p className="empty-copy">Loading live data…</p>
        ) : coupons === null || coupons.length === 0 ? (
          <p className="empty-copy">No coupons yet. Create the first one.</p>
        ) : view === "grid" ? (
          <div className="admin-card-grid">
            {coupons.map((coupon) => (
              <article key={coupon.id} className="admin-entity-card">
                <div className="admin-entity-body">
                  <strong>{coupon.code}</strong>
                  <span>{coupon.name}</span>
                  <div className="admin-entity-meta">
                    <strong>{discountLabel(coupon)}</strong>
                    <span>
                      {coupon.usage_count}
                      {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""} uses
                    </span>
                    {statusBadge(coupon)}
                  </div>
                  <span>
                    {new Date(coupon.starts_at).toLocaleDateString("en-KE")} →{" "}
                    {new Date(coupon.ends_at).toLocaleDateString("en-KE")}
                  </span>
                </div>
                {renderActions(coupon)}
              </article>
            ))}
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Promotion</th>
                  <th>Discount</th>
                  <th>Window</th>
                  <th>Usage</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td>
                      <strong>{coupon.code}</strong>
                    </td>
                    <td>{coupon.name}</td>
                    <td>
                      {discountLabel(coupon)}
                      {coupon.minimum_order_kes > 0 && (
                        <small> min {formatPrice(coupon.minimum_order_kes)}</small>
                      )}
                    </td>
                    <td>
                      {new Date(coupon.starts_at).toLocaleDateString("en-KE")}
                      {" → "}
                      {new Date(coupon.ends_at).toLocaleDateString("en-KE")}
                    </td>
                    <td>
                      {coupon.usage_count}
                      {coupon.usage_limit ? ` / ${coupon.usage_limit}` : ""}
                    </td>
                    <td>{statusBadge(coupon)}</td>
                    <td>{renderActions(coupon)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

function CouponForm({ onCreated }: { onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  return (
    <form
      className="admin-inline-form"
      onSubmit={async (event) => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        setSaving(true)
        setError("")
        try {
          await adminFetch("/api/admin/coupons", {
            method: "POST",
            body: JSON.stringify({
              name: values.get("name"),
              code: String(values.get("code") ?? "").toUpperCase(),
              discountType: values.get("discountType"),
              discountValue: Number(values.get("discountValue")),
              startsAt: toIsoOffset(String(values.get("startsAt"))),
              endsAt: toIsoOffset(String(values.get("endsAt"))),
              minimumOrderKes: Number(values.get("minimumOrderKes") || 0),
              usageLimit: values.get("usageLimit")
                ? Number(values.get("usageLimit"))
                : undefined,
              status: values.get("status"),
            }),
          })
          onCreated()
        } catch (e) {
          setError(e instanceof Error ? e.message : "We could not create the coupon.")
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="form-grid">
        <label>
          Promotion name
          <input name="name" required placeholder="October welcome offer" />
        </label>
        <label>
          Coupon code
          <input name="code" required placeholder="WELCOME10" />
        </label>
        <label>
          Discount type
          <select name="discountType" defaultValue="percentage">
            <option value="percentage">Percentage</option>
            <option value="fixed">Fixed amount (KES)</option>
            <option value="free_delivery">Free delivery</option>
          </select>
        </label>
        <label>
          Value
          <input name="discountValue" type="number" min="0" required defaultValue={10} />
        </label>
        <label>
          Starts
          <input name="startsAt" type="datetime-local" required />
        </label>
        <label>
          Ends
          <input name="endsAt" type="datetime-local" required />
        </label>
        <label>
          Minimum order (KES)
          <input name="minimumOrderKes" type="number" min="0" defaultValue={0} />
        </label>
        <label>
          Usage limit (optional)
          <input name="usageLimit" type="number" min="1" />
        </label>
        <label>
          Status
          <select name="status" defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
          </select>
        </label>
      </div>
      <AdminNotice message={error} />
      <button type="submit" className="button button-dark" disabled={saving}>
        {saving ? "Saving…" : "Create coupon"}
      </button>
    </form>
  )
}

// ─── REVIEW MODERATION ───

type AdminReview = {
  id: string
  rating: number
  body: string
  status: string
  is_verified_purchase: boolean
  created_at: string
  product_name: string
  product_slug: string
  customer_email: string
  first_name: string
  last_name: string
}

function AdminReviews() {
  const [statusFilter, setStatusFilter] = useState("draft")
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    adminFetch<{ reviews: AdminReview[] }>(
      `/api/admin/reviews?status=${statusFilter}`,
    )
      .then((data) => {
        setReviews(data.reviews)
        setError("")
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load reviews."),
      )
      .finally(() => setLoading(false))
  }, [statusFilter])

  async function moderate(review: AdminReview, status: string) {
    try {
      await adminFetch("/api/admin/reviews", {
        method: "PATCH",
        body: JSON.stringify({ id: review.id, status }),
      })
      setReviews((current) =>
        current.filter((item) => item.id !== review.id),
      )
      setNotice(
        status === "active"
          ? "Review published to the storefront."
          : `Review ${status}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not update the review.")
    }
  }

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Social proof</span>
          <h2>Review moderation</h2>
        </div>
        <div className="orders-filters compact">
          {["draft", "active", "disabled", "all"].map((value) => (
            <button
              key={value}
              type="button"
              className={statusFilter === value ? "active" : ""}
              onClick={() => setStatusFilter(value)}
            >
              {value === "all" ? "All" : value}
            </button>
          ))}
        </div>
      </div>
      <AdminNotice message={error} />
      <AdminNotice message={notice} tone="success" />
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : reviews.length ? (
        <div className="review-queue">
          {reviews.map((review) => (
            <article className="review-queue-item" key={review.id}>
              <div className="review-queue-head">
                <strong>
                  {review.first_name} {review.last_name[0]}. ·{" "}
                  <Link to={`/shop`} className="product-detail-link">
                    {review.product_name}
                  </Link>
                </strong>
                <span className="rating">
                  {Array.from({ length: review.rating }).map((_, i) => (
                    <Star key={i} size={12} fill="currentColor" />
                  ))}
                </span>
              </div>
              <p>{review.body}</p>
              <div className="review-queue-foot">
                <small>
                  {new Date(review.created_at).toLocaleDateString("en-KE", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                  {review.is_verified_purchase ? " · Verified purchase" : ""}
                </small>
                <div className="table-actions">
                  <button type="button" onClick={() => moderate(review, "active")}>
                    Approve
                  </button>
                  <button type="button" onClick={() => moderate(review, "disabled")}>
                    Reject
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty-copy">
          {statusFilter === "draft"
            ? "No reviews are waiting for moderation."
            : "Nothing to show for this filter."}
        </p>
      )}
    </section>
  )
}

// ─── SUPPORT INBOX ───

type AdminTicket = {
  id: string
  ticket_number: string
  subject: string
  category: string
  status: string
  priority: string
  created_at: string
  message_count: number
  customer_name?: string
  customer_email?: string
}

function AdminSupportInbox() {
  const [tickets, setTickets] = useState<AdminTicket[]>([])
  const [selected, setSelected] = useState<AdminTicket | null>(null)
  const [messages, setMessages] = useState<
    { id: string; body: string; created_at: string; author_role: string }[]
  >([])
  const [reply, setReply] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = () =>
    adminFetch<{ tickets: AdminTicket[] }>("/api/admin/support")
      .then((data) => {
        setTickets(data.tickets)
        setError("")
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load tickets."),
      )
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  async function open(ticket: AdminTicket) {
    setSelected(ticket)
    setReply("")
    try {
      const data = await adminFetch<{ messages: typeof messages }>(
        `/api/admin/support/${ticket.id}`,
      )
      setMessages(data.messages)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not load the thread.")
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return
    try {
      await adminFetch(`/api/admin/support/${selected.id}`, {
        method: "POST",
        body: JSON.stringify({ body: reply.trim() }),
      })
      const data = await adminFetch<{ messages: typeof messages }>(
        `/api/admin/support/${selected.id}`,
      )
      setMessages(data.messages)
      setReply("")
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not send your reply.")
    }
  }

  async function updateTicket(patch: { status?: string; priority?: string }) {
    if (!selected) return
    try {
      const data = await adminFetch<{ ticket: AdminTicket }>(
        `/api/admin/support/${selected.id}`,
        { method: "PATCH", body: JSON.stringify(patch) },
      )
      setSelected((current) =>
        current ? { ...current, ...data.ticket } : current,
      )
      setTickets((current) =>
        current.map((t) => (t.id === selected.id ? { ...t, ...data.ticket } : t)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not update the ticket.")
    }
  }

  return (
    <div className="support-inbox">
      <section className="table-card">
        <div className="admin-card-head">
          <div>
            <span>Customer care</span>
            <h2>
              Tickets <small>{tickets.length}</small>
            </h2>
          </div>
        </div>
        <AdminNotice message={error} />
        {loading ? (
          <p className="empty-copy">Loading live data…</p>
        ) : tickets.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Reference</th>
                  <th>Subject</th>
                  <th>Category</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {tickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    className={selected?.id === ticket.id ? "selected-row" : ""}
                  >
                    <td>
                      <strong>{ticket.ticket_number}</strong>
                    </td>
                    <td>
                      {ticket.subject}
                      <small> · {ticket.message_count} messages</small>
                    </td>
                    <td>{ticket.category.replace(/_/g, " ")}</td>
                    <td>
                      <span
                        className={`priority priority-${ticket.priority}`}
                      >
                        {ticket.priority}
                      </span>
                    </td>
                    <td>
                      <span className={`status status-${ticket.status}`}>
                        {ticket.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td>
                      <button type="button" onClick={() => open(ticket)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-copy">The inbox is clear. No customer tickets.</p>
        )}
      </section>
      {selected && (
        <section className="table-card support-thread-card">
          <div className="admin-card-head">
            <div>
              <span>{selected.ticket_number}</span>
              <h2>{selected.subject}</h2>
            </div>
            <button type="button" className="icon-button" onClick={() => setSelected(null)}>
              <X />
            </button>
          </div>
          <div className="support-thread is-admin">
            {messages.map((message) => (
              <div
                key={message.id}
                className={
                  message.author_role === "customer"
                    ? "support-message is-customer"
                    : "support-message is-staff"
                }
              >
                <p>{message.body}</p>
                <small>
                  {message.author_role === "customer"
                    ? "Customer"
                    : message.author_role === "super_admin" ||
                        message.author_role === "manager"
                      ? "Manager"
                      : "Henry's team"}{" "}
                  ·{" "}
                  {new Date(message.created_at).toLocaleString("en-KE", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </small>
              </div>
            ))}
          </div>
          {selected.status !== "closed" && (
            <div className="support-reply-form">
              <input
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Reply to the customer…"
              />
              <button type="button" className="button button-dark" onClick={sendReply}>
                Reply
              </button>
            </div>
          )}
          <div className="support-admin-controls">
            <label>
              Status
              <select
                value={selected.status}
                onChange={(event) => updateTicket({ status: event.target.value })}
              >
                <option value="open">Open</option>
                <option value="answered">Answered</option>
                <option value="closed">Closed</option>
              </select>
            </label>
            <label>
              Priority
              <select
                value={selected.priority}
                onChange={(event) => updateTicket({ priority: event.target.value })}
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
          </div>
        </section>
      )}
    </div>
  )
}

// ─── REPORTS ───

function AdminReports() {
  const [data, setData] = useState<{
    summary: { period: string; revenue: number; orders: number }[]
    topProducts: {
      name: string
      brand: string
      units_sold: number
      revenue: number
    }[]
    ordersByDay: { day: string; revenue: number; orders: number }[]
  } | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    adminFetch<NonNullable<typeof data>>("/api/admin/reports")
      .then(setData)
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load reports."),
      )
  }, [])

  const periodLabels: Record<string, string> = {
    today: "Today",
    this_week: "This week",
    this_month: "This month",
  }

  return (
    <>
      <AdminNotice message={error} />
      {data ? (
        <>
          <section className="reports-summary">
            {data.summary.map((row) => (
              <article className="report-kpi" key={row.period}>
                <span>{periodLabels[row.period] ?? row.period}</span>
                <strong>{formatPrice(row.revenue)}</strong>
                <small>{row.orders} orders</small>
              </article>
            ))}
          </section>
          <section className="table-card">
            <div className="admin-card-head">
              <div>
                <span>Trend</span>
                <h2>Daily revenue (30 days)</h2>
              </div>
            </div>
            {data.ordersByDay.length ? (
              <div className="live-chart tall">
                {data.ordersByDay.map((point) => {
                  const max = Math.max(
                    ...data.ordersByDay.map((p) => p.revenue),
                    1,
                  )
                  return (
                    <div
                      className="live-chart-col"
                      key={point.day}
                      title={`${formatPrice(point.revenue)} · ${point.orders} orders`}
                    >
                      <div
                        className="live-chart-bar"
                        style={{
                          height: `${Math.max(2, (point.revenue / max) * 100)}%`,
                        }}
                      />
                      <span>
                        {new Date(point.day).toLocaleDateString("en-KE", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="empty-copy">
                Revenue appears here once orders start coming in.
              </p>
            )}
          </section>
          <section className="table-card">
            <div className="admin-card-head">
              <div>
                <span>Best sellers</span>
                <h2>Top products (30 days)</h2>
              </div>
            </div>
            {data.topProducts.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th>Brand</th>
                      <th>Units sold</th>
                      <th>Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topProducts.map((product) => (
                      <tr key={`${product.name}-${product.brand}`}>
                        <td>
                          <strong>{product.name}</strong>
                        </td>
                        <td>{product.brand}</td>
                        <td>{product.units_sold}</td>
                        <td>{formatPrice(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="empty-copy">No sales recorded in this window.</p>
            )}
          </section>
        </>
      ) : !error ? (
        <p className="empty-copy">Loading live data…</p>
      ) : null}
    </>
  )
}

// ─── STAFF ───

function AdminStaff() {
  const claims = getSessionClaims()
  const [staff, setStaff] = useState<
    {
      id: string
      email: string
      role: string
      first_name: string
      last_name: string
      phone: string | null
      created_at: string
      last_sign_in_at: string | null
      is_active: boolean
    }[]
  >([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)

  async function loadStaff() {
    setLoading(true)
    try {
      const data = await adminFetch<{ staff: typeof staff }>("/api/admin/staff")
      setStaff(data.staff)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not load staff.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void loadStaff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <section className="table-card">
        <div className="admin-card-head">
          <div>
            <span>Team</span>
            <h2>
              Staff accounts <small>{staff.length}</small>
            </h2>
          </div>
        </div>
        <AdminNotice message={error} />
        <AdminNotice message={notice} tone="success" />
        {loading ? (
          <p className="empty-copy">Loading live data…</p>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Last sign-in</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <strong>
                        {member.first_name} {member.last_name}
                      </strong>
                    </td>
                    <td>{member.email}</td>
                    <td>
                      <span className="status">{ROLE_LABELS[member.role] ?? member.role}</span>
                    </td>
                    <td>
                      {member.last_sign_in_at
                        ? new Date(member.last_sign_in_at).toLocaleDateString("en-KE", {
                            day: "numeric",
                            month: "short",
                          })
                        : "Never"}
                    </td>
                    <td>{member.is_active ? "Active" : "Disabled"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {claims?.role === "super_admin" && (
        <form
          className="admin-inline-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const values = new FormData(event.currentTarget)
            try {
              const data = await adminFetch<{
                message: string
                staff: { email: string; temporaryPassword: string }
              }>("/api/admin/staff", {
                method: "POST",
                body: JSON.stringify({
                  email: values.get("email"),
                  firstName: values.get("firstName"),
                  lastName: values.get("lastName"),
                  role: values.get("role"),
                  phone: values.get("phone") || undefined,
                }),
              })
              setNotice(
                `${data.message} ${data.staff.email} can sign in with ${data.staff.temporaryPassword} and change it from their profile.`,
              )
              event.currentTarget.reset()
              void loadStaff()
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "We could not invite this member.",
              )
            }
          }}
        >
          <h3>Invite a team member</h3>
          <div className="form-grid">
            <label>
              First name
              <input name="firstName" required />
            </label>
            <label>
              Last name
              <input name="lastName" required />
            </label>
            <label>
              Email
              <input name="email" type="email" required />
            </label>
            <label>
              Phone
              <input name="phone" placeholder="+254…" />
            </label>
            <label>
              Role
              <select name="role" defaultValue="sales">
                <option value="manager">Manager</option>
                <option value="sales">Sales</option>
                <option value="inventory">Inventory</option>
                <option value="delivery">Delivery</option>
                <option value="support">Support</option>
              </select>
            </label>
          </div>
          <button type="submit" className="button button-dark">
            Send invitation
          </button>
        </form>
      )}
    </>
  )
}

// ─── STAFF NOTIFICATIONS ───

const STAFF_NOTIFICATION_COPY: Record<string, string> = {
  "order-created": "A new order was placed",
  "order-received": "New order needs attention",
  "order-delivered": "Order marked delivered",
  "order-cancelled": "Order cancelled",
  "support-reply": "Support reply sent",
  "password-changed": "Password changed",
}

function AdminNotifications() {
  const [items, setItems] = useState<
    {
      id: string
      template_key: string
      payload: Record<string, unknown> | null
      created_at: string
      is_read: boolean
    }[]
  >([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  const load = () =>
    adminFetch<{ notifications: typeof items }>("/api/notifications")
      .then((data) => {
        setItems(data.notifications)
        setError("")
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "We could not load notifications.",
        ),
      )
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Activity</span>
          <h2>
            Notifications <small>{items.length}</small>
          </h2>
        </div>
        <button
          type="button"
          className="button button-outline"
          onClick={async () => {
            try {
              await adminFetch("/api/notifications", {
                method: "PATCH",
                body: JSON.stringify({ markAll: true }),
              })
              setItems((current) =>
                current.map((item) => ({ ...item, is_read: true })),
              )
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "We could not update notifications.",
              )
            }
          }}
        >
          Mark all as read
        </button>
      </div>
      <AdminNotice message={error} />
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : items.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Detail</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>
                      {STAFF_NOTIFICATION_COPY[item.template_key] ??
                        item.template_key.replace(/[_-]/g, " ")}
                    </strong>
                  </td>
                  <td>
                    {typeof item.payload?.orderNumber === "string" ? (
                      <div className="notif-detail">
                        <strong>#{item.payload.orderNumber}</strong>
                        {Array.isArray(item.payload.items) && (
                          <span>
                            {(
                              item.payload.items as {
                                name: string
                                quantity: number
                              }[]
                            )
                              .map((line) => `${line.name} × ${line.quantity}`)
                              .join(", ")}
                          </span>
                        )}
                        <span>
                          {[
                            typeof item.payload.totalKes === "number"
                              ? formatPrice(item.payload.totalKes)
                              : "",
                            typeof item.payload.customerName === "string"
                              ? item.payload.customerName
                              : "",
                            typeof item.payload.location === "string"
                              ? item.payload.location
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>
                    ) : typeof item.payload?.message === "string" ? (
                      String(item.payload.message)
                    ) : (
                      "—"
                    )}
                    {!item.is_read && <span className="unread-dot" />}
                  </td>
                  <td>
                    {new Date(item.created_at).toLocaleString("en-KE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td>
                    {!item.is_read && (
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await adminFetch("/api/notifications", {
                              method: "PATCH",
                              body: JSON.stringify({ id: item.id }),
                            })
                            setItems((current) =>
                              current.map((n) =>
                                n.id === item.id ? { ...n, is_read: true } : n,
                              ),
                            )
                          } catch {
                            setError("We could not update this notification.")
                          }
                        }}
                      >
                        Mark read
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-copy">No notifications yet.</p>
      )}
    </section>
  )
}

// ─── AUDIT LOGS ───

function AdminAudit() {
  const [resource, setResource] = useState("")
  const [events, setEvents] = useState<
    {
      id: string
      action: string
      resource_type: string
      actor: string
      old_value: Record<string, unknown> | null
      new_value: Record<string, unknown> | null
      created_at: string
    }[]
  >([])
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    adminFetch<{ events: typeof events }>(
      `/api/admin/audit-logs${resource ? `?resource=${resource}` : ""}`,
    )
      .then((data) => {
        setEvents(data.events)
        setError("")
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "We could not load audit history.",
        ),
      )
      .finally(() => setLoading(false))
  }, [resource])

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Compliance</span>
          <h2>
            Audit trail <small>{events.length}</small>
          </h2>
        </div>
        <select
          aria-label="Filter by resource"
          value={resource}
          onChange={(event) => setResource(event.target.value)}
        >
          <option value="">All resources</option>
          <option value="order">Orders</option>
          <option value="coupon">Coupons</option>
          <option value="collection">Collections</option>
          <option value="banner">Banners</option>
          <option value="review">Reviews</option>
          <option value="settings">Settings</option>
          <option value="support_ticket">Support</option>
          <option value="cms_page">Pages</option>
        </select>
      </div>
      <AdminNotice message={error} />
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : events.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Resource</th>
                <th>Actor</th>
                <th>Change</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>
                    <strong>{event.action}</strong>
                  </td>
                  <td>{event.resource_type}</td>
                  <td>{event.actor}</td>
                  <td className="audit-value">
                    {JSON.stringify(event.new_value ?? event.old_value ?? {}).slice(0, 120)}
                  </td>
                  <td>
                    {new Date(event.created_at).toLocaleString("en-KE", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-copy">No recorded actions for this filter.</p>
      )}
    </section>
  )
}

// ─── SETTINGS ───

function AdminSettings() {
  const [settings, setSettings] = useState<
    { key: string; value: unknown; updated_at: string }[]
  >([])
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)

  useEffect(() => {
    adminFetch<{ settings: { key: string; value: unknown; updated_at: string }[] }>(
      "/api/admin/settings",
    )
      .then((data) => {
        setSettings(data.settings)
        setDrafts(
          Object.fromEntries(
            data.settings.map((row) => [row.key, JSON.stringify(row.value, null, 2)]),
          ),
        )
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "We could not load store settings.",
        ),
      )
      .finally(() => setLoading(false))
  }, [])

  async function save(key: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(drafts[key] ?? "{}")
    } catch {
      setError(`${key} is not valid JSON. Fix it before saving.`)
      return
    }
    setSavingKey(key)
    setError("")
    setNotice("")
    try {
      await adminFetch("/api/admin/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: { [key]: parsed } }),
      })
      setNotice(`${key} updated.`)
      setSettings((current) =>
        current.map((row) =>
          row.key === key ? { ...row, value: parsed, updated_at: new Date().toISOString() } : row,
        ),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save this setting.")
    } finally {
      setSavingKey(null)
    }
  }

  if (loading) return <p className="empty-copy">Loading live data…</p>

  const descriptions: Record<string, string> = {
    business: "Store name, tagline and support identity.",
    contact: "Phone, email and physical address shown across the site.",
    delivery: "Delivery fee and free-delivery threshold used at checkout.",
    hours: "Opening hours rendered on the contact page.",
    social: "Social media links used in the footer.",
    age_verification: "Age gate copy and requirements.",
    legal: "Legal page references.",
  }

  return (
    <>
      <AdminNotice message={error} />
      <AdminNotice message={notice} tone="success" />
      <div className="settings-grid">
        {settings.map((row) => (
          <section className="table-card" key={row.key}>
            <div className="admin-card-head">
              <div>
                <span>settings.{row.key}</span>
                <h2>{row.key.replace(/_/g, " ")}</h2>
              </div>
            </div>
            {descriptions[row.key] && (
              <p className="empty-copy">{descriptions[row.key]}</p>
            )}
            <textarea
              className="settings-json"
              rows={10}
              spellCheck={false}
              value={drafts[row.key] ?? ""}
              onChange={(event) =>
                setDrafts((current) => ({
                  ...current,
                  [row.key]: event.target.value,
                }))
              }
            />
            <div className="settings-actions">
              <small>
                Updated{" "}
                {new Date(row.updated_at).toLocaleDateString("en-KE", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </small>
              <button
                type="button"
                className="button button-dark"
                disabled={savingKey === row.key}
                onClick={() => save(row.key)}
              >
                {savingKey === row.key ? "Saving…" : "Save"}
              </button>
            </div>
          </section>
        ))}
      </div>
    </>
  )
}

// ─── SHARED ADMIN COMPONENTS ──────────────────────────────────────────────────

function EditProductModal({
  product,
  onClose,
  onSaved,
}: {
  product: Product
  onClose: () => void
  onSaved: () => void
}) {
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [imageUrl, setImageUrl] = useState(product.image ?? "")
  const [imageAssetId, setImageAssetId] = useState<string | undefined>(
    undefined,
  )
  const [options, setOptions] = useState<{
    brands: Array<{ id: string; name: string }>
    categories: Array<{ id: string; name: string }>
  }>({ brands: [], categories: [] })
  const [brandId, setBrandId] = useState(product.brandId ?? "")
  const [categoryId, setCategoryId] = useState(product.categoryId ?? "")

  useEffect(() => {
    fetch("/api/catalogue/options")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error()),
      )
      .then(setOptions)
      .catch(() => {})
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const session = sessionStorage.getItem("henrys-session")
    if (!session)
      return setError("Sign in with a staff account to edit products.")
    const values = new FormData(event.currentTarget)
    const volumeRaw = String(values.get("volume") ?? "").replace(/\D/g, "")
    const abvRaw = String(values.get("alcoholPercentage") ?? "").trim()
    setSaving(true)
    setError("")
    try {
      const response = await fetch(`/api/admin/products/${product.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: String(values.get("name") ?? "").trim(),
          description: String(values.get("description") ?? ""),
          shortDescription: String(values.get("shortDescription") ?? ""),
          countryOfOrigin: String(values.get("countryOfOrigin") ?? ""),
          servingSuggestion: String(values.get("servingSuggestion") ?? ""),
          alcoholPercentage: abvRaw === "" ? undefined : Number(abvRaw),
          brandId: String(values.get("brandId") ?? "") || undefined,
          categoryId: String(values.get("categoryId") ?? "") || undefined,
          status: values.get("status"),
          imageAssetId,
          variantId: product.variantId,
          volumeMl: volumeRaw ? Number(volumeRaw) : undefined,
          sku: String(values.get("sku") ?? "").trim() || undefined,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok)
        throw new Error(data?.error ?? "We could not save this product.")
      rowCaches.delete("admin-products")
      onSaved()
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "We could not save this product.",
      )
    } finally {
      setSaving(false)
    }
  }
  return (
    <div className="modal-overlay">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Catalogue management</span>
            <h2>Edit product</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        <form onSubmit={submit}>
          <div className="form-section">
            <h3>Product information</h3>
            <div className="form-grid">
              <label className="span-2">
                Product name
                <input name="name" required defaultValue={product.name} />
              </label>
              <label>
                Brand
                <select
                  name="brandId"
                  value={brandId}
                  onChange={(event) => setBrandId(event.target.value)}
                >
                  <option value="">Select a brand</option>
                  {options.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                >
                  <option value="">Select a category</option>
                  {options.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SKU
                <input name="sku" defaultValue={product.sku ?? ""} />
              </label>
              <label>
                Volume (ml)
                <input
                  name="volume"
                  type="number"
                  min="1"
                  defaultValue={
                    product.volumeMl ??
                    (parseInt(String(product.volume).replace(/\D/g, "")) || "")
                  }
                />
              </label>
              <label>
                ABV (% vol)
                <input
                  name="alcoholPercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  defaultValue={
                    product.alcoholPercentage != null
                      ? product.alcoholPercentage
                      : ""
                  }
                />
              </label>
              <label>
                Country of origin
                <input
                  name="countryOfOrigin"
                  defaultValue={product.countryOfOrigin ?? ""}
                />
              </label>
              <label className="span-2">
                Serving suggestion
                <input
                  name="servingSuggestion"
                  defaultValue={product.servingSuggestion ?? ""}
                />
              </label>
              <label className="span-2">
                Short description
                <textarea
                  name="shortDescription"
                  rows={2}
                  defaultValue={product.shortDescription ?? ""}
                />
              </label>
              <label className="span-2">
                Full description
                <textarea
                  name="description"
                  rows={4}
                  defaultValue={product.description ?? ""}
                />
              </label>
              <label>
                Status
                <select name="status" defaultValue={product.status ?? "active"}>
                  <option value="active">Active</option>
                  <option value="draft">Draft</option>
                  <option value="disabled">Hidden</option>
                </select>
              </label>
            </div>
            <h3>Product image</h3>
            <ImagePicker
              value={imageUrl}
              onPick={(asset) => {
                setImageUrl(asset.url)
                setImageAssetId(asset.id)
              }}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button button-dark" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ProductModal({
  onClose,
  onSaved,
}: {
  onClose: () => void
  onSaved: () => void
}) {
  const [image, setImage] = useState<{ id: string; url: string } | null>(null)
  const [options, setOptions] = useState<{
    brands: Array<{
      id: string
      name: string
    }>
    categories: Array<{
      id: string
      name: string
    }>
  }>({ brands: [], categories: [] })
  const [error, setError] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetch("/api/catalogue/options")
      .then((response) =>
        response.ok ? response.json() : Promise.reject(new Error()),
      )
      .then(setOptions)
      .catch(() =>
        setError("We could not load categories and brands. Please try again."),
      )
  }, [])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const session = sessionStorage.getItem("henrys-session")
    if (!session) {
      setError("Sign in with a staff account to create products.")
      return
    }
    const values = new FormData(event.currentTarget)
    const name = String(values.get("name")).trim()
    const volumeMl = Number(String(values.get("volume")).replace(/\D/g, ""))
    if (!volumeMl) {
      setError("Enter a volume such as 700ml.")
      return
    }

    setError("")
    setIsSubmitting(true)
    try {
      const response = await fetch("/api/products", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          slug: name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, ""),
          brandId: values.get("brandId"),
          categoryId: values.get("categoryId"),
          description:
            String(values.get("description") || "").trim() || undefined,
          shortDescription:
            String(values.get("shortDescription") || "").trim() || undefined,
          countryOfOrigin:
            String(values.get("countryOfOrigin") || "").trim() || undefined,
          alcoholPercentage: values.get("alcoholPercentage")
            ? Number(values.get("alcoholPercentage"))
            : undefined,
          servingSuggestion:
            String(values.get("servingSuggestion") || "").trim() || undefined,
          status: "active",
          featured: false,
          imageAssetId: image?.id,
          variants: [
            {
              sku: String(values.get("sku")).trim(),
              volumeMl,
              price: Number(values.get("price")),
              compareAtPrice: values.get("oldPrice")
                ? Number(values.get("oldPrice"))
                : null,
              stock: Number(values.get("stock")),
            },
          ],
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        throw new Error(data?.error ?? "We could not create this product.")
      }
      rowCaches.delete("admin-products")
      onSaved()
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "We could not create this product.",
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Catalogue management</span>
            <h2>Add new product</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-section">
            <h3>Product information</h3>
            <div className="form-grid">
              <label className="span-2">
                Product name
                <input
                  name="name"
                  required
                  placeholder="e.g. Johnnie Walker Black Label"
                />
              </label>
              <label>
                Brand
                <select
                  name="brandId"
                  required
                  disabled={!options.brands.length}
                >
                  <option value="">Select a brand</option>
                  {options.brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Category
                <select
                  name="categoryId"
                  required
                  disabled={!options.categories.length}
                >
                  <option value="">Select a category</option>
                  {options.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                SKU
                <input name="sku" required placeholder="HLH-0000" />
              </label>
              <label>
                Volume
                <input name="volume" required placeholder="700ml" />
              </label>
              <label>
                ABV (% vol)
                <input
                  name="alcoholPercentage"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="40"
                />
              </label>
              <label>
                Country of origin
                <input name="countryOfOrigin" placeholder="Kenya" />
              </label>
              <label className="span-2">
                Serving suggestion
                <input
                  name="servingSuggestion"
                  placeholder="Neat or on the rocks. Best enjoyed between 15–18°C."
                />
              </label>
              <label className="span-2">
                Short description
                <textarea
                  name="shortDescription"
                  rows={2}
                  placeholder="A concise customer-facing summary"
                />
              </label>
              <label className="span-2">
                Full description
                <textarea
                  name="description"
                  rows={4}
                  placeholder="Tasting notes, background, and pairing ideas"
                />
              </label>
            </div>
          </div>
          <div className="form-section">
            <h3>Pricing & inventory</h3>
            <div className="form-grid three">
              <label>
                Selling price (KES)
                <input
                  name="price"
                  required
                  type="number"
                  min="0"
                  placeholder="0"
                />
              </label>
              <label>
                Previous price
                <input name="oldPrice" type="number" min="0" placeholder="0" />
              </label>
              <label>
                Stock quantity
                <input
                  name="stock"
                  required
                  type="number"
                  min="0"
                  placeholder="0"
                />
              </label>
            </div>
          </div>
          <div className="form-section">
            <h3>Product images</h3>
            <ImagePicker value={image?.url ?? ""} onPick={setImage} />
          </div>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button button-dark"
              disabled={
                isSubmitting ||
                !options.brands.length ||
                !options.categories.length
              }
            >
              {isSubmitting ? "Creating..." : "Create product"}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      </div>
    </div>
  )
}

function AdminWebsite() {
  const [tab, setTab] = useState<"pages" | "banners" | "collections">("pages")
  return (
    <>
      <div className="orders-filters cms-tabs">
        {(
          [
            { key: "pages", label: "Site pages" },
            { key: "banners", label: "Banners" },
            { key: "collections", label: "Collections" },
          ] as const
        ).map((item) => (
          <button
            key={item.key}
            type="button"
            className={tab === item.key ? "active" : ""}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {tab === "pages" ? (
        <AdminCmsPages />
      ) : tab === "banners" ? (
        <AdminBanners />
      ) : (
        <AdminCollections />
      )}
    </>
  )
}

function AdminCmsPages() {
  const [pages, setPages] = useState<
    {
      slug: string
      title: string
      status: string
      body: CmsPageBody | null
      seo_title: string | null
      seo_description: string | null
      updated_at: string
      updated_by: string | null
    }[]
  >([])
  const [editing, setEditing] = useState<null | {
    isNew: boolean
    slug: string
    title: string
    status: "draft" | "active" | "disabled"
    eyebrow: string
    copy: string
    sections: CmsSection[]
    seoTitle: string
    seoDescription: string
  }>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState("")
  const claims = getSessionClaims()
  const canDelete = ["super_admin", "manager"].includes(claims?.role ?? "")

  const load = () =>
    adminFetch<{ pages: typeof pages }>("/api/admin/pages")
      .then((data) => {
        setPages(data.pages)
        setError("")
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load pages."),
      )
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  function openEditor(page?: (typeof pages)[number]) {
    setNotice("")
    setError("")
    setEditing(
      page
        ? {
            isNew: false,
            slug: page.slug,
            title: page.title,
            status: page.status as "draft" | "active" | "disabled",
            eyebrow: page.body?.eyebrow ?? "",
            copy: page.body?.copy ?? "",
            sections: page.body?.sections ?? [],
            seoTitle: page.seo_title ?? "",
            seoDescription: page.seo_description ?? "",
          }
        : {
            isNew: true,
            slug: "",
            title: "",
            status: "draft",
            eyebrow: "",
            copy: "",
            sections: [],
            seoTitle: "",
            seoDescription: "",
          },
    )
  }

  async function savePage() {
    if (!editing) return
    setSaving(true)
    setError("")
    setNotice("")
    try {
      await adminFetch("/api/cms/pages", {
        method: "POST",
        body: JSON.stringify({
          slug: editing.slug,
          title: editing.title,
          body: {
            eyebrow: editing.eyebrow || undefined,
            copy: editing.copy || undefined,
            sections: editing.sections.filter((s) => s.heading || s.body),
          },
          seoTitle: editing.seoTitle || undefined,
          seoDescription: editing.seoDescription || undefined,
          status: editing.status,
        }),
      })
      setNotice(
        editing.status === "active"
          ? "Page published."
          : editing.status === "disabled"
            ? "Page unpublished."
            : "Draft saved.",
      )
      await load()
      if (editing.status !== "draft") setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not save this page.")
    } finally {
      setSaving(false)
    }
  }

  async function removePage(page: { slug: string; title: string }) {
    if (
      !window.confirm(
        `Delete the page “${page.title}”? This cannot be undone.`,
      )
    )
      return
    setDeleting(page.slug)
    setError("")
    setNotice("")
    try {
      const response = await fetch(
        `/api/admin/pages/${encodeURIComponent(page.slug)}`,
        { method: "DELETE", headers: authHeaders() },
      )
      if (!response.ok && response.status !== 404) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.error ?? "We could not delete this page.")
      }
      setNotice(`Deleted “${page.title}”.`)
      await load()
    } catch (actionError) {
      setError(
        actionError instanceof Error
          ? actionError.message
          : "We could not delete this page.",
      )
    } finally {
      setDeleting("")
    }
  }

  if (editing) {
    return (
      <section className="table-card cms-editor">
        <div className="admin-card-head">
          <div>
            <span>Content management</span>
            <h2>{editing.isNew ? "New page" : `Editing ${editing.slug}`}</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => setEditing(null)}>
            <X />
          </button>
        </div>
        <div className="cms-form">
          <div className="cms-form-grid">
            <label className="co-label">
              Page title
              <input
                value={editing.title}
                onChange={(e) => setEditing({ ...editing, title: e.target.value })}
              />
            </label>
            <label className="co-label">
              URL slug
              <input
                value={editing.slug}
                disabled={!editing.isNew}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    slug: e.target.value
                      .toLowerCase()
                      .trim()
                      .replace(/\s+/g, "-"),
                  })
                }
              />
            </label>
            <label className="co-label">
              Eyebrow
              <input
                value={editing.eyebrow}
                onChange={(e) =>
                  setEditing({ ...editing, eyebrow: e.target.value })
                }
              />
            </label>
            <label className="co-label">
              Lead copy
              <textarea
                rows={3}
                value={editing.copy}
                onChange={(e) => setEditing({ ...editing, copy: e.target.value })}
              />
            </label>
            <label className="co-label">
              SEO title
              <input
                value={editing.seoTitle}
                onChange={(e) =>
                  setEditing({ ...editing, seoTitle: e.target.value })
                }
              />
            </label>
            <label className="co-label">
              SEO description
              <input
                value={editing.seoDescription}
                onChange={(e) =>
                  setEditing({ ...editing, seoDescription: e.target.value })
                }
              />
            </label>
          </div>
          <div className="cms-sections">
            <h3>Content sections</h3>
            {editing.sections.map((section, index) => (
              <div className="cms-section" key={index}>
                <input
                  placeholder="Section heading"
                  value={section.heading ?? ""}
                  onChange={(e) => {
                    const sections = [...editing.sections]
                    sections[index] = { ...sections[index], heading: e.target.value }
                    setEditing({ ...editing, sections })
                  }}
                />
                <textarea
                  rows={3}
                  placeholder="Section body"
                  value={section.body ?? ""}
                  onChange={(e) => {
                    const sections = [...editing.sections]
                    sections[index] = { ...sections[index], body: e.target.value }
                    setEditing({ ...editing, sections })
                  }}
                />
                <button
                  type="button"
                  className="coupon-remove"
                  onClick={() =>
                    setEditing({
                      ...editing,
                      sections: editing.sections.filter((_, i) => i !== index),
                    })
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                setEditing({
                  ...editing,
                  sections: [...editing.sections, { heading: "", body: "" }],
                })
              }
            >
              <Plus /> Add section
            </button>
          </div>
          <div className="cms-actions">
            <label className="co-label">
              Publication status
              <select
                value={editing.status}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    status: e.target.value as "draft" | "active" | "disabled",
                  })
                }
              >
                <option value="draft">Draft</option>
                <option value="active">Publish</option>
                <option value="disabled">Unpublish</option>
              </select>
            </label>
            <button
              type="button"
              className="button button-dark"
              disabled={saving}
              onClick={savePage}
            >
              {saving ? "Saving…" : "Save page"}
            </button>
          </div>
          <AdminNotice message={error} />
          <AdminNotice message={notice} tone="success" />
        </div>
      </section>
    )
  }

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Content management</span>
          <h2>
            Website pages <small>{pages.length}</small>
          </h2>
        </div>
        <button type="button" className="button button-dark" onClick={() => openEditor()}>
          <Plus /> New page
        </button>
      </div>
      <AdminNotice message={error} />
      <AdminNotice message={notice} tone="success" />
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Slug</th>
                <th>Status</th>
                <th>Updated by</th>
                <th>Updated</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pages.map((page) => (
                <tr key={page.slug}>
                  <td>
                    <strong>{page.title}</strong>
                  </td>
                  <td>/{page.slug}</td>
                  <td>
                    <span
                      className={`status status-${
                        page.status === "active"
                          ? "delivered"
                          : page.status === "draft"
                            ? "confirmed"
                            : "out-for-delivery"
                      }`}
                    >
                      {page.status === "active" ? "Published" : page.status}
                    </span>
                  </td>
                  <td>{page.updated_by ?? "—"}</td>
                  <td>
                    {new Date(page.updated_at).toLocaleDateString("en-KE", {
                      day: "numeric",
                      month: "short",
                    })}
                  </td>
                  <td>
                    <div className="table-actions">
                      <button type="button" onClick={() => openEditor(page)}>
                        Edit
                      </button>
                      <Link to={`/${page.slug}`} className="button button-outline">
                        Preview
                      </Link>
                      {canDelete && (
                        <button
                          type="button"
                          disabled={deleting === page.slug}
                          onClick={() => removePage(page)}
                        >
                          {deleting === page.slug ? "Deleting…" : "Delete"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

type AdminBanner = {
  id: string
  heading: string
  body: string | null
  cta_label: string | null
  cta_url: string | null
  desktop_image_url: string
  starts_at: string
  ends_at: string | null
  sort_order: number
  is_active: boolean
  updated_at: string
}

function AdminBanners() {
  const [banners, setBanners] = useState<AdminBanner[]>([])
  const [view, setView] = useState<AdminView>("grid")
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<AdminBanner | null>(null)
  const claims = getSessionClaims()

  const load = () =>
    adminFetch<{ banners: AdminBanner[] }>("/api/admin/banners")
      .then((data) => {
        setBanners(data.banners)
        setError("")
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "We could not load banners."),
      )
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  async function toggle(banner: AdminBanner) {
    try {
      await adminFetch(`/api/admin/banners/${banner.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: !banner.is_active }),
      })
      setBanners((current) =>
        current.map((b) =>
          b.id === banner.id ? { ...b, is_active: !b.is_active } : b,
        ),
      )
      setNotice(banner.is_active ? "Banner hidden from the storefront." : "Banner is live.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not update the banner.")
    }
  }

  async function remove(banner: AdminBanner) {
    if (!window.confirm(`Delete “${banner.heading}”?`)) return
    try {
      await adminFetch(`/api/admin/banners/${banner.id}`, { method: "DELETE" })
      setBanners((current) => current.filter((b) => b.id !== banner.id))
      setNotice("Banner deleted.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not delete the banner.")
    }
  }

  const renderActions = (banner: AdminBanner) => (
    <div className="table-actions">
      <Link to="/">View</Link>
      <button type="button" onClick={() => setEditing(banner)}>
        Edit
      </button>
      <button type="button" onClick={() => toggle(banner)}>
        {banner.is_active ? "Hide" : "Show"}
      </button>
      {claims?.role === "super_admin" && (
        <button type="button" onClick={() => remove(banner)}>
          Delete
        </button>
      )}
    </div>
  )

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Homepage</span>
          <h2>
            Hero banners <small>{banners.length}</small>
          </h2>
        </div>
        <div className="admin-product-actions">
          <ViewToggle view={view} onChange={setView} />
          <button
            type="button"
            className="button button-dark"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus /> New banner
          </button>
        </div>
      </div>
      <AdminNotice message={error} />
      <AdminNotice message={notice} tone="success" />
      {showForm && <BannerForm onCreated={load} />}
      {loading ? (
        <p className="empty-copy">Loading live data…</p>
      ) : banners.length ? (
        view === "grid" ? (
          <div className="admin-card-grid">
            {banners.map((banner) => (
              <article key={banner.id} className="admin-entity-card">
                <div className="admin-entity-image">
                  <img src={banner.desktop_image_url} alt={banner.heading} />
                </div>
                <div className="admin-entity-body">
                  <strong>{banner.heading}</strong>
                  <span>{banner.body ?? "No supporting copy"}</span>
                  <div className="admin-entity-meta">
                    <span className={`status ${banner.is_active ? "status-delivered" : "status-out-for-delivery"}`}>
                      {banner.is_active ? "live" : "hidden"}
                    </span>
                    <span>
                      window {new Date(banner.starts_at).toLocaleDateString("en-KE")}
                      {banner.ends_at
                        ? ` → ${new Date(banner.ends_at).toLocaleDateString("en-KE")}`
                        : " → open"}
                    </span>
                  </div>
                </div>
                {renderActions(banner)}
              </article>
            ))}
          </div>
        ) : (
          <div className="banner-admin-list">
            {banners.map((banner) => (
              <article key={banner.id} className="banner-admin-item">
                <img src={banner.desktop_image_url} alt="" />
                <div>
                  <strong>{banner.heading}</strong>
                  <small>{banner.body ?? "No supporting copy"}</small>
                  <small>
                    {banner.is_active ? "Live" : "Hidden"} · window{" "}
                    {new Date(banner.starts_at).toLocaleDateString("en-KE")}
                    {banner.ends_at
                      ? ` → ${new Date(banner.ends_at).toLocaleDateString("en-KE")}`
                      : " → open"}
                  </small>
                </div>
                {renderActions(banner)}
              </article>
            ))}
          </div>
        )
      ) : (
        <p className="empty-copy">No banners yet. Create one to headline the store.</p>
      )}
      {editing && (
        <BannerEditModal
          banner={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
    </section>
  )
}

function BannerEditModal({
  banner,
  onClose,
  onSaved,
}: {
  banner: AdminBanner
  onClose: () => void
  onSaved: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [imageUrl, setImageUrl] = useState(banner.desktop_image_url)
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className="product-modal">
        <div className="modal-head">
          <div>
            <span className="eyebrow">Website content</span>
            <h2>Edit banner</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose}>
            <X />
          </button>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault()
            const values = new FormData(event.currentTarget)
            setSaving(true)
            setError("")
            try {
              await adminFetch(`/api/admin/banners/${banner.id}`, {
                method: "PATCH",
                body: JSON.stringify({
                  heading: values.get("heading"),
                  body: String(values.get("body") || "").trim() || null,
                  ctaLabel: String(values.get("ctaLabel") || "").trim() || null,
                  ctaUrl: String(values.get("ctaUrl") || "").trim() || null,
                  desktopImageUrl: imageUrl,
                  startsAt: values.get("startsAt")
                    ? toIsoOffset(String(values.get("startsAt")))
                    : undefined,
                  endsAt: values.get("endsAt")
                    ? toIsoOffset(String(values.get("endsAt")))
                    : null,
                  sortOrder: Number(values.get("sortOrder") || 0),
                  isActive: values.get("isActive") === "true",
                }),
              })
              onSaved()
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "We could not update the banner.",
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          <div className="form-section">
            <div className="form-grid">
              <label className="span-2">
                Heading
                <input name="heading" required defaultValue={banner.heading} />
              </label>
              <label className="span-2">
                Supporting copy
                <input name="body" defaultValue={banner.body ?? ""} />
              </label>
              <label>
                CTA label
                <input name="ctaLabel" defaultValue={banner.cta_label ?? ""} />
              </label>
              <label>
                CTA link
                <input name="ctaUrl" defaultValue={banner.cta_url ?? ""} />
              </label>
              <label>
                Starts (optional)
                <input name="startsAt" type="datetime-local" />
              </label>
              <label>
                Ends (optional)
                <input name="endsAt" type="datetime-local" />
              </label>
              <label>
                Sort order
                <input name="sortOrder" type="number" min="0" defaultValue={banner.sort_order} />
              </label>
              <label>
                Live state
                <select name="isActive" defaultValue={banner.is_active ? "true" : "false"}>
                  <option value="true">Live</option>
                  <option value="false">Hidden</option>
                </select>
              </label>
            </div>
            <h3>Banner image</h3>
            <ImagePicker value={imageUrl} onPick={(asset) => setImageUrl(asset.url)} />
          </div>
          <AdminNotice message={error} />
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-dark" disabled={saving}>
              {saving ? "Saving…" : "Save banner"}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function BannerForm({ onCreated }: { onCreated: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [imageUrl, setImageUrl] = useState("")
  return (
    <form
      className="admin-inline-form"
      onSubmit={async (event) => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        setSaving(true)
        setError("")
        try {
          await adminFetch("/api/admin/banners", {
            method: "POST",
            body: JSON.stringify({
              heading: values.get("heading"),
              body: String(values.get("body") || "").trim() || undefined,
              ctaLabel: String(values.get("ctaLabel") || "").trim() || undefined,
              ctaUrl: String(values.get("ctaUrl") || "").trim() || undefined,
              desktopImageUrl: imageUrl,
              startsAt: values.get("startsAt")
                ? toIsoOffset(String(values.get("startsAt")))
                : undefined,
              endsAt: values.get("endsAt")
                ? toIsoOffset(String(values.get("endsAt")))
                : null,
              sortOrder: Number(values.get("sortOrder") || 0),
              isActive: values.get("isActive") === "true",
            }),
          })
          event.currentTarget.reset()
          onCreated()
        } catch (e) {
          setError(e instanceof Error ? e.message : "We could not create the banner.")
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="form-grid">
        <label>
          Heading
          <input name="heading" required placeholder="Celebration season, delivered." />
        </label>
        <label>
          Supporting copy
          <input name="body" placeholder="Optional one-line description" />
        </label>
        <label>
          CTA label
          <input name="ctaLabel" placeholder="Shop the collection" />
        </label>
        <label>
          CTA link
          <input name="ctaUrl" placeholder="/collections/party" />
        </label>
        <label className="span-2">
          Image
          <span className="admin-hint">Upload one or pick from the library below.</span>
        </label>
        <label>
          Starts (optional)
          <input name="startsAt" type="datetime-local" />
        </label>
        <label>
          Ends (optional)
          <input name="endsAt" type="datetime-local" />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min="0" defaultValue={0} />
        </label>
        <label>
          Immediately live
          <select name="isActive" defaultValue="false">
            <option value="false">Start hidden</option>
            <option value="true">Live now</option>
          </select>
        </label>
      </div>
      <ImagePicker value={imageUrl} onPick={(asset) => setImageUrl(asset.url)} />
      <AdminNotice message={error} />
      <button type="submit" className="button button-dark" disabled={saving}>
        {saving ? "Saving…" : "Create banner"}
      </button>
    </form>
  )
}

type AdminCollectionRow = {
  id: string
  name: string
  slug: string
  status: string
  sort_order: number
  product_count: number
}

function AdminCollections() {
  const [collections, setCollections] = useState<AdminCollectionRow[] | null>(() =>
    readRowCache<AdminCollectionRow>("admin-collections"),
  )
  const [products, setProducts] = useState<
    { id: string; name: string; brand: string }[]
  >([])
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(collections === null)
  const [showForm, setShowForm] = useState(false)
  const [view, setView] = useState<AdminView>("grid")

  const load = () =>
    Promise.all([
      adminFetch<{ collections: AdminCollectionRow[] }>("/api/admin/collections"),
      adminFetch<{
        products: { id: string; name: string; brand: string }[]
      }>("/api/admin/products"),
    ])
      .then(([collectionData, productData]) => {
        setCollections(collectionData.collections)
        writeRowCache("admin-collections", collectionData.collections)
        setProducts(
          productData.products.map((p) => ({ id: p.id, name: p.name, brand: p.brand })),
        )
        setError("")
      })
      .catch((e: unknown) =>
        setError(
          e instanceof Error ? e.message : "We could not load collections.",
        ),
      )
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  async function toggleStatus(collection: AdminCollectionRow) {
    try {
      await adminFetch("/api/admin/collections", {
        method: "POST",
        body: JSON.stringify({
          name: collection.name,
          slug: collection.slug,
          sortOrder: collection.sort_order,
          status: collection.status === "active" ? "disabled" : "active",
        }),
      })
      await load()
      setNotice(`${collection.name} is now ${collection.status === "active" ? "paused" : "live"}.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not update the collection.")
    }
  }

  function statusBadge(status: string) {
    return (
      <span
        className={`status status-${
          status === "active"
            ? "delivered"
            : status === "draft"
              ? "confirmed"
              : "out-for-delivery"
        }`}
      >
        {status}
      </span>
    )
  }

  const renderActions = (collection: AdminCollectionRow) => (
    <div className="table-actions">
      <Link to={`/collections/${collection.slug}`} className="button button-outline">
        View
      </Link>
      <button type="button" onClick={() => toggleStatus(collection)}>
        {collection.status === "active" ? "Pause" : "Activate"}
      </button>
    </div>
  )

  const rows = collections ?? []

  return (
    <section className="table-card">
      <div className="admin-card-head">
        <div>
          <span>Merchandising</span>
          <h2>
            Collections <small>{rows.length}</small>
          </h2>
        </div>
        <div className="admin-header-actions">
          <ViewToggle view={view} onChange={setView} />
          <button
            type="button"
            className="button button-dark"
            onClick={() => setShowForm(!showForm)}
          >
            <Plus /> New collection
          </button>
        </div>
      </div>
      <AdminNotice message={error} />
      <AdminNotice message={notice} tone="success" />
      {showForm && (
        <CollectionForm products={products} onCreated={() => {
          load()
          setNotice("Collection saved.")
        }} />
      )}
      {loading && collections === null ? (
        <p className="empty-copy">Loading live data…</p>
      ) : view === "grid" ? (
        <div className="admin-card-grid">
          {rows.length ? (
            rows.map((collection) => (
              <article className="admin-entity-card" key={collection.id}>
                <div className="admin-entity-image">
                  <Package />
                </div>
                <div className="admin-entity-body">
                  <strong>{collection.name}</strong>
                  <span>/collections/{collection.slug}</span>
                  <div className="admin-entity-meta">
                    <span>{collection.product_count} products</span>
                    {statusBadge(collection.status)}
                  </div>
                </div>
                {renderActions(collection)}
              </article>
            ))
          ) : (
            <p className="empty-copy">No collections yet. Create one to curate a shop page.</p>
          )}
        </div>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Collection</th>
                <th>Slug</th>
                <th>Products</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((collection) => (
                <tr key={collection.id}>
                  <td>
                    <strong>{collection.name}</strong>
                  </td>
                  <td>/collections/{collection.slug}</td>
                  <td>{collection.product_count}</td>
                  <td>{statusBadge(collection.status)}</td>
                  <td>{renderActions(collection)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function CollectionForm({
  products,
  onCreated,
}: {
  products: { id: string; name: string; brand: string }[]
  onCreated: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  return (
    <form
      className="admin-inline-form"
      onSubmit={async (event) => {
        event.preventDefault()
        const values = new FormData(event.currentTarget)
        setSaving(true)
        setError("")
        try {
          await adminFetch("/api/admin/collections", {
            method: "POST",
            body: JSON.stringify({
              name: values.get("name"),
              slug: String(values.get("slug") ?? "")
                .toLowerCase()
                .trim()
                .replace(/\s+/g, "-"),
              description:
                String(values.get("description") || "").trim() || undefined,
              sortOrder: Number(values.get("sortOrder") || 0),
              status: values.get("status"),
              productIds: selected,
            }),
          })
          event.currentTarget.reset()
          setSelected([])
          onCreated()
        } catch (e) {
          setError(e instanceof Error ? e.message : "We could not save the collection.")
        } finally {
          setSaving(false)
        }
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input name="name" required placeholder="Weekend Entitlements" />
        </label>
        <label>
          Slug
          <input name="slug" required placeholder="weekend-entitlements" />
        </label>
        <label>
          Sort order
          <input name="sortOrder" type="number" min="0" defaultValue={0} />
        </label>
        <label>
          Status
          <select name="status" defaultValue="draft">
            <option value="draft">Draft</option>
            <option value="active">Active</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label className="span-2">
          Description
          <input name="description" placeholder="Shown on the collection page" />
        </label>
      </div>
      <div className="collection-picker">
        <h3>Products in this collection</h3>
        <div className="collection-picker-list">
          {products.map((product) => (
            <label key={product.id} className="collection-pick">
              <input
                type="checkbox"
                checked={selected.includes(product.id)}
                onChange={(event) =>
                  setSelected((current) =>
                    event.target.checked
                      ? [...current, product.id]
                      : current.filter((id) => id !== product.id),
                  )
                }
              />
              <span>
                {product.name} <small>{product.brand}</small>
              </span>
            </label>
          ))}
        </div>
      </div>
      <AdminNotice message={error} />
      <button type="submit" className="button button-dark" disabled={saving}>
        {saving ? "Saving…" : "Save collection"}
      </button>
    </form>
  )
}


function AdminPlaceholder({ section }: { section: string }) {
  return (
    <section className="table-card admin-placeholder">
      <Box />
      <h2>{section} workspace</h2>
      <p>
        This operational module is ready for connection to your business rules
        and live records.
      </p>
      <button type="button" className="button button-dark">
        Create first record
      </button>
    </section>
  )
}

function Footer() {
  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="footer-brand">
          <Brand />
          <p>
            Considered bottles, reliable delivery and genuine service for every
            occasion.
          </p>
          <span>Enjoy responsibly. Not for sale to persons under 18.</span>
        </div>
        <div>
          <h3>Shop</h3>
          <Link to="/shop">All products</Link>
          <Link to="/shop?view=new">New arrivals</Link>
          <Link to="/shop?view=offers">Offers</Link>
          <Link to="/brands">Brands</Link>
        </div>
        <div>
          <h3>Help</h3>
          <Link to="/contact">Contact us</Link>
          <Link to="/delivery">Delivery information</Link>
          <Link to="/track">Track an order</Link>
          <Link to="/bulk-orders">Bulk orders</Link>
        </div>
        <div>
          <h3>Company</h3>
          <Link to="/about">Our story</Link>
          <Link to="/responsible-drinking">Responsible drinking</Link>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>© 2026 Henry's Liquor Hub. All rights reserved.</span>
        <span>Nairobi, Kenya · Mon–Sun 9:00–22:00</span>
      </div>
    </footer>
  )
}

// ─── COLLECTIONS & PASSWORD RESET PAGES ──────────────────────────────────────

function CollectionsIndexPage() {
  const [collections, setCollections] = useState<
    {
      name: string
      slug: string
      description: string | null
      image_url: string | null
      product_count: number
    }[]
  >([])
  useEffect(() => {
    fetch("/api/collections")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCollections(data.collections))
      .catch(() => undefined)
  }, [])
  return (
    <div className="page-wrap">
      <span className="eyebrow">Curated by our team</span>
      <h1>Shop by occasion</h1>
      <p className="section-copy">
        Hand-picked selections for every moment worth celebrating.
      </p>
      {!collections.length ? (
        <div className="empty-state">
          <LayoutGrid />
          <h2>Collections are being curated</h2>
          <p>Check back shortly — our team is building the next selection.</p>
        </div>
      ) : (
        <div className="category-grid">
          {collections.map((collection) => (
            <Link
              key={collection.slug}
              to={`/collections/${collection.slug}`}
              className="category-card"
            >
              <img
                src={collection.image_url ?? PLACEHOLDER_IMAGE}
                alt={collection.name}
                loading="lazy"
              />
              <div>
                <h2>{collection.name}</h2>
                <p>{collection.product_count} bottles</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CollectionDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<{
    collection: { name: string; description: string | null }
    products: ProductDetail["related"]
  } | null>(null)
  const [notFound, setNotFound] = useState(false)
  useEffect(() => {
    if (!slug) return
    let active = true
    setData(null)
    setNotFound(false)
    fetch(`/api/collections/${slug}`)
      .then((r) => {
        if (!r.ok) setNotFound(true)
        return r.ok ? r.json() : null
      })
      .then((payload) => active && payload && setData(payload))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [slug])
  if (notFound)
    return (
      <SimplePage
        title="Collection not found"
        body="This collection may have ended. Browse the full shop instead."
      />
    )
  if (!data)
    return (
      <div className="page-wrap simple-page">
        <h1>Loading collection…</h1>
      </div>
    )
  return (
    <CollectionPage
      eyebrow="Collection"
      title={data.collection.name}
      copy={data.collection.description ?? ""}
      products={data.products.map(toCardProduct)}
    />
  )
}

type PublicCategoryRow = {
  name: string
  slug: string
  description: string | null
  image_url: string | null
  product_count: number
}

type PublicBrandRow = PublicCategoryRow & {
  logo_url: string | null
  image_url: string | null
}

function CategoriesIndexPage() {
  const [categories, setCategories] = useState<PublicCategoryRow[] | null>(null)
  useEffect(() => {
    fetch("/api/catalogue/categories")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setCategories(data.categories))
      .catch(() => setCategories([]))
  }, [])
  if (!categories)
    return (
      <div className="page-wrap simple-page">
        <h1>Loading categories…</h1>
      </div>
    )
  return (
    <div className="page-wrap">
      <span className="eyebrow">Browse the cellar</span>
      <h1>Shop by category</h1>
      <p className="section-copy">
        Explore a thoughtful range of spirits, wines, beers, mixers and
        non-alcoholic choices.
      </p>
      {!categories.length ? (
        <div className="empty-state">
          <LayoutGrid />
          <h2>Categories are being prepared</h2>
          <p>Check back shortly — our team is organizing the shelves.</p>
        </div>
      ) : (
        <div className="category-grid">
          {categories.map((category) => (
            <Link
              key={category.slug}
              to={`/categories/${category.slug}`}
              className="category-card"
            >
              <img
                src={category.image_url ?? PLACEHOLDER_IMAGE}
                alt={category.name}
                loading="lazy"
              />
              <div>
                <h2>{category.name}</h2>
                <p>{category.product_count} bottles</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function CategoryDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<{
    category: { name: string; description: string | null }
    products: ProductDetail["related"]
  } | null>(null)
  const [notFound, setNotFound] = useState(false)
  useEffect(() => {
    if (!slug) return
    let active = true
    setData(null)
    setNotFound(false)
    fetch(`/api/catalogue/categories/${slug}`)
      .then((r) => {
        if (!r.ok) setNotFound(true)
        return r.ok ? r.json() : null
      })
      .then((payload) => active && payload && setData(payload))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [slug])
  if (notFound)
    return (
      <SimplePage
        title="Category not found"
        body="This category is not available right now. Browse the full shop instead."
      />
    )
  if (!data)
    return (
      <div className="page-wrap simple-page">
        <h1>Loading category…</h1>
      </div>
    )
  return (
    <CollectionPage
      eyebrow="Category"
      title={data.category.name}
      copy={data.category.description ?? ""}
      products={data.products.map(toCardProduct)}
    />
  )
}

function BrandsIndexPage() {
  const [brands, setBrands] = useState<PublicBrandRow[] | null>(null)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")
  useEffect(() => {
    fetch("/api/catalogue/brands")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data && setBrands(data.brands))
      .catch(() => setBrands([]))
  }, [])
  const filtered = useMemo(
    () =>
      (brands ?? []).filter((brand) =>
        `${brand.name} ${brand.description ?? ""}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
      ),
    [brands, search],
  )
  if (!brands)
    return (
      <div className="page-wrap simple-page">
        <h1>Loading brands…</h1>
      </div>
    )
  return (
    <div className="brand-page page-wrap">
      <div className="shop-intro">
        <span className="eyebrow">The producers</span>
        <h1>Brands we stand behind</h1>
        <p>
          Well-known houses and considered independent makers, chosen bottle by
          bottle.
        </p>
      </div>
      <div className="shop-toolbar">
        <label className="search-field">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search brands"
            aria-label="Search brands"
          />
        </label>
        <div className="view-toggle">
          <button
            type="button"
            className={viewMode === "grid" ? "active" : ""}
            onClick={() => setViewMode("grid")}
            title="Grid view"
            aria-label="Grid view"
          >
            <LayoutGrid size={16} />
          </button>
          <button
            type="button"
            className={viewMode === "list" ? "active" : ""}
            onClick={() => setViewMode("list")}
            title="List view"
            aria-label="List view"
          >
            <List size={16} />
          </button>
        </div>
      </div>
      {!brands.length ? (
        <div className="empty-state">
          <LayoutGrid />
          <h2>Brand pages are on the way</h2>
          <p>Check back shortly to explore the houses behind our shelves.</p>
        </div>
      ) : !filtered.length ? (
        <div className="empty-state">
          <Search />
          <h2>No brands match that search</h2>
          <p>Try another producer name.</p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="category-grid">
          {filtered.map((brand) => (
            <Link
              key={brand.slug}
              to={`/brands/${brand.slug}`}
              className="category-card"
            >
              <img
                src={brand.image_url ?? brand.logo_url ?? PLACEHOLDER_IMAGE}
                alt={brand.name}
                loading="lazy"
              />
              <div>
                <h2>{brand.name}</h2>
                <p>{brand.product_count} bottles</p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="brand-list">
          {filtered.map((brand) => (
            <Link
              key={brand.slug}
              to={`/brands/${brand.slug}`}
              className="brand-list-row"
            >
              <img
                src={brand.logo_url ?? brand.image_url ?? PLACEHOLDER_IMAGE}
                alt=""
                loading="lazy"
              />
              <div className="blr-info">
                <strong>{brand.name}</strong>
                <small>
                  {brand.description ?? "Producer profile coming soon"}
                </small>
              </div>
              <span className="blr-count">{brand.product_count} bottles</span>
              <ArrowRight />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function BrandDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [data, setData] = useState<{
    brand: { name: string; description: string | null }
    products: ProductDetail["related"]
  } | null>(null)
  const [notFound, setNotFound] = useState(false)
  useEffect(() => {
    if (!slug) return
    let active = true
    setData(null)
    setNotFound(false)
    fetch(`/api/catalogue/brands/${slug}`)
      .then((r) => {
        if (!r.ok) setNotFound(true)
        return r.ok ? r.json() : null
      })
      .then((payload) => active && payload && setData(payload))
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [slug])
  if (notFound)
    return (
      <SimplePage
        title="Brand not found"
        body="This brand is not available right now. Browse the full shop instead."
      />
    )
  if (!data)
    return (
      <div className="page-wrap simple-page">
        <h1>Loading brand…</h1>
      </div>
    )
  return (
    <CollectionPage
      eyebrow="Brand"
      title={data.brand.name}
      copy={data.brand.description ?? ""}
      products={data.products.map(toCardProduct)}
    />
  )
}

function ForgotPasswordPage() {
  const [email, setEmail] = useState("")
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="auth-page">
      <section className="auth-aside">
        <span className="eyebrow light">Henry&rsquo;s Liquor Hub</span>
        <h1>
          Locked out?
          <br />
          We&rsquo;ll sort that.
        </h1>
        <p>
          Tell us the email on your account and we will send a secure,
          single-use link to set a new password.
        </p>
        <div className="auth-aside-note">
          <ShieldCheck />
          <span>Reset links expire automatically and can only be used once.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <Link to="/" className="auth-back">
          <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to store
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Account recovery</span>
          <h2>Forgot your password?</h2>
          <p>Enter your email and we will send you a secure reset link.</p>
          <form
            onSubmit={async (event) => {
              event.preventDefault()
              setSubmitting(true)
              setError("")
              setMessage("")
              try {
                const response = await fetch("/api/auth/forgot-password", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ email }),
                })
                const data = await response.json().catch(() => null)
                if (!response.ok) {
                  setError(
                    data?.error ?? "We could not process that request.",
                  )
                  return
                }
                setMessage(
                  "If that address has an account, a reset link is on its way. Check your inbox and spam folder.",
                )
              } catch {
                setError(
                  "We could not reach the server. Check your connection and try again.",
                )
              } finally {
                setSubmitting(false)
              }
            }}
          >
            <label>
              Email address
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
              />
            </label>
            {message && (
              <div className="form-message">
                <CheckCircle /> {message}
              </div>
            )}
            {error && <div className="form-error">{error}</div>}
            <button
              type="submit"
              className="button button-dark button-wide"
              disabled={submitting}
            >
              {submitting ? "Sending…" : "Send reset link"} <ArrowRight />
            </button>
            <div className="auth-form-row">
              <Link to="/login" className="text-button">
                Back to sign in
              </Link>
              {message && (
                <button type="submit" className="text-button">
                  Resend link
                </button>
              )}
            </div>
          </form>
        </div>
      </section>
    </div>
  )
}

function ResetPasswordPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const token =
    new URLSearchParams(location.search).get("token") ?? ""
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  return (
    <div className="auth-page">
      <section className="auth-aside">
        <span className="eyebrow light">Henry&rsquo;s Liquor Hub</span>
        <h1>
          A fresh key
          <br />
          to your shelf.
        </h1>
        <p>
          Choose a new password for your account. Use at least 12 characters
          you do not reuse anywhere else.
        </p>
        <div className="auth-aside-note">
          <Lock />
          <span>Your new password is stored with strong encryption.</span>
        </div>
      </section>
      <section className="auth-form-wrap">
        <Link to="/" className="auth-back">
          <ChevronRight style={{ transform: "rotate(180deg)" }} /> Back to store
        </Link>
        <div className="auth-form">
          <span className="eyebrow">Account recovery</span>
          <h2>Choose a new password</h2>
          {success ? (
            <>
              <div className="form-message">
                <CheckCircle /> Password updated. Taking you to sign in…
              </div>
              <Link to="/login" className="button button-dark button-wide">
                Sign in now <ArrowRight />
              </Link>
            </>
          ) : (
            <>
              {!token && (
                <div className="form-error">
                  This reset link appears incomplete or was opened incorrectly.{" "}
                  <Link to="/forgot-password">Request a new one</Link>
                </div>
              )}
              <form
                onSubmit={async (event) => {
                  event.preventDefault()
                  setError("")
                  if (!token) {
                    setError("This reset link is not valid.")
                    return
                  }
                  if (password.length < 12) {
                    setError("Passwords need at least 12 characters.")
                    return
                  }
                  if (password !== confirm) {
                    setError("The two passwords do not match.")
                    return
                  }
                  setSubmitting(true)
                  try {
                    const response = await fetch("/api/auth/reset-password", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        token,
                        password,
                        confirmPassword: confirm,
                      }),
                    })
                    const data = await response.json().catch(() => null)
                    if (!response.ok) {
                      setError(
                        data?.error ?? "We could not reset your password.",
                      )
                      return
                    }
                    setSuccess(true)
                    setTimeout(() => navigate("/login"), 1500)
                  } catch {
                    setError(
                      "We could not reach the server. Check your connection and try again.",
                    )
                  } finally {
                    setSubmitting(false)
                  }
                }}
              >
                <label>
                  New password
                  <div className="password-field">
                    <input
                      required
                      minLength={12}
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="At least 12 characters"
                    />
                    <button
                      type="button"
                      className="password-toggle"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <EyeOff /> : <Eye />}
                    </button>
                  </div>
                </label>
                <label>
                  Confirm password
                  <input
                    required
                    minLength={12}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repeat your new password"
                  />
                </label>
                {error && <div className="form-error">{error}</div>}
                <button
                  type="submit"
                  className="button button-dark button-wide"
                  disabled={submitting || !token}
                >
                  {submitting ? "Updating…" : "Reset password"} <ArrowRight />
                </button>
                <Link to="/login" className="inline-link">
                  Remembered it? Back to sign in <ArrowRight />
                </Link>
              </form>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: SiteLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "shop", Component: ShopPage },
      { path: "products/:id", Component: ProductDetailPage },
      { path: "cart", Component: CartPage },
      { path: "checkout", Component: CheckoutPage },
      { path: "order-confirmation", Component: OrderConfirmationPage },
      { path: "track", Component: OrderTrackingPage },
      { path: "login", Component: LoginPage },
      { path: "register", Component: RegisterPage },
      { path: "account", Component: AccountPage },
      {
        path: "categories",
        Component: CategoriesIndexPage,
      },
      { path: "categories/:slug", Component: CategoryDetailPage },
      { path: "brands", Component: BrandsIndexPage },
      { path: "brands/:slug", Component: BrandDetailPage },
      {
        path: "offers",
        Component: OffersPage,
      },
      {
        path: "new-arrivals",
        Component: NewArrivalsPage,
      },
      { path: "bulk-orders", Component: BookingPage },
      { path: "contact", Component: ContactPage },
      {
        path: "about",
        Component: () => (
          <EditorialPage
            slug="about"
            eyebrow="Our story"
            title="Good drinks, better occasions."
            copy="Henry's Liquor Hub is a contemporary bottle shop built around exceptional choice, knowledgeable service and responsible delivery."
          />
        ),
      },
      {
        path: "delivery",
        Component: () => (
          <EditorialPage
            slug="delivery"
            eyebrow="Delivery information"
            title="Reliable delivery, handled with care."
            copy="Choose same-day delivery where available or collection at your convenience. An adult must be present for every alcohol delivery."
          />
        ),
      },
      {
        path: "responsible-drinking",
        Component: () => (
          <EditorialPage
            slug="responsible-drinking"
            eyebrow="Responsible drinking"
            title="Enjoy well. Drink responsibly."
            copy="Alcohol is for adults of legal drinking age. Take care of yourself and the people around you, and never drink and drive."
          />
        ),
      },
      {
        path: "privacy",
        Component: () => (
          <EditorialPage
            slug="privacy"
            eyebrow="Legal"
            title="Privacy policy"
            copy="We collect only the information needed to provide a secure and useful shopping experience, and never sell your personal information."
          />
        ),
      },
      {
        path: "terms",
        Component: () => (
          <EditorialPage
            slug="terms"
            eyebrow="Legal"
            title="Terms & conditions"
            copy="Our terms explain age eligibility, ordering, delivery, payment and returns for purchases made through Henry's Liquor Hub."
          />
        ),
      },
      {
        path: "refund-policy",
        Component: () => (
          <EditorialPage
            slug="refund-policy"
            eyebrow="Legal"
            title="Refund & cancellation policy"
            copy="Orders can be cancelled before dispatch. Faulty or incorrectly delivered bottles are eligible for refund or replacement on request."
          />
        ),
      },
      {
        path: "faq",
        Component: () => (
          <EditorialPage
            slug="faq"
            eyebrow="Answers"
            title="Frequently asked questions"
            copy="Delivery times, age verification, payments and returns — answered."
          />
        ),
      },
      { path: "search", Component: ShopPage },
      { path: "collections", Component: CollectionsIndexPage },
      { path: "collections/:slug", Component: CollectionDetailPage },
      { path: "forgot-password", Component: ForgotPasswordPage },
      { path: "reset-password", Component: ResetPasswordPage },
      { path: ":slug", Component: DynamicCmsPage },
      {
        path: "*",
        element: (
          <SimplePage
            title="This page is being stocked"
            body="The collection you are looking for is not available yet. Our main shop is open and ready."
          />
        ),
      },
    ],
  },
  { path: "/admin/*", Component: AdminPage },
])
