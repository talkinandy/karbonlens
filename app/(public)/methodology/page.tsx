/**
 * app/(public)/methodology/page.tsx — T24
 *
 * Public reference page explaining the KarbonLens v1 integrity score.
 * Linked from the T12 project-detail score card ("See full methodology →")
 * and T25's DataFreshness footer grid. No auth gate: `/methodology` is
 * absent from `proxy.ts` matcher and must stay absent (AC-7).
 *
 * Numbers on this page mirror `lib/score.ts` exactly (AC-6). Any change to
 * WEIGHTS, bucket thresholds, or COMMUNITY_OVERRIDES must update both this
 * prose and the `last-updated` date below. There is no automated sync.
 *
 * Metadata (<title>, OG tags) is owned by T26 and deliberately omitted here.
 */
export default function MethodologyPage() {
  return (
    <main className="kl-page">
      <article style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 24 }}>
          <h1 className="kl-page-title">Methodology — v1 integrity score</h1>
          <p className="kl-muted" style={{ marginTop: 8 }}>
            Methodology v1 — calibrating. Last updated 2026-04-22.
          </p>
        </header>

        <section style={{ marginBottom: 32 }}>
          <p>
            KarbonLens scores Indonesian carbon projects on a 0–100 integrity
            scale. The score is a transparent, configurable framework — not a
            final formula — and every weight, bucket threshold, and override
            is reviewed periodically. Weights and overrides below reflect the
            v0.1 calibration; the canonical implementation lives in{' '}
            <code>lib/score.ts</code>.
          </p>
          <p>
            The composite is a weighted sum of four sub-scores: reversal risk
            (35%), validation recency (25%), community flags (20%), and
            transparency (20%). Sections below specify each sub-score's inputs,
            bucket thresholds, and rationale, followed by the composite formula
            and clamping rules.
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Reversal risk — 35%</h2>
          <p>
            Satellite deforestation alerts from Global Forest Watch over the
            prior 90 days, intersected with the project buffer. Reversal is
            the single highest-weighted sub-score because a standing-forest
            project that has already been cleared cannot deliver its claimed
            carbon benefit.
          </p>
          <p className="kl-muted" style={{ fontSize: 13 }}>
            Conditions evaluated top-to-bottom; first match wins.
          </p>
          <dl>
            <dt>
              <strong>50</strong> — no GFW coverage (unknown-neutral)
            </dt>
            <dd>
              Project has no <code>gfw_geostore_id</code>; we cannot confirm or
              deny alerts, so we award a neutral midpoint rather than
              penalise.
            </dd>
            <dt>
              <strong>100</strong> — zero alerts in 90 days
            </dt>
            <dd>Has GFW coverage and recorded no alerts of any confidence.</dd>
            <dt>
              <strong>85</strong> — zero high-confidence alerts and fewer than
              10 total
            </dt>
            <dd>Minor low/nominal-confidence noise; no elevated concern.</dd>
            <dt>
              <strong>70</strong> — fewer than 5 high-confidence alerts
            </dt>
            <dd>Localised disturbance; warrants monitoring.</dd>
            <dt>
              <strong>45</strong> — fewer than 20 high-confidence alerts
            </dt>
            <dd>Material deforestation signal inside the project buffer.</dd>
            <dt>
              <strong>20</strong> — 20 or more high-confidence alerts
            </dt>
            <dd>Severe, sustained clearing.</dd>
          </dl>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Validation recency — 25%</h2>
          <p>
            Years elapsed since the project&apos;s most recent validation
            audit. Older validations mean more elapsed time for baseline,
            methodology, or on-the-ground conditions to drift. See Known
            limitations below for the PDD-vs-registration-date caveat.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Years since validation
                  </th>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Unknown</td>
                  <td>50 — unknown-neutral</td>
                </tr>
                <tr>
                  <td>&lt; 3 years</td>
                  <td>100</td>
                </tr>
                <tr>
                  <td>&lt; 5 years</td>
                  <td>85</td>
                </tr>
                <tr>
                  <td>&lt; 8 years</td>
                  <td>70</td>
                </tr>
                <tr>
                  <td>&lt; 12 years</td>
                  <td>50</td>
                </tr>
                <tr>
                  <td>&ge; 12 years</td>
                  <td>30</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Community flags — 20%</h2>
          <p>
            Default 75 for every project. A small hardcoded override list
            downgrades projects with documented community tension per
            third-party reports. Community override list will expand in v0.2
            based on validated third-party reports.
          </p>
          <dl>
            <dt>
              <strong>75</strong> — default (no documented community concern)
            </dt>
            <dd>Applies to all projects absent from the override list.</dd>
            <dt>
              <strong>45</strong> — Rimba Raya Biodiversity Reserve Project
            </dt>
            <dd>
              Slug <code>rimba-raya-biodiversity-reserve-project</code>;
              documented land-rights and revenue-share disputes.
            </dd>
          </dl>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Transparency — 20%</h2>
          <p>
            Registry cross-listings and active status. Projects listed on
            multiple registries with at least one active listing are the most
            auditable; unlisted projects are the least.
          </p>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Registry status
                  </th>
                  <th scope="col" style={{ textAlign: 'left' }}>
                    Score
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>&ge; 2 registries and &ge; 1 active</td>
                  <td>85</td>
                </tr>
                <tr>
                  <td>Exactly 1 registry and 1 active</td>
                  <td>70</td>
                </tr>
                <tr>
                  <td>&ge; 1 registry (none active)</td>
                  <td>55</td>
                </tr>
                <tr>
                  <td>No registry listings</td>
                  <td>40</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Composite score and clamping rules</h2>
          <p>
            The integrity score is the weighted sum of the four sub-scores,
            rounded and clamped to <strong>[0, 100]</strong>:
          </p>
          <pre
            style={{
              padding: 12,
              background: 'var(--kl-surface-muted, #f5f5f5)',
              overflowX: 'auto',
              fontSize: 13,
            }}
          >
{`integrity = round(
    0.35 * reversal_risk
  + 0.25 * validation_recency
  + 0.20 * community_flags
  + 0.20 * transparency
)`}
          </pre>
          <p>Additional rules:</p>
          <ul>
            <li>
              <strong>Zero-data trap (cap 60).</strong> If{' '}
              <code>registry_count === 0</code>, the composite is capped at
              60 regardless of the other sub-scores. A project with no
              registry listing cannot be independently verified, so it should
              not reach a high score.
            </li>
            <li>
              <strong>No satellite coverage (50 neutral).</strong> When
              <code> gfw_geostore_id IS NULL</code>, reversal_risk defaults to
              50 so that an absence of monitoring data is not treated as either
              a clean record or a red flag.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>Known limitations</h2>
          <ul>
            <li>
              <strong>Validation date proxy.</strong> Verra&apos;s OData API
              does not expose the PDD validation date directly; we use the
              project&apos;s registry <em>registration date</em> as a proxy.
              Registration is typically weeks-to-months after on-the-ground
              validation, so this score is a close but imperfect estimate.
            </li>
            <li>
              <strong>Community flags are hardcoded.</strong> Until a news
              sentiment scraper lands in v0.2, only projects on an
              curator-maintained override list are downgraded. Most projects
              therefore sit at the 75 default regardless of real-world
              community standing.
            </li>
            <li>
              <strong>Transparency leans on raw Verra status strings.</strong>{' '}
              After T06.1 normalised <code>projects.status</code> to the
              canonical enum, most projects land in the single-registry path
              (score 70 or 55). v0.2 adds SRN-PPI cross-references so more
              projects can reach the multi-registry path (85).
            </li>
            <li>
              <strong>No automated TS↔Python cross-check.</strong>{' '}
              <code>lib/score.ts</code> and{' '}
              <code>scrapers/scoring/weights.py</code> are hand-verified on
              each change; any drift will surface as a UI vs DB inconsistency.
            </li>
          </ul>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2>v0.2 roadmap</h2>
          <p>
            v0.2 will re-weight the composite based on calibration against
            known good and known bad projects, add SRN-PPI cross-references to
            the transparency sub-score, and introduce additional community
            signals (news sentiment, land-rights filings) to replace the
            hardcoded override list.
          </p>
        </section>

        <nav style={{ marginTop: 40, fontSize: 14 }}>
          <a href="/projects" className="kl-link">
            Browse all projects
          </a>
          {' · '}
          <a
            href="/projects/rimba-raya-biodiversity-reserve-project"
            className="kl-link"
          >
            See a scored project
          </a>
        </nav>
      </article>
    </main>
  );
}
