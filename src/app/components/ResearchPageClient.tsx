'use client';

import { useState, useEffect } from 'react';
import { analyzeProjectAction } from '@/app/actions';
import { Project } from '@/lib/db';
import ProjectResult from '@/app/components/ProjectResult';
import { OPENROUTER_MODELS } from '@/lib/openrouter';
import { Cpu, Search, Sparkles, AlertCircle, CheckCircle2, ArrowRight, Brain } from 'lucide-react';

export default function ResearchPageClient() {
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('google/gemini-3-flash-preview:online');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Project | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Resolve active model name for dynamic loading display
  const activeModelName = OPENROUTER_MODELS.find(m => m.id === selectedModel)?.name.split(' (')[0].split(' —')[0] || 'AI';

  // Stepper messages for loading state
  const loadingSteps = [
    'Đang kết nối máy chủ và gửi yêu cầu research...',
    'Đang truy cập và cào nội dung trực tiếp từ website dự án...',
    `Đang khởi chạy ${activeModelName} AI Research Agent...`,
    'Đang kích hoạt Web Search thời gian thực để quét dữ liệu gọi vốn, Backers và định giá...',
    'Đang phân tích Tokenomics, mô hình doanh nghiệp và quy mô cộng đồng...',
    'Đang đối chiếu các rủi ro, thế mạnh và tổng hợp bảng điểm 100...',
    'Đang hoàn tất lưu báo cáo tự động vào hệ thống database...'
  ];

  // Rotate loading steps every 4.5 seconds for engaging UX
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isLoading) {
      setLoadingStep(0);
      interval = setInterval(() => {
        setLoadingStep((prev) => {
          if (prev < loadingSteps.length - 1) {
            return prev + 1;
          }
          return prev;
        });
      }, 4500);
    }
    return () => clearInterval(interval);
  }, [isLoading, loadingSteps.length]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!websiteUrl.trim()) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setSavedSuccess(false);

    try {
      // Trigger Next.js Server Action with selected model
      const result = await analyzeProjectAction(websiteUrl.trim(), rawInput.trim(), selectedModel);
      
      if (!result.success) {
        // Server Action returned a structured error (not thrown, so message is preserved)
        setError(result.error);
        return;
      }
      
      setResult(result.data);
      setSavedSuccess(true);
      // Scroll to top of result smooth
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error(err);
      // Fallback for unexpected errors (network, etc.)
      setError(err.message || 'Đã xảy ra lỗi không xác định khi nghiên cứu dự án.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-10 py-4 max-w-4xl mx-auto">
      {/* Page Branding Header */}
      {!result && !isLoading && (
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-4 animate-in fade-in duration-500">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-600/10 border border-indigo-500/20 text-indigo-400 shadow-[0_0_20px_rgba(99,102,241,0.15)] mb-2">
            <Cpu className="h-6 w-6" />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            Nghiên Cứu & Chấm Điểm
            <span className="block mt-1 bg-gradient-to-r from-indigo-400 via-indigo-200 to-emerald-400 bg-clip-text text-transparent">
              Crypto Dự Án Tự Động
            </span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Hệ thống tự động hóa quy trình phân tích. Dán URL website dự án, AI sẽ tiến hành cào dữ liệu, thực hiện Web Search thời gian thực để chấm điểm chính xác và lưu hồ sơ theo dõi.
          </p>
        </div>
      )}

      {/* ERROR MESSAGE CARD */}
      {error && (
        <div className="glass-card rounded-2xl p-4 border-rose-500/20 bg-rose-500/5 flex gap-3 items-start animate-shake">
          <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-rose-400">Không thể hoàn thành nghiên cứu</h4>
            <p className="text-xs sm:text-sm text-slate-300 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* SAVED SUCCESS TOAST BANNER */}
      {savedSuccess && result && (
        <div className="glass-card rounded-2xl p-4 border-emerald-500/20 bg-emerald-500/5 flex gap-3 items-start animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-bold text-emerald-400">Nghiên cứu dự án thành công!</h4>
            <p className="text-xs sm:text-sm text-slate-300 mt-0.5">
              Hồ sơ dự án <span className="font-semibold text-white">{result.name}</span> đã tự động lưu trữ an toàn trong Database và được thêm vào Danh sách theo dõi.
            </p>
          </div>
        </div>
      )}

      {/* MAIN RESULT DISPLAY */}
      {result && !isLoading && (
        <div className="space-y-6">
          <ProjectResult project={result} />
          
          {/* Analyze another button */}
          <div className="flex justify-center pt-4">
            <button
              onClick={() => {
                setResult(null);
                setWebsiteUrl('');
                setRawInput('');
                setSavedSuccess(false);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-800 border border-white/10 px-6 py-3 text-sm font-bold text-slate-200 hover:bg-slate-700 hover:text-white transition-all duration-200"
            >
              Phân tích dự án khác
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* DYNAMIC HIGH-TECH LOADING STATE CARD */}
      {isLoading && (
        <div className="glass-card rounded-3xl p-8 sm:p-12 text-center border-indigo-500/20 shadow-[0_0_50px_rgba(99,102,241,0.05)] max-w-2xl mx-auto animate-pulse-slow">
          <div className="relative flex items-center justify-center h-20 w-20 mx-auto mb-8">
            {/* Pulsing visual outer rings */}
            <div className="absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-ping" />
            <div className="absolute -inset-2 rounded-full border border-indigo-400/20 animate-spin [animation-duration:10s]" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-indigo-600/10 border border-indigo-500/30 text-indigo-400">
              <Sparkles className="h-8 w-8 animate-spin" />
            </div>
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-2">Đang phân tích dự án...</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto mb-8">
            Quá trình cào website, kích hoạt tác vụ tìm kiếm Web Search & tổng hợp điểm số thường kéo dài từ 20 đến 40 giây.
          </p>

          {/* Dynamic Interactive Stepper */}
          <div className="space-y-4 max-w-md mx-auto text-left bg-slate-900/50 border border-white/5 rounded-2xl p-5">
            {loadingSteps.map((step, index) => {
              const isCompleted = index < loadingStep;
              const isCurrent = index === loadingStep;
              
              return (
                <div 
                  key={index} 
                  className={`flex gap-3 text-xs sm:text-sm items-start transition-opacity duration-300 ${
                    isCompleted ? 'text-slate-500' : isCurrent ? 'text-indigo-400 font-semibold' : 'text-slate-700'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-slate-600" />
                    ) : isCurrent ? (
                      <div className="h-4.5 w-4.5 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
                    ) : (
                      <div className="h-4.5 w-4.5 rounded-full border border-slate-700 bg-transparent" />
                    )}
                  </div>
                  <span>{step}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* INPUT FORM BLOCK */}
      {!result && !isLoading && (
        <form onSubmit={handleSubmit} className="glass-card rounded-3xl p-6 sm:p-8 space-y-6">
          <div className="space-y-5">
            {/* Website URL Input */}
            <div className="space-y-2">
              <label htmlFor="website-url" className="block text-sm font-bold text-slate-200">
                Website URL của dự án <span className="text-indigo-400">*</span>
              </label>
              <div className="relative rounded-xl shadow-sm">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
                  <Search className="h-5 w-5 text-slate-500" />
                </div>
                <input
                  type="text"
                  name="website-url"
                  id="website-url"
                  required
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  className="block w-full rounded-xl border border-white/10 bg-slate-950/60 py-3.5 pl-11 pr-4 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-sm transition-all animate-in fade-in duration-300"
                  placeholder="Ví dụ: monad.xyz, scroll.io, elizaos.ai..."
                />
              </div>
            </div>

            {/* Model Selection Dropdown Input */}
            <div className="space-y-2">
              <label htmlFor="model-select" className="block text-sm font-bold text-slate-200 flex items-center gap-1.5">
                <Brain className="h-4 w-4 text-indigo-400" />
                <span>Mô hình AI nghiên cứu (OpenRouter)</span>
              </label>
              <div className="relative">
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="block w-full rounded-xl border border-white/10 bg-slate-950/60 py-3 px-4 text-sm text-slate-200 focus:border-indigo-500 focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  {OPENROUTER_MODELS.map((model) => (
                    <option key={model.id} value={model.id} className="bg-slate-900 text-slate-200 text-xs sm:text-sm">
                      {model.name} — (Input: ${model.inputPrice} | Output: ${model.outputPrice} /M tokens)
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Supplemental Context Area */}
            <div className="space-y-2">
              <label htmlFor="raw-input" className="block text-sm font-bold text-slate-200">
                Thông tin bổ sung dự án <span className="text-slate-500 font-normal text-xs">(Không bắt buộc)</span>
              </label>
              <textarea
                name="raw-input"
                id="raw-input"
                rows={6}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="block w-full rounded-xl border border-white/10 bg-slate-950/60 p-4 text-slate-200 placeholder-slate-500 focus:border-indigo-500 focus:bg-slate-950 focus:ring-1 focus:ring-indigo-500 focus:outline-none text-sm leading-relaxed transition-all resize-none"
                placeholder="Dán thêm các thông tin quan trọng về dự án tại đây (Ví dụ: backer chính, lượng funding công bố, tokenomics allocation, roadmap, dự kiến ra token, doanh thu dự tính...) để AI có thêm dữ liệu kiểm tra và đối chiếu chéo tốt nhất..."
              />
            </div>
          </div>

          {/* Submit action */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={!websiteUrl.trim()}
              className="relative w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-4 text-sm font-black tracking-wide text-white shadow-lg shadow-indigo-600/20 hover:bg-indigo-500 hover:shadow-indigo-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 active:scale-[0.99] group overflow-hidden"
            >
              <span className="relative z-10 flex items-center gap-2">
                Bắt đầu Research & Chấm điểm
                <Sparkles className="h-4.5 w-4.5 text-indigo-200 animate-pulse group-hover:scale-110 transition-transform" />
              </span>
              <div className="absolute inset-0 bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
