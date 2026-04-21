'use client';

import { signOut } from 'next-auth/react';

type Props = {
  className?: string;
  children?: React.ReactNode;
};

/**
 * Client button that signs the user out via the NextAuth client helper
 * and redirects to the landing page.
 */
export function SignOutButton({ className, children }: Props) {
  return (
    <button
      type="button"
      className={className ?? 'kl-btn kl-btn--ghost'}
      onClick={() => signOut({ redirectTo: '/' })}
    >
      {children ?? 'Sign out'}
    </button>
  );
}
