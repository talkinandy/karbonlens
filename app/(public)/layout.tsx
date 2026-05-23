import { Suspense } from "react";
import { SiteNav } from "@/components/site-nav";
import { UserMenu } from "@/components/auth/UserMenu";
import { SignInButton } from "@/components/auth/SignInButton";

/**
 * Public route group layout — segment layout only.
 *
 * MUST NOT include <html> or <body>: those live in the root layout at
 * `app/layout.tsx`. This layout wraps public-facing pages with the shared
 * site nav; T05 slots in the UserMenu (which renders a SignInButton for
 * anonymous visitors and the user's avatar + sign-out when signed in).
 *
 * SEO Phase 1: UserMenu calls `auth()` and is wrapped in <Suspense> so the
 * auth read is an isolated island rather than a route-wide taint. The
 * fallback renders the guest SignInButton — what crawlers see in the
 * streamed HTML — until the dynamic island resolves. Ready for a future
 * Next 16 cacheComponents rollout.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav
        rightSlot={
          <Suspense
            fallback={
              <div className="kl-user-menu kl-user-menu--anon">
                <SignInButton />
              </div>
            }
          >
            <UserMenu />
          </Suspense>
        }
      />
      {children}
    </>
  );
}
