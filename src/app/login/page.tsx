'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { Lock, Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Successful login, redirect to requested page or home
        const nextPath = searchParams.get('next') || '/';
        router.push(nextPath);
        router.refresh();
      } else {
        setErrorMsg(data.error || 'Mật khẩu chưa chính xác, vui lòng thử lại.');
      }
    } catch (err) {
      console.error('Login submit error:', err);
      setErrorMsg('Không thể kết nối đến máy chủ. Vui lòng kiểm tra lại đường truyền mạng.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative w-full max-w-md bg-surface border border-border rounded-2xl p-8 shadow-lg">
      <div className="flex flex-col items-center mb-6">
        {/* App Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-soft border border-brand-border shadow-sm mb-4 overflow-hidden">
          <Image
            src="/primus-logo.svg"
            alt="Primus Logo"
            width={44}
            height={44}
            priority
          />
        </div>
        
        <h1 className="text-2xl font-display font-bold text-text tracking-tight text-center">
          Primus Research <span className="text-brand font-medium">AI</span>
        </h1>
        <p className="mt-2 text-text-3 text-xs text-center max-w-[280px]">
          Hệ thống quản trị và phân tích dự án tự động. Vui lòng xác thực mật khẩu để tiếp tục.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-neg-soft border border-neg-bd text-xs text-neg flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-300">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-neg" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold text-text-3 uppercase tracking-wider">
            Mật khẩu quản trị
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-text-3">
              <KeyRound className="h-4 w-4" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu truy cập..."
              className="w-full rounded-xl border border-border bg-surface-2 pl-10 pr-10 py-3 text-sm text-text placeholder-text-3 focus:border-brand focus:bg-surface-hover focus:outline-none transition-all duration-200 font-mono"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-text-3 hover:text-text transition duration-150 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !password.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-4 py-3 text-xs font-display font-semibold text-[#052e2a] shadow transition-all duration-200 disabled:bg-surface-2 disabled:text-text-3 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Đang xác thực...
            </>
          ) : (
            'Xác Thực Truy Cập'
          )}
        </button>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 animate-in fade-in duration-500">
      {/* Glow background decoration */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-brand-soft/20 blur-[120px] pointer-events-none" />

      <Suspense fallback={
        <div className="flex flex-col items-center gap-3 text-text-3 text-xs">
          <Loader2 className="h-7 w-7 animate-spin text-brand" />
          <span>Đang chuẩn bị biểu mẫu...</span>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
