import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of service',
  description:
    'The terms under which KarbonLens is offered during v0.1 beta.',
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 className="kl-page-title">Terms of service</h1>
          <p className="kl-muted" style={{ marginTop: 8 }}>
            v0.1 — last updated 2026-04-22.
          </p>
        </header>

        <section style={{ marginBottom: 32 }}>
          <p>
            KarbonLens (&ldquo;the service&rdquo;) is a carbon-market
            intelligence terminal operated at karbonlens.com. By using the
            service you agree to these terms. This is a v0.1 document for the
            beta release and will be replaced before general availability.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Beta status</h2>
          <p>
            KarbonLens is in beta. Features, scoring methodology, data sources,
            and pricing may change without notice. The service is offered
            &ldquo;as is&rdquo; during this period with no availability
            guarantee.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Use of data</h2>
          <p>
            The service reconciles data from public sources — including
            SRN-PPI, IDXCarbon, Verra, Gold Standard, GFW RADD, and JDIH — with
            our own derived fields (integrity scores, alert joins,
            normalisations). You may view and reference this data for research,
            due diligence, reporting, and journalism, with attribution to
            KarbonLens and the underlying source.
          </p>
          <p>
            Automated scraping, bulk redistribution, or reselling the data
            without prior written permission is not permitted.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Not investment or compliance advice</h2>
          <p>
            Nothing on KarbonLens is investment, legal, tax, or compliance
            advice. Integrity scores, reversal alerts, and regulatory summaries
            are provided for informational purposes and should be
            independently verified against the primary source before any
            decision. Carbon credits are complex instruments; consult qualified
            professionals.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Accounts and acceptable use</h2>
          <p>
            You are responsible for keeping your Google account secure and for
            activity performed under your session. You agree not to:
          </p>
          <ul>
            <li>Share an account, or attempt to access another user&apos;s data;</li>
            <li>Probe, scan, or test the vulnerability of the service;</li>
            <li>
              Submit content or queries intended to disrupt the service or its
              users;
            </li>
            <li>
              Use the service in a way that violates applicable Indonesian or
              international law.
            </li>
          </ul>
          <p>
            We may suspend or terminate accounts that violate these terms, with
            notice where practical.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>No warranty</h2>
          <p>
            Data sourced from third-party registries and monitoring feeds may
            be incomplete, delayed, or incorrect. We make reasonable efforts to
            reconcile and verify it but provide no warranty of accuracy,
            completeness, timeliness, or fitness for a particular purpose. To
            the extent permitted by law, we disclaim liability for losses
            arising from reliance on the service.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Changes</h2>
          <p>
            We may update these terms. Material changes will be announced on
            the service; continued use after an update constitutes acceptance.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Governing law</h2>
          <p>
            These terms are governed by the laws of the Republic of Indonesia.
            Disputes will be resolved in the courts of Jakarta.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Contact</h2>
          <p>
            Questions about these terms:{' '}
            <a href="mailto:hello@karbonlens.com">hello@karbonlens.com</a>.
          </p>
        </section>
      </article>
    </main>
  );
}
