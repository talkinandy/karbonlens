'use client';

/**
 * SignInRequiredModal — mounted once in the root layout.
 *
 * Reads `?signin=1` (and optional `?from=<path>`) from the URL and shows a
 * dismissible dialog prompting the visitor to sign in with Google. Kicked
 * off by `proxy.ts`, which redirects anonymous requests to gated routes
 * (/alerts, /admin/*) to `/?signin=1&from=<original-path>`.
 *
 * After sign-in, NextAuth's callback returns the user to `from` (defaults
 * to /alerts if the param is absent — the most common gated destination).
 *
 * Dismissing the modal clears the two search params via `router.replace`
 * so a later refresh doesn't re-open the dialog.
 */

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';

const ALLOWED_FROM = /^\/[a-zA-Z0-9_\-/]*$/; // relative path only — never honour off-domain redirects

export function SignInRequiredModal() {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();

  const open = params.get('signin') === '1';
  const fromRaw = params.get('from');
  const from = fromRaw && ALLOWED_FROM.test(fromRaw) ? fromRaw : null;
  const callbackUrl = from ?? '/alerts';

  // ESC to dismiss
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') dismiss();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Focus the primary button when opened for keyboard/screen-reader users
  useEffect(() => {
    if (!open) return;
    const btn = document.getElementById('kl-signin-cta');
    btn?.focus();
  }, [open]);

  if (!open) return null;

  function dismiss() {
    router.replace(pathname, { scroll: false });
  }

  const friendlyFrom = from && from !== '/alerts' ? from : null;

  return (
    <div
      className="kl-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="kl-signin-title"
      aria-describedby="kl-signin-body"
      onClick={(e) => {
        // Dismiss on backdrop click — not on content click.
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className="kl-modal">
        <button
          type="button"
          className="kl-modal-close"
          aria-label="Close"
          onClick={dismiss}
        >
          ×
        </button>

        <h2 id="kl-signin-title" className="kl-modal-title">
          Sign in to continue
        </h2>

        <p id="kl-signin-body" className="kl-modal-body">
          {from === '/alerts' || !from ? (
            <>
              Your alerts inbox is scoped to your account. Sign in with
              Google to see reversal, price, and regulatory notifications
              for the projects on your watchlist.
            </>
          ) : friendlyFrom && friendlyFrom.startsWith('/admin') ? (
            <>
              The admin queue is restricted to approved KarbonLens reviewers.
              Sign in with your approved Google account to continue.
            </>
          ) : (
            <>
              This area requires a signed-in account. After sign-in
              we&apos;ll send you back to{' '}
              <span className="kl-modal-path">{friendlyFrom}</span>.
            </>
          )}
        </p>

        <div className="kl-modal-actions">
          <button
            id="kl-signin-cta"
            type="button"
            className="kl-btn kl-btn--primary kl-modal-primary"
            onClick={() => signIn('google', { callbackUrl })}
          >
            <GoogleGlyph />
            Sign in with Google
          </button>
          <button
            type="button"
            className="kl-modal-secondary"
            onClick={dismiss}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}

function GoogleGlyph() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 18 18"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 8 }}
    >
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
      />
    </svg>
  );
}
