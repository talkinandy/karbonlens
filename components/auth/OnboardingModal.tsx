'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const PERSONAS = [
  'buyer',
  'broker',
  'corporate',
  'researcher',
  'developer',
  'other',
] as const;

type Persona = (typeof PERSONAS)[number];

const SNOOZE_DAYS = 7;

/**
 * First-login onboarding modal. Rendered conditionally by the (app) layout
 * based on server-side gating (see `components/auth/OnboardingGate.tsx`).
 * Submits to `/api/users/onboarding`; skip sets a 7-day snooze cookie.
 */
export function OnboardingModal() {
  const router = useRouter();
  const [visible, setVisible] = useState(true);
  const [persona, setPersona] = useState<Persona | ''>('');
  const [organization, setOrganization] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!visible) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!persona) {
      setError('Please select your role.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/users/onboarding', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ persona, organization: organization || null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setVisible(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSkip() {
    const until = Math.floor(Date.now() / 1000) + SNOOZE_DAYS * 24 * 60 * 60;
    const maxAge = SNOOZE_DAYS * 24 * 60 * 60;
    document.cookie = `kl_onboarding_snooze_until=${until}; path=/; max-age=${maxAge}; SameSite=Lax`;
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="kl-onboarding-title"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(16, 19, 26, 0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="kl-card"
        style={{
          maxWidth: 440,
          width: '90%',
          padding: 24,
          background: 'var(--kl-panel, #fff)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.25)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        <header>
          <h2 id="kl-onboarding-title" style={{ margin: 0, fontSize: 22 }}>
            Tell us about you
          </h2>
          <p className="kl-page-subtitle" style={{ marginTop: 4 }}>
            A quick one-time question so we can tailor alerts and digests.
          </p>
        </header>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kl-stat-label">Your role</span>
          <select
            required
            value={persona}
            onChange={(e) => setPersona(e.target.value as Persona)}
            style={{ padding: '8px 10px' }}
          >
            <option value="" disabled>
              Select one…
            </option>
            {PERSONAS.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span className="kl-stat-label">Organisation (optional)</span>
          <input
            type="text"
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            placeholder="ACME Corp"
            style={{ padding: '8px 10px' }}
          />
        </label>

        {error ? (
          <p role="alert" style={{ color: '#b00020', margin: 0 }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            type="button"
            onClick={handleSkip}
            disabled={submitting}
            className="kl-btn kl-btn--ghost"
          >
            Skip for now
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="kl-btn kl-btn--primary"
          >
            {submitting ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}
