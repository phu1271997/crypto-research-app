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
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-soft px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-brand shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(45,212,191,0.15)] animate-pulse" />
            <span>Automated VC Due Diligence</span>
          </div>
          <h1 className="font-display font-[800] text-3xl sm:text-4xl md:text-5xl text-text leading-tight tracking-tighter">
            Nghiên Cứu &amp; Chấm Điểm <span className="text-brand">Crypto</span>
          </h1>
          <p className="text-text-2 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            Hệ thống tự động hóa quy trình phân tích. Dán URL website dự án, AI sẽ tiến hành cào dữ liệu, thực hiện Web Search thời gian thực để chấm điểm chính xác và lưu hồ sơ theo dõi.
          </p>
        </div>
      )}

      {/* ERROR MESSAGE CARD */}
      {error && (
        <div className="bg-surface border border-neg-bd rounded-2xl p-4 bg-neg-soft/30 flex gap-3 items-start animate-shake">
          <AlertCircle className="h-5 w-5 text-neg shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-display font-bold text-neg">Không thể hoàn thành nghiên cứu</h4>
            <p className="text-xs sm:text-sm text-text-2 mt-1 font-sans">{error}</p>
          </div>
        </div>
      )}

      {/* SAVED SUCCESS TOAST BANNER */}
      {savedSuccess && result && (
        <div className="bg-surface border border-pos-bd rounded-2xl p-4 bg-pos-soft/30 flex gap-3 items-start animate-fade-in">
          <CheckCircle2 className="h-5 w-5 text-pos shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-display font-bold text-pos">Nghiên cứu dự án thành công!</h4>
            <p className="text-xs sm:text-sm text-text-2 mt-0.5 font-sans">
              Hồ sơ dự án <span className="font-semibold text-text">{result.name}</span> đã tự động lưu trữ an toàn trong Database và được thêm vào Danh sách theo dõi.
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
              className="inline-flex items-center gap-2 rounded-xl bg-surface-2 border border-border-strong px-6 py-3 text-sm font-display font-semibold text-text-2 hover:text-text transition-all duration-200 cursor-pointer"
            >
              Phân tích dự án khác
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* DYNAMIC HIGH-TECH LOADING STATE CARD */}
      {isLoading && (
        <div className="bg-surface border border-border-strong rounded-3xl p-8 sm:p-12 text-center shadow-lg max-w-2xl mx-auto animate-pulse-slow">
          <div className="relative flex items-center justify-center h-20 w-20 mx-auto mb-8">
            {/* Pulsing visual outer rings */}
            <div className="absolute inset-0 rounded-full border-4 border-brand-soft animate-ping" />
            <div className="absolute -inset-2 rounded-full border border-brand/20 animate-spin [animation-duration:10s]" />
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-soft border border-brand/30 text-brand">
              <Sparkles className="h-8 w-8 animate-spin" />
            </div>
          </div>
          
          <h3 className="text-2xl font-display font-bold text-text mb-2">Đang phân tích dự án...</h3>
          <p className="text-sm text-text-2 max-w-sm mx-auto mb-8">
            Quá trình cào website, kích hoạt tác vụ tìm kiếm Web Search &amp; tổng hợp điểm số thường kéo dài từ 20 đến 40 giây.
          </p>

          {/* Dynamic Interactive Stepper */}
          <div className="space-y-4 max-w-md mx-auto text-left bg-surface-2 border border-border rounded-2xl p-5 font-mono">
            {loadingSteps.map((step, index) => {
              const isCompleted = index < loadingStep;
              const isCurrent = index === loadingStep;
              
              return (
                <div 
                  key={index} 
                  className={`flex gap-3 text-xs sm:text-sm items-start transition-opacity duration-300 ${
                    isCompleted ? 'text-text-3' : isCurrent ? 'text-brand font-semibold' : 'text-text-3/40'
                  }`}
                >
                  <div className="shrink-0 mt-0.5">
                    {isCompleted ? (
                      <CheckCircle2 className="h-4.5 w-4.5 text-brand" />
                    ) : isCurrent ? (
                      <div className="h-4.5 w-4.5 rounded-full border-2 border-brand border-t-transparent animate-spin" />
                    ) : (
                      <div className="h-4.5 w-4.5 rounded-full border border-border bg-transparent" />
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
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="space-y-5">
            {/* Website URL Input - Terminal Command Line Style */}
            <div className="space-y-2">
              <label htmlFor="website-url" className="block font-mono text-[10px] text-text-3 uppercase tracking-wider">
                Website URL của dự án
              </label>
              
              {/* Terminal Box */}
              <div className="bg-surface border border-border-strong rounded-2xl shadow-sm overflow-hidden w-full">
                {/* Terminal Header */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border font-mono text-[10px] text-text-3 uppercase tracking-wider bg-bg/40 select-none">
                  <span className="w-2 h-2 rounded-full bg-neg" />
                  <span className="w-2 h-2 rounded-full bg-warn" />
                  <span className="w-2 h-2 rounded-full bg-pos" />
                  <span className="ml-2 font-mono text-text-3">primus://due-diligence — live scan</span>
                </div>
                {/* Terminal Input Body */}
                <div className="flex items-stretch bg-bg/10">
                  <span className="flex items-center pl-4 font-mono font-bold text-brand text-base select-none">&gt;</span>
                  <input
                    type="text"
                    name="website-url"
                    id="website-url"
                    required
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    className="flex-grow bg-transparent border-0 outline-none text-text font-mono text-sm sm:text-base py-4 px-3 placeholder-text-3 w-full focus:ring-0 focus:outline-none"
                    placeholder="https://project.xyz — dán website dự án cần phân tích"
                  />
                  {/* Action Button inside Terminal */}
                  <button
                    type="submit"
                    disabled={!websiteUrl.trim()}
                    className="inline-flex items-center gap-2 font-display font-semibold text-sm bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] px-6 py-4 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shrink-0"
                  >
                    <Search className="h-4 w-4 stroke-[#052e2a] fill-none stroke-[2]" />
                    <span>Phân tích</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Model Selection Dropdown Input */}
            <div className="space-y-2">
              <label htmlFor="model-select" className="block font-mono text-[10px] text-text-3 uppercase tracking-wider">
                Mô hình AI nghiên cứu (OpenRouter)
              </label>
              <div className="relative">
                <select
                  id="model-select"
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  className="block w-full rounded-xl border border-border bg-surface-2 py-3.5 px-4 text-sm text-text font-mono focus:border-brand focus:bg-surface focus:outline-none transition-all appearance-none cursor-pointer"
                >
                  {OPENROUTER_MODELS.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#111a2e] text-text-2 text-xs sm:text-sm">
                      {model.name} — (In: ${model.inputPrice} | Out: ${model.outputPrice} /M)
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 text-text-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Supplemental Context Area */}
            <div className="space-y-2">
              <label htmlFor="raw-input" className="block font-mono text-[10px] text-text-3 uppercase tracking-wider">
                Thông tin bổ sung dự án <span className="text-text-3 font-normal font-sans">(Không bắt buộc)</span>
              </label>
              <textarea
                name="raw-input"
                id="raw-input"
                rows={6}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="block w-full rounded-xl border border-border bg-surface-2 p-4 text-text placeholder-text-3 focus:border-brand focus:bg-surface focus:outline-none text-sm leading-relaxed transition-all resize-none font-sans"
                placeholder="Dán thêm các thông tin quan trọng về dự án tại đây (Ví dụ: backer chính, lượng funding công bố, tokenomics allocation, roadmap, dự kiến ra token, doanh thu dự tính...) để AI có thêm dữ liệu kiểm tra và đối chiếu chéo tốt nhất..."
              />
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
