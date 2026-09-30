import Link from "next/link";

const categories = [
  ["Whisky", "https://images.unsplash.com/photo-1592620352607-53100d32f9fb?auto=format&fit=crop&w=800&q=85"],
  ["Wine", "https://images.unsplash.com/photo-1697115355157-c95fbd5250fd?auto=format&fit=crop&w=800&q=85"],
  ["Gin", "https://images.unsplash.com/photo-1541491263892-731bc0c6a2ae?auto=format&fit=crop&w=800&q=85"],
  ["Champagne", "https://images.unsplash.com/photo-1700893417209-18dc88c989a0?auto=format&fit=crop&w=800&q=85"],
];

export default function HomePage() {
  return <main>
    <div className="top">Same-day delivery in selected Nairobi areas · 18+ only</div>
    <header className="nav"><Link href="/" className="brand">HENRY&apos;S<small>LIQUOR HUB</small></Link><nav className="links"><Link href="/shop">Shop</Link><Link href="/categories">Categories</Link><Link href="/brands">Brands</Link><Link href="/offers">Offers</Link><Link href="/about">About</Link></nav><nav className="actions"><Link href="/search">Search</Link><Link href="/auth/customer/login">Account</Link><Link href="/cart">Cart</Link></nav></header>
    <section className="hero"><div className="hero-copy"><span className="eyebrow">Curated in Nairobi · Delivered to your door</span><h1>Good drinks.<br/>Good times.</h1><p>Discover exceptional spirits, wine and celebratory bottles selected for every kind of occasion.</p><div className="buttons"><Link className="button light" href="/shop">Shop now</Link><Link className="button" href="/collections">Explore collection</Link></div></div><img src="https://images.unsplash.com/photo-1582819509237-d5b75f20ff7a?auto=format&fit=crop&w=1500&q=88" alt="Premium spirits on display"/></section>
    <section className="section"><div className="heading"><div><span className="eyebrow">Find your pour</span><h2>Shop by category</h2></div><p>From quiet evenings to milestone celebrations, begin with a collection made for the moment.</p></div><div className="categories">{categories.map(([name,image])=><Link href={`/categories/${name.toLowerCase()}`} className="category" key={name}><img src={image} alt={`${name} collection`}/><span>{name}</span></Link>)}</div></section>
    <section className="section dark"><span className="eyebrow">Connected commerce platform</span><h2>Storefront, account<br/>and operations.</h2><p>The public catalogue, customer account, checkout and CMS are being unified around the same protected Next.js and PostgreSQL data layer.</p><div className="buttons"><Link className="button light" href="/admin">Open admin</Link><Link className="button" href="/account">Your account</Link></div></section>
    <footer className="footer"><div><div className="brand">HENRY&apos;S<small>LIQUOR HUB</small></div><p>Considered bottles, reliable delivery and genuine service for every occasion.</p></div><nav><strong>Shop</strong><Link href="/shop">All products</Link><Link href="/new-arrivals">New arrivals</Link><Link href="/offers">Offers</Link></nav><nav><strong>Help</strong><Link href="/delivery">Delivery</Link><Link href="/contact">Contact</Link><Link href="/responsible-drinking">Responsible drinking</Link></nav></footer>
  </main>;
}
