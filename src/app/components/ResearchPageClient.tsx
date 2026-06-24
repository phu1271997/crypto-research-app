'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project } from '@/lib/db';
import ProjectResult from '@/app/components/ProjectResult';
import { OPENROUTER_MODELS } from '@/lib/openrouter';
import { analyzeProjectAction } from '@/app/actions';
import { 
  Cpu, 
  Search, 
  Sparkles, 
  AlertCircle, 
  CheckCircle2, 
  ArrowRight, 
  Brain, 
  Plus, 
  X, 
  RefreshCw, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Loader2 
} from 'lucide-react';

interface BatchItem {
  id: string;
  url: string;
  status: 'pending' | 'scraping' | 'analyzing' | 'saving' | 'done' | 'failed';
  loadingText: string;
  elapsedSeconds: number;
  result: Project | null;
  error: string | null;
}

export default function ResearchPageClient() {
  // Input states
  const [websiteUrls, setWebsiteUrls] = useState<string[]>(['']);
  const [rawInput, setRawInput] = useState('');
  const [selectedModel, setSelectedModel] = useState('bop');

  // Batch execution states
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Resolve active model name for display
  const activeModelName = selectedModel === 'bop' ? 'Bốp (Hermes Agent)' : (OPENROUTER_MODELS.find(m => m.id === selectedModel)?.name.split(' (')[0].split(' —')[0] || 'AI');

  // Add a new URL input field
  const addUrlField = () => {
    setWebsiteUrls([...websiteUrls, '']);
  };

  // Update a specific URL input field
  const updateUrlField = (index: number, value: string) => {
    const updated = [...websiteUrls];
    updated[index] = value;
    setWebsiteUrls(updated);
  };

  // Remove a specific URL input field
  const removeUrlField = (index: number) => {
    const updated = websiteUrls.filter((_, i) => i !== index);
    setWebsiteUrls(updated.length > 0 ? updated : ['']);
  };

  // Handle batch form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Filter and sanitize URLs
    const sanitizedUrls = websiteUrls
      .map(url => url.trim())
      .filter(Boolean);
      
    if (sanitizedUrls.length === 0) return;

    setIsBatchRunning(true);
    setExpandedItemId(null);

    // Initialize batch items
    const items: BatchItem[] = sanitizedUrls.map((url, idx) => ({
      id: `batch-${idx}-${Date.now()}`,
      url,
      status: 'pending',
      loadingText: 'Đang xếp hàng đợi...',
      elapsedSeconds: 0,
      result: null,
      error: null
    }));

    setBatchItems(items);

    // Launch research concurrently for all items
    items.forEach(item => {
      analyzeSingleProject(item);
    });
  };

  // Analyze a single project in the batch
  const analyzeSingleProject = async (targetItem: BatchItem) => {
    // Set status to scraping
    setBatchItems(prev => prev.map(item => {
      if (item.id === targetItem.id) {
        return { ...item, status: 'scraping', loadingText: 'Đang cào dữ liệu website...' };
      }
      return item;
    }));

    // Start timer for this item
    const timerId = setInterval(() => {
      setBatchItems(prev => prev.map(item => {
        if (item.id === targetItem.id && item.status !== 'done' && item.status !== 'failed') {
          const nextSeconds = item.elapsedSeconds + 1;
          let text = item.loadingText;

          if (nextSeconds < 5) {
            text = 'Đang cào dữ liệu website...';
          } else if (nextSeconds < 18) {
            text = `Đang chạy ${activeModelName} AI Agent...`;
          } else if (nextSeconds < 28) {
            text = 'Đang quét định giá & Tokenomics...';
          } else {
            text = 'Đang lưu kết quả vào database...';
          }

          return { ...item, elapsedSeconds: nextSeconds, loadingText: text };
        }
        return item;
      }));
    }, 1000);

    try {
      const res = await analyzeProjectAction(targetItem.url, rawInput, selectedModel);
      clearInterval(timerId);

      if (!res.success) {
        setBatchItems(prev => prev.map(item => {
          if (item.id === targetItem.id) {
            return {
              ...item,
              status: 'failed',
              error: res.error || 'Lỗi phân tích dự án.',
              loadingText: 'Thất bại'
            };
          }
          return item;
        }));
      } else {
        setBatchItems(prev => prev.map(item => {
          if (item.id === targetItem.id) {
            return {
              ...item,
              status: 'done',
              result: res.data,
              loadingText: 'Hoàn tất'
            };
          }
          return item;
        }));
      }
    } catch (err: any) {
      clearInterval(timerId);
      setBatchItems(prev => prev.map(item => {
        if (item.id === targetItem.id) {
          return {
            ...item,
            status: 'failed',
            error: err.message || 'Lỗi kết nối hệ thống.',
            loadingText: 'Thất bại'
          };
        }
        return item;
      }));
    }
  };

  // Retry a specific failed item in the batch
  const handleRetryItem = (itemId: string) => {
    const item = batchItems.find(i => i.id === itemId);
    if (!item) return;

    // Reset item state
    setBatchItems(prev => prev.map(i => {
      if (i.id === itemId) {
        return {
          ...i,
          status: 'pending',
          error: null,
          result: null,
          elapsedSeconds: 0,
          loadingText: 'Đang chuẩn bị thử lại...'
        };
      }
      return i;
    }));

    // Re-run analysis
    analyzeSingleProject({
      ...item,
      status: 'pending',
      error: null,
      result: null,
      elapsedSeconds: 0
    });
  };

  // Reset the batch research form
  const handleReset = () => {
    setIsBatchRunning(false);
    setBatchItems([]);
    setWebsiteUrls(['']);
    setRawInput('');
    setExpandedItemId(null);
  };

  // Score badge coloring helper
  const getScoreBadgeClass = (score: number) => {
    if (score >= 80) return 'bg-pos-soft/20 text-pos border-pos-bd/30';
    if (score >= 60) return 'bg-warn-soft/20 text-warn border-warn-bd/30';
    return 'bg-neg-soft/20 text-neg border-neg-bd/30';
  };

  // Calculate batch metrics
  const totalCount = batchItems.length;
  const completedCount = batchItems.filter(i => i.status === 'done').length;
  const failedCount = batchItems.filter(i => i.status === 'failed').length;
  const runningCount = totalCount - completedCount - failedCount;
  const isFinished = totalCount > 0 && runningCount === 0;
  const progressPercent = totalCount > 0 ? Math.round(((completedCount + failedCount) / totalCount) * 100) : 0;

  return (
    <div className="space-y-8 py-4 max-w-4xl mx-auto">
      
      {/* Branding Header */}
      {!isBatchRunning && (
        <div className="text-center space-y-4 max-w-2xl mx-auto mb-2 animate-in fade-in duration-500">
          <div className="inline-flex items-center gap-2 rounded-full border border-brand-border bg-brand-soft px-3.5 py-1.5 font-mono text-xs uppercase tracking-wider text-brand shadow-sm">
            <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(45,212,191,0.15)] animate-pulse" />
            <span>Automated VC Due Diligence</span>
          </div>
          <h1 className="font-display font-[800] text-3xl sm:text-4xl md:text-5xl text-text leading-tight tracking-tighter">
            Nghiên Cứu &amp; Chấm Điểm <span className="text-brand">Crypto</span>
          </h1>
          <p className="text-text-2 text-sm sm:text-base leading-relaxed max-w-lg mx-auto">
            Nhập danh sách website các dự án để hệ thống tự động cào nội dung, kích hoạt tìm kiếm Web Search và chấm điểm đồng thời chuẩn VC.
          </p>
        </div>
      )}

      {/* INPUT FORM BLOCK */}
      {!isBatchRunning && (
        <form onSubmit={handleSubmit} className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="space-y-6">
            
            {/* Multi-website inputs */}
            <div className="space-y-3.5">
              <label className="block font-mono text-[10px] text-text-3 uppercase tracking-wider">
                Danh sách Website URL của các dự án
              </label>

              <div className="space-y-3">
                {websiteUrls.map((url, index) => (
                  <div key={index} className="flex items-center gap-3 group">
                    <div className="flex-grow bg-surface border border-border-strong rounded-2xl shadow-sm overflow-hidden flex items-stretch bg-bg/10">
                      {/* Serial index number */}
                      <span className="flex items-center pl-4 font-mono font-bold text-text-3/50 text-xs sm:text-sm select-none shrink-0 border-r border-border/40 pr-3 my-2 bg-surface-2/20">
                        {(index + 1).toString().padStart(2, '0')}
                      </span>
                      <span className="flex items-center pl-3 font-mono font-bold text-brand text-base select-none">&gt;</span>
                      <input
                        type="text"
                        required
                        value={url}
                        onChange={(e) => updateUrlField(index, e.target.value)}
                        className="flex-grow bg-transparent border-0 outline-none text-text font-mono text-sm sm:text-base py-4 px-3 placeholder-text-3 w-full focus:ring-0 focus:outline-none"
                        placeholder="https://project.xyz — dán website dự án"
                      />
                    </div>
                    {/* Delete button (only visible if more than 1 input) */}
                    {websiteUrls.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeUrlField(index)}
                        className="p-3.5 rounded-xl bg-surface border border-border hover:bg-neg-soft hover:border-neg/40 hover:text-neg text-text-3 transition cursor-pointer shrink-0"
                        title="Xóa ô nhập này"
                      >
                        <X className="h-4.5 w-4.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add field button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={addUrlField}
                  className="inline-flex items-center gap-1.5 px-4.5 py-3 rounded-xl border border-dashed border-border hover:border-brand-border hover:text-brand text-text-2 hover:bg-brand-soft/5 transition duration-200 cursor-pointer text-xs font-mono font-bold"
                >
                  <Plus className="h-4 w-4" />
                  <span>Thêm ô nhập website dự án</span>
                </button>
              </div>
            </div>

            {/* Model Selection */}
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
                  <option value="bop" className="bg-[#111a2e] text-brand text-xs sm:text-sm font-semibold">
                    🤖 Bốp (Hermes AI Agent) — Quét &amp; Research sâu qua VPS
                  </option>
                  {OPENROUTER_MODELS.map((model) => (
                    <option key={model.id} value={model.id} className="bg-[#111a2e] text-text-2 text-xs sm:text-sm">
                      {model.name} — (In: ${model.inputPrice} | Out: ${model.outputPrice} /M)
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 text-text-3" fill="none" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Shared Context */}
            <div className="space-y-2">
              <label htmlFor="raw-input" className="block font-mono text-[10px] text-text-3 uppercase tracking-wider">
                Thông tin bổ sung chung <span className="text-text-3 font-normal font-sans">(Áp dụng cho tất cả dự án - Không bắt buộc)</span>
              </label>
              <textarea
                name="raw-input"
                id="raw-input"
                rows={4}
                value={rawInput}
                onChange={(e) => setRawInput(e.target.value)}
                className="block w-full rounded-xl border border-border bg-surface-2 p-4 text-text placeholder-text-3 focus:border-brand focus:bg-surface focus:outline-none text-sm leading-relaxed transition-all resize-none font-sans"
                placeholder="Dán thêm các thông tin quan trọng về dự án tại đây (Ví dụ: backer, số tiền gọi vốn, roadmap...) để AI làm dữ liệu đối chiếu chéo..."
              />
            </div>

            {/* Action Trigger Button */}
            <div className="pt-2">
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] font-display font-bold text-sm py-4 px-4 transition duration-200 cursor-pointer shadow-md shadow-brand/10"
              >
                <Brain className="h-5 w-5 stroke-[#052e2a] fill-none stroke-[2]" />
                <span>Bắt Đầu Nghiên Cứu Đồng Thời ({websiteUrls.filter(Boolean).length} Dự án)</span>
              </button>
            </div>

          </div>
        </form>
      )}

      {/* BATCH PROGRESS & RESULTS DASHBOARD */}
      {isBatchRunning && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Batch Summary Panel */}
          <div className="bg-surface border border-border rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="font-display font-[800] text-xl sm:text-2xl text-text flex items-center gap-2">
                  <Cpu className="h-6 w-6 text-brand" />
                  <span>Tiến Trình Phân Tích Đồng Thời</span>
                </h2>
                <p className="text-xs sm:text-sm text-text-3 mt-1">
                  Mô hình: <span className="text-text-2 font-mono font-bold">{activeModelName}</span> • Trạng thái: {
                    isFinished 
                      ? '🎉 Đã hoàn tất toàn bộ!' 
                      : `🤖 Đang phân tích... (Còn lại ${runningCount}/${totalCount} dự án)`
                  }
                </p>
              </div>
              
              {/* Go Back / Reset Button */}
              <button
                onClick={handleReset}
                disabled={!isFinished}
                className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-xs font-display font-bold text-text-2 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition cursor-pointer self-start sm:self-auto"
              >
                <Plus className="h-4 w-4" />
                <span>Nghiên cứu thêm dự án</span>
              </button>
            </div>

            {/* Progress Bar & Numeric Metrics */}
            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs font-mono text-text-2">
                <div className="flex items-center gap-3">
                  <span>Hoàn tất: <strong className="text-brand font-bold">{completedCount}</strong></span>
                  {failedCount > 0 && <span className="text-neg">Thất bại: <strong>{failedCount}</strong></span>}
                </div>
                <span>{progressPercent}%</span>
              </div>
              <div className="w-full bg-surface-2 h-2 rounded-full overflow-hidden border border-border/30">
                <div 
                  className="h-full bg-gradient-to-r from-brand-2 to-brand rounded-full transition-all duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>

          {/* Batch Items List */}
          <div className="space-y-4">
            {batchItems.map((item, idx) => {
              const isActive = expandedItemId === item.id;
              const isItemRunning = item.status !== 'done' && item.status !== 'failed' && item.status !== 'pending';
              const resolvedDisplayName = item.result 
                ? item.result.name 
                : item.url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0];
                
              return (
                <div 
                  key={item.id}
                  className={`bg-surface border rounded-2xl transition-all duration-200 overflow-hidden shadow-sm ${
                    isActive 
                      ? 'border-brand-border/40 ring-1 ring-brand-border/20' 
                      : item.status === 'done' 
                      ? 'border-border/50 hover:border-brand-border/20' 
                      : item.status === 'failed' 
                      ? 'border-neg-bd/30' 
                      : 'border-border/60 animate-pulse-slow'
                  }`}
                >
                  {/* Item Main Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 select-none">
                    
                    {/* Left: Index & Website */}
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Index bubble */}
                      <span className="font-mono text-xs sm:text-sm font-bold text-text-3/40 w-6 text-center shrink-0">
                        {(idx + 1).toString().padStart(2, '0')}
                      </span>
                      
                      {/* Website link / Name */}
                      <div className="min-w-0">
                        <h4 className="font-display font-bold text-sm sm:text-base text-text truncate">
                          {resolvedDisplayName}
                        </h4>
                        <a 
                          href={item.url.startsWith('http') ? item.url : `https://${item.url}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[10px] text-text-3 mt-1 inline-flex items-center gap-1 hover:text-brand transition"
                        >
                          <span className="truncate max-w-[200px] sm:max-w-[320px]">{item.url}</span>
                          <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      </div>
                    </div>

                    {/* Middle: Progress / Scores */}
                    <div className="flex-grow flex items-center justify-start sm:justify-center px-0 sm:px-6 min-w-0">
                      {/* Pending / Running Loading Bar */}
                      {(item.status === 'pending' || isItemRunning) && (
                        <div className="w-full max-w-xs space-y-1.5">
                          <div className="flex justify-between text-[10px] font-mono text-text-3 leading-none">
                            <span className="truncate max-w-[180px]">{item.loadingText}</span>
                            <span className="shrink-0">{item.elapsedSeconds}s</span>
                          </div>
                          <div className="w-full bg-surface-2 h-1 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-brand rounded-full animate-progress-bar"
                              style={{ width: `${Math.min(95, item.elapsedSeconds * 4)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Completed Score Box */}
                      {item.status === 'done' && item.result && (
                        <div className="flex items-center gap-4 font-mono">
                          <div className="text-right">
                            <span className="text-[9px] text-text-3 block uppercase tracking-wider font-semibold">Khuyến nghị</span>
                            <span className="text-xs text-text-2 font-bold tracking-wide">{item.result.recommendation}</span>
                          </div>
                          <div className={`h-10 w-10 rounded-xl border flex items-center justify-center font-display font-extrabold text-sm shrink-0 ${getScoreBadgeClass(item.result.total_score)}`}>
                            {item.result.total_score}
                          </div>
                        </div>
                      )}

                      {/* Failed Error Details */}
                      {item.status === 'failed' && (
                        <div className="flex items-center gap-2 text-neg text-xs font-mono max-w-xs truncate" title={item.error || 'Thất bại'}>
                          <AlertCircle className="h-4 w-4 shrink-0" />
                          <span className="truncate">{item.error || 'Phân tích thất bại'}</span>
                        </div>
                      )}
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 border-t border-border/20 sm:border-0 pt-3 sm:pt-0 shrink-0">
                      {/* Elapsed Time for completed */}
                      {item.status === 'done' && (
                        <span className="font-mono text-[10px] text-text-3 hidden sm:inline">
                          Quét trong {item.elapsedSeconds}s
                        </span>
                      )}

                      {/* Retry Button for failures */}
                      {item.status === 'failed' && (
                        <button
                          onClick={() => handleRetryItem(item.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:border-brand-border bg-surface-2 text-xs font-mono font-bold text-text-2 hover:text-brand transition cursor-pointer"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Thử lại</span>
                        </button>
                      )}

                      {/* Expand Result / Detail Button for successes */}
                      {item.status === 'done' && item.result && (
                        <>
                          {/* Dedicated page link */}
                          <Link
                            href={`/project/${item.result.id}`}
                            target="_blank"
                            className="p-2 rounded-lg border border-border/60 hover:border-brand-border/40 text-text-3 hover:text-brand transition bg-surface-2/20"
                            title="Mở trang riêng"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                          
                          {/* Inline Expand Accordion */}
                          <button
                            onClick={() => setExpandedItemId(isActive ? null : item.id)}
                            className={`flex items-center gap-1 px-3 py-2 rounded-lg border text-xs font-display font-bold transition duration-200 cursor-pointer ${
                              isActive 
                                ? 'bg-brand-soft text-brand border-brand-border' 
                                : 'border-border/80 text-text-2 hover:bg-surface-2/40 hover:text-text'
                            }`}
                          >
                            <span>Xem nhanh</span>
                            {isActive ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          </button>
                        </>
                      )}
                      
                      {/* Active loader for running state */}
                      {isItemRunning && (
                        <div className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-brand-border/20 bg-brand-soft/5 text-brand font-mono text-[10px] font-bold select-none">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>ĐANG CHẠY</span>
                        </div>
                      )}
                    </div>

                  </div>

                  {/* Collapsible expanded report detail */}
                  {isActive && item.result && (
                    <div className="border-t border-border bg-[#0a0f1a]/40 p-5 sm:p-6 animate-in slide-in-from-top-3 duration-200">
                      <ProjectResult project={item.result} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}

    </div>
  );
}
