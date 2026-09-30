import Link from "next/link";

export default function RegisterPage() {
  return <main className="auth-page">
    <section className="auth-aside"><span className="eyebrow">Henry&apos;s Liquor Hub</span><h1>Good bottles,<br />within reach.</h1><p>Create your account to save your favourite bottles, track deliveries and enjoy a faster checkout.</p></section>
    <section className="auth-form-wrap"><form className="auth-form"><span className="eyebrow">Customer account</span><h2>Create an account</h2><p>Join Henry&apos;s for considered recommendations and a seamless ordering experience.</p><div className="form-grid"><label className="field full">Full name<input required name="name" autoComplete="name" /></label><label className="field">Email address<input required type="email" name="email" autoComplete="email" /></label><label className="field">Phone number<input required type="tel" name="phone" autoComplete="tel" /></label><label className="field">Password<input required type="password" name="password" autoComplete="new-password" minLength={8} /></label><label className="field">Confirm password<input required type="password" name="confirmPassword" autoComplete="new-password" minLength={8} /></label></div><label className="consent"><input required type="checkbox" /> I confirm that I am of legal drinking age and agree to the Terms and Privacy Policy.</label><button className="button dark" type="submit">Create account</button><p className="auth-note">Already have an account? <Link href="/auth/customer/login">Sign in</Link></p></form></section>
  </main>;
}
