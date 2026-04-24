import { auth } from '@/lib/auth';
import { SignInButton } from './SignInButton';
import { SignOutButton } from './SignOutButton';

/**
 * Server component — resolves the current session and renders either the
 * authenticated avatar/email block with a sign-out affordance, or a
 * sign-in button for anonymous visitors. Dropdown behaviour is v0.2;
 * v0.1 renders the two items inline for simplicity.
 */
export async function UserMenu() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="kl-user-menu kl-user-menu--anon">
        <SignInButton />
      </div>
    );
  }

  const { email, image, name } = session.user;
  const displayName = name ?? email;

  return (
    <div
      className="kl-user-menu"
      style={{ display: 'flex', alignItems: 'center', gap: 12 }}
    >
      {image ? (
        // Native <img> is deliberate — `next/image` requires `remotePatterns`
        // config for Google's CDN; keep the nav self-contained in v0.1.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt=""
          width={28}
          height={28}
          style={{ borderRadius: '50%' }}
        />
      ) : null}
      <span className="kl-user-menu-email" aria-label="Signed in as">
        {displayName}
      </span>
      <SignOutButton />
    </div>
  );
}
