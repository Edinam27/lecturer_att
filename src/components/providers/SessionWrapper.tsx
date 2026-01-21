'use client';

import { SessionProvider } from 'next-auth/react';
import type { Session } from 'next-auth';
import { ReactNode } from 'react';

interface SessionWrapperProps {
  children: ReactNode;
  initialSession?: Session | null;
}

export default function SessionWrapper({ children, initialSession }: SessionWrapperProps) {
  return (
    <SessionProvider session={initialSession} refetchOnWindowFocus={false} refetchInterval={0}>
      {children}
    </SessionProvider>
  );
}