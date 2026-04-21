import { SiteNav } from "@/components/site-nav";
import { UserMenu } from "@/components/auth/UserMenu";

/**
 * Public route group layout — segment layout only.
 *
 * MUST NOT include <html> or <body>: those live in the root layout at
 * `app/layout.tsx`. This layout wraps public-facing pages with the shared
 * site nav; T05 slots in the UserMenu (which renders a SignInButton for
 * anonymous visitors and the user's avatar + sign-out when signed in).
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav rightSlot={<UserMenu />} />
      {children}
    </>
  );
}
