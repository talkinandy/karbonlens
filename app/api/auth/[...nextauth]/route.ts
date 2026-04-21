/**
 * NextAuth catch-all route handler.
 * All config lives in `lib/auth.ts`; this file only re-exports handlers.
 */
import { handlers } from '@/lib/auth';

export const { GET, POST } = handlers;
