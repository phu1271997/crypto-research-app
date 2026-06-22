'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Database, Cpu, Menu, X, Terminal, Sun, Moon, LogOut } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Navbar({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('theme') as 'light' | 'dark') || 'dark';
    }
    return 'dark';
  });

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        // Use window.location to trigger a clean hard reload after logging out
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  // Hide Navbar on the login page
  if (pathname === '/login') return null;

  // Apply theme class to document element on mount and state changes
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'light') {
      root.classList.add('light');
      root.classList.remove('dark');
    } else {
      root.classList.add('dark');
      root.classList.remove('light');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const navItems = [
    {
      name: 'Research Dự Án',
      path: '/',
      icon: Cpu,
    },
    {
      name: 'Watchlist',
      path: '/list',
      icon: Database,
    },
    {
      name: 'Social Bot',
      path: '/admin',
      icon: Terminal,
    },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-white/5 bg-background/70 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Branding */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.1)] group-hover:bg-indigo-600/20 group-hover:shadow-[0_0_20px_rgba(99,102,241,0.2)] transition-all duration-300 overflow-hidden">
                <Image
                  src="/primus-logo.svg"
                  alt="Primus Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 group-hover:scale-110 transition-transform duration-300"
                  priority
                />
              </div>
              <span className="text-lg sm:text-xl font-bold tracking-tight bg-gradient-to-r from-slate-50 via-slate-100 to-indigo-300 bg-clip-text text-transparent">
                Primus Research <span className="text-indigo-400 font-medium">AI</span>
              </span>
            </Link>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden md:block">
            <div className="flex items-center space-x-3">
              {isAuthenticated && (
                <div className="flex items-center space-x-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
                    
                    return (
                      <Link
                        key={item.path}
                        href={item.path}
                        className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                            : 'text-slate-400 hover:bg-white/5 hover:text-slate-200 border border-transparent'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Theme Switcher Toggle */}
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white transition duration-200 cursor-pointer"
                title={theme === 'light' ? 'Chuyển sang chế độ Tối' : 'Chuyển sang chế độ Sáng'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              {/* Authentication Button */}
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/25 text-rose-400 transition duration-200 cursor-pointer"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <a
                  href="/login"
                  className="flex items-center gap-2 rounded-lg border border-indigo-500 px-4 py-2 text-sm font-medium text-indigo-400 hover:bg-indigo-500/10 transition-all duration-200"
                >
                  Đăng Nhập
                </a>
              )}
            </div>
          </div>

          {/* Mobile menu button and theme switcher */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-white/10 bg-white/5 text-slate-300 hover:text-white transition duration-200"
              title={theme === 'light' ? 'Chuyển sang chế độ Tối' : 'Chuyển sang chế độ Sáng'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {isAuthenticated ? (
              <>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 transition duration-200"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-slate-200 focus:outline-none"
                  aria-controls="mobile-menu"
                  aria-expanded="false"
                >
                  <span className="sr-only">Open main menu</span>
                  {mobileMenuOpen ? (
                    <X className="block h-6 w-6" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-6 w-6" aria-hidden="true" />
                  )}
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="flex items-center gap-1.5 rounded-lg border border-indigo-500 px-3 py-1.5 text-xs font-semibold text-indigo-400 hover:bg-indigo-500/10 transition-all duration-200"
              >
                Đăng Nhập
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="md:hidden border-b border-white/5 bg-background/95 backdrop-blur-lg" id="mobile-menu">
          <div className="space-y-1 px-2 pb-3 pt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
              
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-base font-medium transition-all duration-200 ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </nav>
  );
}
