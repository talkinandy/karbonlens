/**
 * 404 fallback for /projects/[slug]. Rendered when `getProjectDetail` returns
 * null (no matching slug in the DB).
 */

import Link from 'next/link';

export default function ProjectNotFound() {
  return (
    <main className="kl-page">
      <header className="kl-page-header">
        <div>
          <p className="kl-section-label">
            <Link href="/projects">← Back to projects</Link>
          </p>
          <h1 className="kl-page-title">Project not found</h1>
          <p className="kl-page-subtitle">
            The slug you followed does not match any project in the KarbonLens
            registry. It may have been renamed, withdrawn, or mistyped.
          </p>
        </div>
      </header>
    </main>
  );
}
