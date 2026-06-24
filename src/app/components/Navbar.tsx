'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { Database, Cpu, Menu, X, Terminal, Sun, Moon, LogOut, Activity } from 'lucide-react';
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
        window.location.href = '/login';
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

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

  // Hide Navbar on the login page (moved below React Hooks to follow Rules of Hooks)
  if (pathname === '/login') return null;

  const navItems = [
    {
      name: 'Research Dự Án',
      path: '/research',
      icon: Cpu,
    },
    {
      name: 'Watchlist',
      path: '/list',
      icon: Database,
    },
    {
      name: 'MXH Scan',
      path: '/social-scan',
      icon: Activity,
    },
    {
      name: 'Social Bot',
      path: '/admin',
      icon: Terminal,
    },
  ];


  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border bg-bg/82 backdrop-blur-md h-[62px] flex items-center">
      <div className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8">
        <div className="flex h-[62px] items-center justify-between">
          {/* Logo & Branding */}
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-2 to-brand shadow-sm group-hover:scale-105 transition-transform duration-300 overflow-hidden">
                <Image
                  src="/primus-logo.svg"
                  alt="Primus Logo"
                  width={28}
                  height={28}
                  className="w-7 h-7"
                  priority
                />
              </div>
              <span className="text-base sm:text-lg font-display font-bold tracking-tight text-text leading-none">
                Primus Research <span className="text-brand font-medium">AI</span>
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
                        className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-display font-medium transition-all duration-200 border ${
                          isActive
                            ? 'bg-brand-soft text-brand border-brand-border'
                            : 'text-text-2 hover:bg-surface-2 hover:text-text border-transparent'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              )}

              {/* Theme Switcher Toggle */}
              <button
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                className="flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-surface-2 text-text-2 hover:text-text hover:border-border-strong transition duration-200 cursor-pointer"
                title={theme === 'light' ? 'Chuyển sang chế độ Tối' : 'Chuyển sang chế độ Sáng'}
              >
                {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
              </button>

              {/* Authentication Button */}
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-neg/20 bg-neg-soft text-neg hover:bg-neg-soft hover:border-neg/45 transition duration-200 cursor-pointer"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : (
                <a
                  href="/login"
                  className="flex items-center gap-2 rounded-lg border border-brand px-3 py-1.5 text-xs font-display font-semibold text-brand hover:bg-brand-soft transition-all duration-200"
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
              className="flex items-center justify-center h-9 w-9 rounded-lg border border-border bg-surface-2 text-text-2 hover:text-text transition duration-200"
              title={theme === 'light' ? 'Chuyển sang chế độ Tối' : 'Chuyển sang chế độ Sáng'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {isAuthenticated ? (
              <>
                <button
                  onClick={handleLogout}
                  className="flex items-center justify-center h-9 w-9 rounded-lg border border-neg/20 bg-neg-soft text-neg transition duration-200"
                  title="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>

                <button
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                  type="button"
                  className="inline-flex items-center justify-center rounded-lg p-2 text-text-2 hover:bg-surface-2 hover:text-text focus:outline-none"
                  aria-controls="mobile-menu"
                  aria-expanded="false"
                >
                  <span className="sr-only">Open main menu</span>
                  {mobileMenuOpen ? (
                    <X className="block h-5 w-5" aria-hidden="true" />
                  ) : (
                    <Menu className="block h-5 w-5" aria-hidden="true" />
                  )}
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="flex items-center gap-1.5 rounded-lg border border-brand px-3 py-1.5 text-xs font-display font-semibold text-brand hover:bg-brand-soft transition-all duration-200"
              >
                Đăng Nhập
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && isAuthenticated && (
        <div className="md:hidden border-b border-border bg-bg/95 backdrop-blur-lg w-full absolute top-[62px] left-0 z-50" id="mobile-menu">
          <div className="space-y-1 px-2 pb-3 pt-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
              
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-display font-medium transition-all duration-200 border ${
                    isActive
                      ? 'bg-brand-soft text-brand border-brand-border'
                      : 'text-text-2 hover:bg-surface-2 hover:text-text border-transparent'
                  }`}
                >
                  <Icon className="h-4 w-4" />
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
