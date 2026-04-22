import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy',
  description:
    'How KarbonLens handles the limited personal data it collects from signed-in users.',
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 className="kl-page-title">Privacy policy</h1>
          <p className="kl-muted" style={{ marginTop: 8 }}>
            v0.1 — last updated 2026-04-22.
          </p>
        </header>

        <section style={{ marginBottom: 32 }}>
          <p>
            KarbonLens (&ldquo;we&rdquo;, &ldquo;us&rdquo;) operates the
            carbon-market intelligence terminal at karbonlens.com. This page
            explains what personal data we collect, why, and how we handle it.
            This is a v0.1 document and will be replaced with a full policy
            before general availability.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>What we collect</h2>
          <p>
            Public pages (/projects, /prices, /regulatory, /methodology) do not
            require an account and do not set analytics or advertising cookies.
          </p>
          <p>When you sign in with Google, we receive:</p>
          <ul>
            <li>Your email address and display name</li>
            <li>Your Google profile picture URL (optional)</li>
          </ul>
          <p>
            When you use authenticated features we additionally store the
            watchlist entries, alert preferences, and notification history you
            create. We never receive your Google password.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Why we collect it</h2>
          <ul>
            <li>
              <strong>Authentication.</strong> To recognise you across sessions
              and authorise access to your watchlist and alerts.
            </li>
            <li>
              <strong>Alert delivery.</strong> If you opt in to email digests,
              we send them to the address Google returned at sign-in.
            </li>
            <li>
              <strong>Service operation.</strong> Standard server logs
              (IP address, user-agent, timestamp) for abuse prevention and
              debugging, retained 30 days.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Where it lives</h2>
          <p>
            User data is stored in a PostgreSQL database hosted in the European
            Union (Hetzner, Falkenstein). Daily encrypted backups are retained
            for 7 days. We do not sell, rent, or share personal data with third
            parties for advertising.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Sub-processors</h2>
          <ul>
            <li>
              <strong>Google</strong> — OAuth sign-in (your email and name are
              sent to us at authentication).
            </li>
            <li>
              <strong>Hetzner Online GmbH</strong> — infrastructure hosting
              (EU).
            </li>
            <li>
              <strong>Resend</strong> — transactional email delivery, only when
              alert emails are enabled.
            </li>
            <li>
              <strong>Sentry</strong> — error monitoring, only when enabled;
              stack traces may include request URLs but not request bodies.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Your choices</h2>
          <p>
            You can sign out at any time. To delete your account and all
            associated data (watchlist, preferences, notifications), email us
            from your signed-in address and we will remove them within 14 days.
            We will confirm when deletion is complete.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Contact</h2>
          <p>
            Questions or requests:{' '}
            <a href="mailto:hello@karbonlens.com">hello@karbonlens.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
