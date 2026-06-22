import { cookies } from 'next/headers';
import ResearchPageClient from '@/app/components/ResearchPageClient';
import LandingPage from '@/app/components/landing/LandingPage';

export default async function Page() {
  const cookieStore = await cookies();
  const authSession = cookieStore.get('auth_session');
  const isAuthenticated = authSession?.value === 'authenticated';

  if (isAuthenticated) {
    return <ResearchPageClient />;
  }

  return <LandingPage />;
}
