import { SiteNav } from "@/components/site-nav";

/**
 * Public route group layout — segment layout only.
 *
 * MUST NOT include <html> or <body>: those live in the root layout at
 * `app/layout.tsx`. This layout simply wraps public-facing pages with the
 * shared site nav.
 */
export default function PublicLayout({
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
