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
    <div className="relative w-full max-w-md bg-[#0a0f1d]/60 backdrop-blur-xl border border-white/5 rounded-2xl p-8 shadow-2xl shadow-indigo-950/20">
      <div className="flex flex-col items-center mb-6">
        {/* App Logo */}
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.15)] mb-4 overflow-hidden">
          <Image
            src="/primus-logo.svg"
            alt="Primus Logo"
            width={44}
            height={44}
            priority
          />
        </div>
        
        <h1 className="text-2xl font-bold text-white tracking-tight text-center">
          Primus Research <span className="text-indigo-400 font-medium">AI</span>
        </h1>
        <p className="mt-2 text-slate-400 text-xs text-center max-w-[280px]">
          Hệ thống quản trị và phân tích dự án tự động. Vui lòng xác thực mật khẩu để tiếp tục.
        </p>
      </div>

      {errorMsg && (
        <div className="mb-5 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-start gap-2.5 animate-in slide-in-from-top-2 duration-300">
          <Lock className="h-4 w-4 shrink-0 mt-0.5 text-rose-400" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
            Mật khẩu quản trị
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500">
              <KeyRound className="h-4 w-4" />
            </span>
            <input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu truy cập..."
              className="w-full rounded-xl border border-white/10 bg-black/40 pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 focus:outline-none transition-all duration-200"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-500 hover:text-slate-300 transition duration-150 cursor-pointer"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading || !password.trim()}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-600/10 hover:shadow-indigo-600/20 hover:scale-[1.01] active:scale-[0.99] transition-all duration-200 disabled:bg-white/5 disabled:text-slate-500 disabled:cursor-not-allowed disabled:scale-100 disabled:shadow-none"
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
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-indigo-500/10 blur-[120px] pointer-events-none" />

      <Suspense fallback={
        <div className="flex flex-col items-center gap-3 text-slate-400 text-xs">
          <Loader2 className="h-7 w-7 animate-spin text-indigo-500" />
          <span>Đang chuẩn bị biểu mẫu...</span>
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
