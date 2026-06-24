'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { analyzeProjectAction } from '@/app/actions';
import { Project } from '@/lib/db';
import { Sparkles, CheckCircle2, AlertCircle, X, ArrowRight, Loader2 } from 'lucide-react';
import { useRouter, usePathname } from 'next/navigation';

interface ResearchContextType {
  isResearching: boolean;
  researchUrl: string;
  researchModel: string;
  researchResult: Project | null;
  researchError: string | null;
  savedSuccess: boolean;
  loadingStep: number;
  startResearch: (url: string, rawInput: string, model: string) => Promise<void>;
  resetResearch: () => void;
  dismissToast: () => void;
}

const ResearchContext = createContext<ResearchContextType | undefined>(undefined);

export function useResearch() {
  const context = useContext(ResearchContext);
  if (!context) {
    throw new Error('useResearch must be used within a ResearchProvider');
  }
  return context;
}

export function ResearchProvider({ children }: { children: React.ReactNode }) {
  const [isResearching, setIsResearching] = useState(false);
  const [researchUrl, setResearchUrl] = useState('');
  const [researchModel, setResearchModel] = useState('bop');
  const [researchResult, setResearchResult] = useState<Project | null>(null);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [showToast, setShowToast] = useState(false);

  const router = useRouter();
  const pathname = usePathname();

  const loadingSteps = [
    'Đang kết nối máy chủ và gửi yêu cầu research...',
    'Đang truy cập và cào nội dung trực tiếp từ website dự án...',
    'Đang khởi chạy AI Research Agent...',
    'Đang kích hoạt Web Search thời gian thực để quét dữ liệu gọi vốn, Backers và định giá...',
    'Đang phân tích Tokenomics, mô hình doanh nghiệp và quy mô cộng đồng...',
    'Đang đối chiếu các rủi ro, thế mạnh và tổng hợp bảng điểm 100...',
    'Đang hoàn tất lưu báo cáo tự động vào hệ thống database...'
  ];

  // Rotate loading steps every 4.5 seconds for engaging UX
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isResearching) {
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
  }, [isResearching, loadingSteps.length]);

  const startResearch = async (url: string, rawInput: string, model: string) => {
    if (!url.trim()) return;

    setIsResearching(true);
    setResearchUrl(url.trim());
    setResearchModel(model);
    setResearchError(null);
    setResearchResult(null);
    setSavedSuccess(false);
    setShowToast(true);

    try {
      const res = await analyzeProjectAction(url.trim(), rawInput.trim(), model);
      if (!res.success) {
        setResearchError(res.error);
        setSavedSuccess(false);
      } else {
        setResearchResult(res.data);
        setSavedSuccess(true);
        // If we are currently on the research page, scroll to top of the result smoothly
        if (pathname === '/research' || pathname === '/') {
          setTimeout(() => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }, 100);
        }
      }
    } catch (err: any) {
      console.error(err);
      setResearchError(err.message || 'Đã xảy ra lỗi không xác định khi nghiên cứu dự án.');
      setSavedSuccess(false);
    } finally {
      setIsResearching(false);
    }
  };

  const resetResearch = () => {
    setResearchResult(null);
    setResearchUrl('');
    setResearchError(null);
    setSavedSuccess(false);
    setShowToast(false);
  };

  const dismissToast = () => {
    setShowToast(false);
  };

  // Hide toast after 8 seconds of success/error if user is not on research pages
  useEffect(() => {
    if ((savedSuccess || researchError) && !isResearching) {
      const timer = setTimeout(() => {
        // Only auto dismiss if they navigated away from the home/research page
        if (pathname !== '/research' && pathname !== '/') {
          setShowToast(false);
        }
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [savedSuccess, researchError, isResearching, pathname]);

  // Handle click on the floating widget result
  const handleViewResult = () => {
    if (researchResult) {
      router.push(`/project/${researchResult.id}`);
      setShowToast(false);
    }
  };

  return (
    <ResearchContext.Provider
      value={{
        isResearching,
        researchUrl,
        researchModel,
        researchResult,
        researchError,
        savedSuccess,
        loadingStep,
        startResearch,
        resetResearch,
        dismissToast
      }}
    >
      {children}

      {/* FLOATING WIDGET - Only display when there is active research AND we are not on the research/home page */}
      {showToast && (pathname !== '/research' && pathname !== '/') && (
        <div className="fixed bottom-6 right-6 z-50 max-w-sm w-full bg-[#0b0f19]/90 backdrop-blur-md border border-brand-border/30 rounded-2xl shadow-2xl p-4 animate-in slide-in-from-bottom-5 fade-in duration-300">
          <div className="flex items-start gap-3">
            {/* Left Status Icon */}
            <div className="shrink-0 mt-0.5">
              {isResearching ? (
                <div className="relative flex items-center justify-center h-8 w-8">
                  <div className="absolute inset-0 rounded-full border border-brand/20 animate-spin" />
                  <Loader2 className="h-4 w-4 text-brand animate-spin" />
                </div>
              ) : savedSuccess ? (
                <CheckCircle2 className="h-6 w-6 text-pos" />
              ) : (
                <AlertCircle className="h-6 w-6 text-neg" />
              )}
            </div>

            {/* Middle Content */}
            <div className="flex-grow min-w-0">
              <h4 className="text-sm font-display font-bold text-text truncate">
                {isResearching
                  ? 'Đang nghiên cứu dự án...'
                  : savedSuccess
                  ? 'Nghiên cứu thành công!'
                  : 'Nghiên cứu thất bại'}
              </h4>
              <p className="text-xs text-text-3 truncate mt-0.5">
                {researchUrl}
              </p>

              {/* Progress step */}
              {isResearching && (
                <p className="text-[11px] text-brand font-medium mt-1 animate-pulse">
                  {loadingSteps[loadingStep]}
                </p>
              )}

              {/* Action buttons */}
              {!isResearching && (
                <div className="flex items-center gap-3 mt-3">
                  {savedSuccess && researchResult ? (
                    <button
                      onClick={handleViewResult}
                      className="inline-flex items-center gap-1 text-[11px] font-display font-bold text-brand hover:brightness-110"
                    >
                      Xem chi tiết <ArrowRight className="h-3 w-3" />
                    </button>
                  ) : (
                    <button
                      onClick={() => router.push('/research')}
                      className="inline-flex items-center gap-1 text-[11px] font-display font-bold text-text-2 hover:text-text"
                    >
                      Quay lại trang phân tích
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Right Close Button */}
            <button
              onClick={dismissToast}
              className="shrink-0 text-text-3 hover:text-text p-0.5 rounded-lg hover:bg-surface-2 transition-all duration-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </ResearchContext.Provider>
  );
}
