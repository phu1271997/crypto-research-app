'use client';

import Hero from './Hero';
import Stats from './Stats';
import HowItWorks from './HowItWorks';
import Framework from './Framework';
import WhyPrimus from './WhyPrimus';
import CTA from './CTA';
import Footer from './Footer';

export default function LandingPage({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  return (
    <div className="flex flex-col min-h-screen text-slate-100 bg-[#0A0A1A] -mx-4 sm:-mx-6 lg:-mx-8 -my-8 overflow-hidden select-none">
      {/* Hero Section */}
      <Hero isAuthenticated={isAuthenticated} />

      {/* Stats Bar */}
      <Stats />

      {/* How It Works Section */}
      <HowItWorks />

      {/* Framework Section */}
      <Framework />

      {/* Why Primus Section */}
      <WhyPrimus />

      {/* CTA Section */}
      <CTA isAuthenticated={isAuthenticated} />

      {/* Footer Section */}
      <Footer />
    </div>
  );
}
