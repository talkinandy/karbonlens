import Link from "next/link";

type NavItem = { href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/projects", label: "Projects" },
  { href: "/prices", label: "Prices" },
  { href: "/regulatory", label: "Regulatory" },
  { href: "/alerts", label: "Alerts" },
];

/**
 * Top navigation shell shared by `(public)` and `(app)` layouts.
 * Static for T03; T05 will layer a UserMenu / OnboardingModal into the
 * `(app)` layout alongside this component.
 */
export function SiteNav() {
  return (
    <nav className="kl-topnav">
      <div className="kl-topnav-inner">
        <Link href="/" className="kl-brand">
          <span className="kl-brand-mark">K</span>
          <span className="kl-brand-word">KarbonLens</span>
        </Link>
        <div className="kl-nav-links">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="kl-nav-link">
              {item.label}
            </Link>
          ))}
        </div>
        <span
          className="kl-pill kl-pill--info"
          style={{ marginLeft: "auto" }}
          aria-label="v0.1 preview"
        >
          v0.1
        </span>
      </div>
    </nav>
  );
}
