'use client';

import { signIn } from 'next-auth/react';

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/**
 * Client button that triggers Google OAuth sign-in.
 * Mounted in the landing page hero and top nav (unauthenticated state).
 */
export function SignInButton({ className, children }: Props) {
  return (
    <button
      type="button"
      className={className ?? 'kl-btn kl-btn--primary'}
      onClick={() => signIn('google')}
    >
      {children ?? 'Sign in with Google'}
    </button>
  );
}
