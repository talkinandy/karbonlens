import { SiteNav } from "@/components/site-nav";

/**
 * Authenticated route group layout — segment layout only.
 *
 * MUST NOT include <html> or <body>: those live in the root layout at
 * `app/layout.tsx`. T03 is a passthrough with the shared site nav; T05 will
 * layer UserMenu / OnboardingModal here and a middleware gate in front of
 * these routes.
 */
export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SiteNav />
      {children}
    </>
  );
}
