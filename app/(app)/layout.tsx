import { SiteNav } from "@/components/site-nav";
import { UserMenu } from "@/components/auth/UserMenu";
import { OnboardingGate } from "@/components/auth/OnboardingGate";
import { NotificationBell } from "@/components/notifications/NotificationBell";

/**
 * Authenticated route group layout — segment layout only.
 *
 * MUST NOT include <html> or <body>: those live in the root layout at
 * `app/layout.tsx`. T03 is a passthrough with the shared site nav; T05
 * adds the auth widgets: UserMenu in the nav (via SiteNav's rightSlot),
 * and a first-login OnboardingGate that conditionally renders the
 * onboarding modal.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav rightSlot={<><NotificationBell /><UserMenu /></>} />
      {children}
      {/* Server component — decides whether to render the modal */}
      <OnboardingGate />
    </>
  );
}
