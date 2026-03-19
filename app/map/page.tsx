'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Backward-compatibility redirect: /map → /
 * The map dashboard now lives at the root route.
 */
export default function MapRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/');
  }, [router]);

  return (
    <div className="h-screen flex items-center justify-center bg-[var(--bg)]">
      <p className="text-[var(--tx3)] text-sm">Redirecting...</p>
    </div>
  );
}
