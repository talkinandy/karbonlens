import Image from "next/image";
import Link from "next/link";
import { MobileNav } from "./mobile-nav";

type NavItem = { href: string; label: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/projects", label: "Projects" },
  { href: "/prices", label: "Prices" },
  { href: "/regulatory", label: "Regulatory" },
  { href: "/news", label: "News" },
  { href: "/alerts", label: "Alerts" },
];

type Props = {
  /**
   * Optional right-aligned slot for auth widgets (UserMenu / SignInButton).
   * When unset, the v0.1 preview pill is shown — preserves the T03 shell
   * for pages that don't surface auth (e.g. the public landing on first paint).
   */
  rightSlot?: React.ReactNode;
};

/**
 * Top navigation shell shared by `(public)` and `(app)` layouts.
 * T03 defines the shell; T05 layers a `rightSlot` for auth widgets.
 */
export function SiteNav({ rightSlot }: Props = {}) {
  return (
    <nav className="kl-topnav">
      <div className="kl-topnav-inner">
        <Link href="/" className="kl-brand" aria-label="KarbonLens — home">
          <Image
            src="/brand/karbonlens-mark.svg"
            alt=""
            width={24}
            height={24}
            className="kl-brand-mark-img"
            priority
          />
          <span className="kl-brand-word">KarbonLens</span>
        </Link>
        <div className="kl-nav-links">
          {NAV_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="kl-nav-link">
              {item.label}
            </Link>
          ))}
        </div>
        <div className="kl-topnav-right">
          {rightSlot ?? (
            <span
              className="kl-pill kl-pill--info"
              aria-label="v0.1 preview"
            >
              v0.1
            </span>
          )}
        </div>
        <MobileNav items={NAV_ITEMS} rightSlot={rightSlot} />
      </div>
    </nav>
  );
}
