import type { Metadata } from 'next';
import { Sora, Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import Navbar from './components/Navbar';
import { cookies } from 'next/headers';

const soraDisplay = Sora({
  variable: '--font-display',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});

const interSans = Inter({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Primus Research AI — Tự Động Chấm Điểm Dự Án Crypto Chuẩn VC',
  description: 'Công cụ Due Diligence tự động cho nhà đầu tư Crypto. AI chấm điểm dự án theo 8 tiêu chí VC, real-time web search, phát hiện Red Flags.',
  keywords: ['crypto research', 'scoring', 'primus research', 'AI', 'blockchain', 'investment tracker', 'due diligence'],
  authors: [{ name: 'Primus Research AI' }],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const authSession = cookieStore.get('auth_session');
  const isAuthenticated = authSession?.value === 'authenticated';

  return (
    <html
      lang="vi"
      className={`${soraDisplay.variable} ${interSans.variable} ${jetbrainsMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-bg text-text selection:bg-brand-soft selection:text-brand font-sans">
        {/* Navigation Bar */}
        <Navbar isAuthenticated={isAuthenticated} />

        {/* Core Main Viewport */}
        <main className="flex-grow mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>

        {/* Global Footer (Only visible when logged in to avoid duplicate footers on the landing page) */}
        {isAuthenticated && (
          <footer className="border-t border-border py-6 text-center text-xs text-text-3 bg-[#04060b]/40 backdrop-blur-sm">
            <div className="mx-auto max-w-7xl px-4">
              <p>© {new Date().getFullYear()} Primus Research AI. Đánh giá tự động được cung cấp bởi OpenRouter & Gemini Online.</p>
            </div>
          </footer>
        )}
      </body>
    </html>
  );
}
