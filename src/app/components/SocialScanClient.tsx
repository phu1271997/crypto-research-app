'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Project, ScanReport } from '@/lib/db';
import { 
  dispatchSocialScanAction, 
  getBotCommandStatusAction, 
  getScanReportsAction, 
  getLatestScanReportsAction,
  deleteProjectAction
} from '@/app/actions';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Search, 
  Calendar, 
  ShieldAlert, 
  Sparkles, 
  Check, 
  Loader2, 
  ChevronRight, 
  ExternalLink,
  MessageSquare,
  Users,
  TrendingUp,
  FileText,
  Trash2
} from 'lucide-react';

interface SocialScanClientProps {
  initialProjects: Project[];
  initialLatestReports: Record<string, ScanReport>;
}

export default function SocialScanClient({ 
  initialProjects, 
  initialLatestReports 
}: SocialScanClientProps) {
  // State
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [latestReports, setLatestReports] = useState<Record<string, ScanReport>>(initialLatestReports);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(
    initialProjects.length > 0 ? initialProjects[0].id : null
  );
  
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  
  // Scanning state
  const [isScanning, setIsScanning] = useState(false);
  const [activeCommandId, setActiveCommandId] = useState<number | null>(null);
  const [scanProgress, setScanProgress] = useState('');
  
  // History state
  const [historyReports, setHistoryReports] = useState<ScanReport[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [activeReport, setActiveReport] = useState<ScanReport | null>(null);

  // Filter projects based on search
  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.website.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Set the active report whenever the active project changes or latestReports updates
  useEffect(() => {
    if (activeProjectId) {
      const latest = latestReports[activeProjectId];
      if (latest) {
        setActiveReport(latest);
        // Fetch history
        fetchReportHistory(activeProjectId);
      } else {
        setActiveReport(null);
        setHistoryReports([]);
      }
    } else {
      setActiveReport(null);
      setHistoryReports([]);
    }
  }, [activeProjectId, latestReports]);

  // Fetch report history for the active project
  const fetchReportHistory = async (projectId: string) => {
    setLoadingHistory(true);
    try {
      const history = await getScanReportsAction(projectId);
      setHistoryReports(history);
    } catch (error) {
      console.error('Error fetching history:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Toggle selection for a project
  const toggleProjectSelection = (id: string) => {
    const next = new Set(selectedProjectIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedProjectIds(next);
  };

  // Toggle all visible projects
  const toggleSelectAll = () => {
    if (selectedProjectIds.size === filteredProjects.length) {
      setSelectedProjectIds(new Set());
    } else {
      setSelectedProjectIds(new Set(filteredProjects.map(p => p.id)));
    }
  };

  // Dispatch a scan command
  const handleStartScan = async () => {
    if (selectedProjectIds.size === 0) return;
    
    setIsScanning(true);
    setScanProgress('Đang khởi tạo lệnh scan và gửi lên hàng đợi...');
    
    try {
      const res = await dispatchSocialScanAction(Array.from(selectedProjectIds));
      if (!res.success) {
        setScanProgress(`Lỗi: ${res.error}`);
        setIsScanning(false);
      } else {
        setActiveCommandId(res.data.id);
        setScanProgress('Lệnh đã được gửi thành công. Đang đợi Bốp-Worker trên VPS tiếp nhận...');
      }
    } catch (error: any) {
      setScanProgress(`Lỗi kết nối: ${error.message || 'Lỗi không xác định'}`);
      setIsScanning(false);
    }
  };

  // Delete project handler
  const handleDeleteProject = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    
    const project = projects.find(p => p.id === id);
    const displayName = project ? project.name : 'dự án này';
    const displayResolvedName = displayName === 'Dự án' && project
      ? project.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0]
      : displayName;
    
    if (confirm(`Bạn có chắc chắn muốn xóa "${displayResolvedName}" khỏi hệ thống? Hành động này sẽ xóa vĩnh viễn dự án và toàn bộ lịch sử scan mạng xã hội liên quan.`)) {
      try {
        const success = await deleteProjectAction(id);
        if (success) {
          // Remove from local state
          const remainingProjects = projects.filter(p => p.id !== id);
          setProjects(remainingProjects);
          
          // Clear active project if we deleted it
          if (activeProjectId === id) {
            setActiveProjectId(remainingProjects.length > 0 ? remainingProjects[0].id : null);
          }
          
          // Remove from selected list
          const nextSelected = new Set(selectedProjectIds);
          nextSelected.delete(id);
          setSelectedProjectIds(nextSelected);
        } else {
          alert('Không thể xóa dự án. Vui lòng thử lại.');
        }
      } catch (error) {
        console.error('Error deleting project:', error);
        alert('Đã xảy ra lỗi hệ thống khi xóa dự án.');
      }
    }
  };

  // Poll command status
  useEffect(() => {
    let intervalId: NodeJS.Timeout;
    
    if (isScanning && activeCommandId) {
      let pollCount = 0;
      intervalId = setInterval(async () => {
        pollCount++;
        try {
          const cmd = await getBotCommandStatusAction(activeCommandId);
          if (!cmd) {
            setScanProgress('Không tìm thấy trạng thái lệnh. Đang thử lại...');
            return;
          }
          
          if (cmd.status === 'processing') {
            const projectsCount = cmd.payload?.projects?.length || 1;
            setScanProgress(`🤖 Bốp đang scan mạng xã hội cho ${projectsCount} dự án đã chọn... (Đang chạy được ${pollCount * 3}s)`);
          } else if (cmd.status === 'done') {
            setScanProgress('🎉 Scan mạng xã hội hoàn tất! Đang tải dữ liệu mới...');
            clearInterval(intervalId);
            setIsScanning(false);
            setActiveCommandId(null);
            setSelectedProjectIds(new Set());
            
            // Reload reports
            const freshReports = await getLatestScanReportsAction();
            setLatestReports(freshReports);
            
            // Refresh history for active project if it was scanned
            if (activeProjectId) {
              fetchReportHistory(activeProjectId);
            }
          } else if (cmd.status === 'failed') {
            setScanProgress(`❌ Thất bại: ${cmd.error || 'Bốp gặp lỗi khi thực hiện quét.'}`);
            clearInterval(intervalId);
            setIsScanning(false);
            setActiveCommandId(null);
          }
        } catch (error) {
          console.error('Error polling command status:', error);
        }
      }, 3000);
    }
    
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [isScanning, activeCommandId, activeProjectId]);

  // Platform styling helper
  const getPlatformIcon = (platform: string) => {
    const name = platform.toLowerCase();
    if (name.includes('twitter') || name.includes('x')) {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface-hover text-text border border-border/60 shadow-sm">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </span>
      );
    }
    if (name.includes('telegram')) {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#0088cc]/10 text-[#0088cc] border border-[#0088cc]/25 shadow-sm">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
        </span>
      );
    }
    if (name.includes('discord')) {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/25 shadow-sm">
          <MessageSquare className="h-4 w-4" />
        </span>
      );
    }
    if (name.includes('github')) {
      return (
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#24292e]/25 text-[#fafbfc] border border-[#30363d]/45 shadow-sm">
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
          </svg>
        </span>
      );
    }
    return (
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-surface text-text-3 border border-border shadow-sm">
        <Users className="h-4 w-4" />
      </span>
    );
  };

  // Momentum details helper
  const getMomentumDetails = (momentum: ScanReport['payload']['momentum']) => {
    const mappings = {
      accelerating: { 
        text: 'Bứt Phá (Accelerating)', 
        desc: 'Xung lực hoạt động truyền thông và cộng đồng đang gia tăng mạnh mẽ. Số lượng thảo luận sôi nổi, lượng người theo dõi tăng nhanh và chất lượng tương tác ở mức rất cao.',
        cls: 'bg-emerald-500/5 text-emerald-400 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.04)]',
        dotCls: 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]'
      },
      steady: { 
        text: 'Ổn Định (Steady)', 
        desc: 'Các kênh truyền thông duy trì nhịp độ hoạt động đều đặn. Lượng người theo dõi và tần suất tương tác tăng trưởng bền vững theo thời gian, không có biến động tiêu cực.',
        cls: 'bg-blue-500/5 text-blue-400 border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.04)]',
        dotCls: 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.6)]'
      },
      slowing: { 
        text: 'Chậm Lại (Slowing)', 
        desc: 'Tần suất đăng bài hoặc lượng tương tác cộng đồng có dấu hiệu sụt giảm trong 7 ngày qua. Cần theo dõi sát để đánh giá xem đây là tạm thời hay xu hướng suy giảm dài hạn.',
        cls: 'bg-amber-500/5 text-amber-400 border-amber-500/20 shadow-[0_0_15px_rgba(245,158,11,0.04)]',
        dotCls: 'bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]'
      },
      inactive: { 
        text: 'Tạm Ngưng (Inactive)', 
        desc: 'Các kênh mạng xã hội gần như không có hoạt động mới. Tương tác cộng đồng ở mức tối thiểu, tín hiệu dự án đang bị đóng băng hoặc thiếu nhân sự quản lý nội dung.',
        cls: 'bg-rose-500/5 text-rose-400 border-rose-500/20 shadow-[0_0_15px_rgba(239,68,68,0.04)]',
        dotCls: 'bg-rose-400 shadow-[0_0_8px_rgba(248,113,113,0.6)]'
      }
    };
    return mappings[momentum] || { 
      text: momentum, 
      desc: 'Chưa xác định được xung lực hoạt động chính xác của dự án.', 
      cls: 'bg-surface border-border text-text-2',
      dotCls: 'bg-text-3'
    };
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display font-[800] text-3xl text-text tracking-tight">
            Giám Sát <span className="text-brand">Scan</span>
          </h1>
          <p className="text-sm text-text-3 mt-1">
            Theo dõi dòng chảy cộng đồng, xung lực mạng xã hội và phát hiện cảnh báo rủi ro (Red Flags) của dự án qua AI Agent Bốp.
          </p>
        </div>
        
        {/* Connection status indicator */}
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-border/40 bg-brand-soft/20 px-3.5 py-1.5 font-mono text-xs text-brand shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-brand shadow-[0_0_0_3px_rgba(45,212,191,0.15)] animate-pulse" />
          <span>Bốp Agent Online (VPS)</span>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT COLUMN - Selection Panel (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Project List Card */}
          <div className="bg-surface border border-border rounded-2xl p-5 space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-sm text-text uppercase tracking-wider font-mono">Dự Án Theo Dõi</h3>
              <Link 
                href="/list" 
                className="text-[11px] text-brand hover:text-brand-2 transition font-medium flex items-center gap-0.5"
              >
                Quản lý Watchlist
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-xl py-2.5 pl-9 pr-4 text-xs text-text placeholder-text-3 focus:outline-none focus:border-brand-border/60 transition"
              />
              <Search className="absolute left-3 top-3.5 h-3.5 w-3.5 text-text-3" />
            </div>

            {/* Batch Selection Header */}
            {filteredProjects.length > 0 && (
              <div className="flex items-center justify-between border-b border-border/60 pb-3 pt-1 text-xs select-none">
                <label className="flex items-center gap-2 text-text-2 hover:text-text cursor-pointer transition font-medium">
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.size === filteredProjects.length && filteredProjects.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border text-brand bg-surface focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Chọn tất cả ({filteredProjects.length})</span>
                </label>
                {selectedProjectIds.size > 0 && (
                  <span className="text-brand font-bold font-mono">Đã chọn {selectedProjectIds.size}</span>
                )}
              </div>
            )}

            {/* Scrollable Project List */}
            <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-12 text-xs text-text-3 border border-dashed border-border/50 rounded-xl">
                  Không tìm thấy dự án nào.
                </div>
              ) : (
                filteredProjects.map((p) => {
                  const isSelected = selectedProjectIds.has(p.id);
                  const isActive = activeProjectId === p.id;
                  const report = latestReports[p.id];
                  
                  const resolvedName = p.name === 'Dự án' 
                    ? p.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] 
                    : p.name;
                  
                  return (
                    <div 
                      key={p.id}
                      className={`group flex items-center justify-between p-3 rounded-xl border transition-all duration-200 ${
                        isActive 
                          ? 'bg-brand-soft/15 border-brand-border/40 text-text shadow-[inset_0_1px_1px_rgba(255,255,255,0.02)]' 
                          : 'bg-surface-2/20 border-border/50 hover:bg-surface-2/60 text-text-2 hover:text-text'
                      }`}
                    >
                      {/* Checkbox & Name */}
                      <div className="flex items-center gap-3 min-w-0 flex-grow">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleProjectSelection(p.id)}
                          className="rounded border-border text-brand bg-surface focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer shrink-0"
                        />
                        <div 
                          onClick={() => setActiveProjectId(p.id)}
                          className="min-w-0 flex-grow cursor-pointer"
                        >
                          <h4 className="text-xs sm:text-sm font-display font-bold truncate hover:text-brand transition">
                            {resolvedName}
                          </h4>
                          <p className="text-[10px] text-text-3 truncate mt-0.5 font-mono">
                            {p.website.replace(/^https?:\/\/(www\.)?/i, '')}
                          </p>
                        </div>
                      </div>

                      {/* Info & Navigation & Inline Delete */}
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {report ? (
                          <span 
                            className={`h-2 w-2 rounded-full ${
                              report.payload.momentum === 'accelerating' ? 'bg-emerald-400' :
                              report.payload.momentum === 'steady' ? 'bg-blue-400' :
                              report.payload.momentum === 'slowing' ? 'bg-amber-400' : 'bg-rose-400'
                            }`}
                            title={`Lực kéo: ${report.payload.momentum}`}
                          />
                        ) : (
                          <span className="text-[9px] text-text-3 border border-border/50 px-1 py-0.5 rounded font-mono select-none">N/A</span>
                        )}
                        
                        {/* Inline Delete Button (appears on hover) */}
                        <button
                          onClick={(e) => handleDeleteProject(e, p.id)}
                          className="text-text-3 hover:text-neg transition p-1 cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100"
                          title="Xóa dự án này khỏi hệ thống"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        
                        <button
                          onClick={() => setActiveProjectId(p.id)}
                          className="text-text-3 hover:text-brand transition p-0.5 cursor-pointer"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Action Trigger Button */}
            <div className="pt-2">
              <button
                onClick={handleStartScan}
                disabled={selectedProjectIds.size === 0 || isScanning}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] font-display font-bold text-sm py-3.5 px-4 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-md shadow-brand/10"
              >
                {isScanning ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Activity className="h-4.5 w-4.5" />
                )}
                <span>
                  {isScanning ? 'Đang chạy scan...' : `Khởi Chạy Scan (${selectedProjectIds.size})`}
                </span>
              </button>
            </div>
          </div>

          {/* DYNAMIC PROGRESS STATE BLOCK */}
          {isScanning && (
            <div className="bg-surface border border-brand-border/30 rounded-2xl p-4 space-y-3 shadow-md animate-pulse-slow">
              <div className="flex items-center gap-2 text-brand">
                <Sparkles className="h-4.5 w-4.5 animate-spin" />
                <h4 className="text-xs sm:text-sm font-display font-bold">Bốp Agent Đang Làm Việc</h4>
              </div>
              <p className="text-xs text-text-2 leading-relaxed font-mono">
                {scanProgress}
              </p>
              <div className="w-full bg-surface-2 h-1.5 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full animate-progress-bar" />
              </div>
            </div>
          )}

          {/* Command Status Box (when not scanning but has message) */}
          {!isScanning && scanProgress && (
            <div className="bg-surface border border-border rounded-2xl p-4 flex gap-2.5 items-start text-xs font-mono">
              {scanProgress.startsWith('❌') ? (
                <AlertTriangle className="h-4.5 w-4.5 text-neg shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4.5 w-4.5 text-pos shrink-0 mt-0.5" />
              )}
              <div className="flex-grow min-w-0">
                <p className="text-text-2 leading-normal">{scanProgress}</p>
              </div>
              <button 
                onClick={() => setScanProgress('')}
                className="text-text-3 hover:text-text shrink-0 cursor-pointer font-bold text-sm px-1"
              >
                ×
              </button>
            </div>
          )}

        </div>

        {/* RIGHT COLUMN - Report Display (8 cols) */}
        <div className="lg:col-span-8">
          
          {/* EMPTY STATE */}
          {!activeProjectId && (
            <div className="bg-surface border border-border rounded-3xl p-12 text-center shadow-sm max-w-lg mx-auto">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-2 border border-border mx-auto text-text-3 mb-6">
                <Activity className="h-8 w-8 text-brand" />
              </div>
              <h3 className="text-lg font-display font-bold text-text mb-2">Chưa chọn dự án</h3>
              <p className="text-sm text-text-3 max-w-xs mx-auto">
                Vui lòng chọn một dự án từ danh sách theo dõi ở cột bên trái để theo dõi báo cáo scan chi tiết.
              </p>
            </div>
          )}

          {/* PROJECT SELECTED */}
          {activeProjectId && (() => {
            const project = projects.find(p => p.id === activeProjectId);
            if (!project) return null;
            
            const resolvedName = project.name === 'Dự án' 
              ? project.website.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] 
              : project.name;
            
            return (
              <div className="space-y-6">
                
                {/* PROJECT NO REPORT YET STATE */}
                {!activeReport && (
                  <div className="bg-surface border border-border rounded-3xl p-12 text-center shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-2 border border-border mx-auto text-text-3 mb-6">
                      <ShieldAlert className="h-6.5 w-6.5 text-brand" />
                    </div>
                    <h3 className="text-lg font-display font-bold text-text mb-2">
                      Dự án: {resolvedName}
                    </h3>
                    <p className="text-sm text-text-3 max-w-sm mx-auto mb-6 leading-relaxed">
                      Dự án này chưa được AI Agent Bốp quét mạng xã hội hoặc chưa có báo cáo nào được lưu trữ trong hệ thống.
                    </p>
                    <button
                      onClick={() => {
                        setSelectedProjectIds(new Set([project.id]));
                        handleStartScan();
                      }}
                      disabled={isScanning}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-soft border border-brand-border/40 px-5 py-3 text-xs font-display font-bold text-brand hover:bg-brand-soft/30 transition cursor-pointer"
                    >
                      <Activity className="h-4.5 w-4.5 animate-pulse" />
                      <span>Quét mạng xã hội ngay bây giờ</span>
                    </button>
                  </div>
                )}

                {/* DETAILED ACTIVE REPORT */}
                {activeReport && (
                  <div className="bg-surface border border-border rounded-3xl p-6 sm:p-8 space-y-8 shadow-sm">
                    
                    {/* Report Header */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border pb-5">
                      <div>
                        <div className="flex items-center gap-3">
                          <h2 className="font-display font-[800] text-xl sm:text-2xl text-text leading-tight">
                            {resolvedName}
                          </h2>
                          <a 
                            href={project.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-3 hover:text-brand p-1.5 rounded-lg bg-surface-2/40 hover:bg-surface-2/80 border border-border/30 transition"
                            title="Mở website dự án"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-3 mt-1.5 font-mono">
                          <Calendar className="h-3.5 w-3.5 text-brand/70" />
                          <span>Thời gian quét: {new Date(activeReport.scanned_at).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                    </div>

                    {/* Overall Momentum Card */}
                    {(() => {
                      const mom = getMomentumDetails(activeReport.payload.momentum);
                      return (
                        <div className={`p-5 rounded-2xl border ${mom.cls} transition-all duration-300`}>
                          <div className="flex items-center gap-2 mb-2.5">
                            <span className={`h-2.5 w-2.5 rounded-full ${mom.dotCls} animate-pulse`} />
                            <h4 className="font-display font-bold text-xs uppercase tracking-wider font-mono">Xung lực hoạt động</h4>
                          </div>
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <span className="text-lg font-display font-[800] tracking-tight">{mom.text}</span>
                            <p className="text-xs text-text-2 max-w-xl leading-relaxed">{mom.desc}</p>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Overall assessment quote (Verdict) */}
                    <div className="relative p-6 rounded-2xl bg-surface-2/20 border border-brand-border/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.01)]">
                      <div className="absolute top-0 left-6 -translate-y-1/2 bg-surface px-3.5 py-0.5 rounded-full border border-border text-[9px] font-mono uppercase tracking-wider text-brand font-bold">
                        Nhận định chung (Verdict)
                      </div>
                      <p className="text-sm sm:text-base text-text leading-relaxed font-sans italic pl-3 border-l-2 border-brand/50">
                        &ldquo;{activeReport.payload.overall_note}&rdquo;
                      </p>
                    </div>

                    {/* Channels Statistics Grid */}
                    <div className="space-y-4">
                      <h3 className="font-display font-bold text-xs text-text-3 uppercase tracking-wider font-mono flex items-center gap-2">
                        <Activity className="h-4 w-4 text-brand" />
                        Chỉ số hoạt động các kênh (7 Ngày qua)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeReport.payload.channels.map((chan, idx) => (
                          <div 
                            key={idx}
                            className="bg-surface-2/10 border border-border/40 hover:border-brand-border/30 rounded-2xl p-5 space-y-4 hover:bg-surface-2/20 hover:scale-[1.01] transition-all duration-300 shadow-sm"
                          >
                            {/* Platform header */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-3 min-w-0">
                                {getPlatformIcon(chan.platform)}
                                <span className="font-display font-bold text-base text-text truncate">
                                  {chan.platform}
                                </span>
                              </div>
                              {chan.url && (
                                <a 
                                  href={chan.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-3 hover:text-brand p-1.5 rounded-lg bg-surface-2/40 hover:bg-surface-2/80 transition border border-border/30"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>

                            {/* Metrics list */}
                            <div className="grid grid-cols-2 gap-4 border-t border-border/25 pt-4 font-mono text-xs text-text-3">
                              <div>
                                <span className="text-[10px] text-text-3/60 block uppercase tracking-wider">Followers</span>
                                <span className="text-text font-display font-bold text-base mt-0.5 block">
                                  {chan.follower_count ? chan.follower_count.toLocaleString('vi-VN') : 'N/A'}
                                </span>
                                {chan.follower_delta_7d !== null && chan.follower_delta_7d !== undefined && (
                                  <span className={`inline-flex items-center gap-0.5 text-[9px] font-semibold mt-1 px-1.5 py-0.5 rounded ${
                                    chan.follower_delta_7d >= 0 
                                      ? 'bg-pos-soft/20 text-pos border border-pos-bd/30' 
                                      : 'bg-neg-soft/20 text-neg border border-neg-bd/30'
                                  }`}>
                                    {chan.follower_delta_7d >= 0 ? `+${chan.follower_delta_7d.toLocaleString('vi-VN')}` : chan.follower_delta_7d.toLocaleString('vi-VN')} (7d)
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] text-text-3/60 block uppercase tracking-wider">Bài đăng (7 ngày)</span>
                                <span className="text-text font-display font-bold text-base mt-0.5 block">
                                  {chan.post_count_7d !== null && chan.post_count_7d !== undefined ? `${chan.post_count_7d} bài` : 'N/A'}
                                </span>
                                {chan.last_post_at && (
                                  <span className="text-[10px] text-text-3/70 block mt-1.5 truncate" title={`Bài cuối: ${new Date(chan.last_post_at).toLocaleString('vi-VN')}`}>
                                    Cuối: {new Date(chan.last_post_at).toLocaleDateString('vi-VN')}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quality evaluation */}
                            {chan.engagement_notes && (
                              <div className="border-t border-border/25 pt-3.5 text-xs text-text-2 leading-relaxed bg-surface-2/15 -mx-5 -mb-5 p-4 rounded-b-2xl">
                                <span className="text-[10px] text-text-3 font-semibold block mb-1 uppercase tracking-wider">Chất lượng &amp; Tương tác:</span>
                                {chan.engagement_notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* In-depth Activity summary */}
                    <div className="space-y-3">
                      <h3 className="font-display font-bold text-xs text-text-3 uppercase tracking-wider font-mono flex items-center gap-2">
                        <FileText className="h-4 w-4 text-brand" />
                        Tóm tắt hoạt động chi tiết
                      </h3>
                      <div className="bg-surface-2/10 border border-border/40 rounded-2xl p-6 text-sm text-text-2 leading-relaxed font-sans shadow-sm">
                        {activeReport.payload.activity_summary}
                      </div>
                    </div>

                    {/* Positive Signals and Red Flags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Positive Signals */}
                      <div className="space-y-3">
                        <h3 className="font-display font-bold text-xs text-pos uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="h-4.5 w-4.5 text-pos" />
                          Tín hiệu tích cực (Progress)
                        </h3>
                        <div className="bg-pos-soft/5 border border-pos-bd/30 rounded-2xl p-5 space-y-3 shadow-sm">
                          {activeReport.payload.progress_signals.length === 0 ? (
                            <p className="text-xs text-text-3 italic pl-1">Không ghi nhận tín hiệu hoạt động đặc biệt nổi bật.</p>
                          ) : (
                            activeReport.payload.progress_signals.map((sig, i) => (
                              <div key={i} className="flex gap-2.5 text-xs text-text-2 items-start leading-relaxed">
                                <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-pos-soft text-pos border border-pos-bd/20 mt-0.5">
                                  <Check className="h-3 w-3" />
                                </span>
                                <span>{sig}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Red Flags / Risks */}
                      <div className="space-y-3">
                        <h3 className="font-display font-bold text-xs text-neg uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <ShieldAlert className="h-4.5 w-4.5 text-neg" />
                          Cảnh báo rủi ro (Red Flags)
                        </h3>
                        <div className="bg-neg-soft/5 border border-neg-bd/30 rounded-2xl p-5 space-y-3 shadow-sm">
                          {activeReport.payload.red_flags.length === 0 ? (
                            <p className="text-xs text-text-3 italic pl-1">Không phát hiện dấu hiệu rủi ro nghiêm trọng.</p>
                          ) : (
                            activeReport.payload.red_flags.map((risk, i) => (
                              <div key={i} className="flex gap-2.5 text-xs text-text-2 items-start leading-relaxed">
                                <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-neg-soft text-neg border border-neg-bd/20 mt-0.5">
                                  <AlertTriangle className="h-3 w-3" />
                                </span>
                                <span className="text-text-2 font-medium">{risk}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                    {/* History View & Sidebar */}
                    {historyReports.length > 1 && (
                      <div className="border-t border-border pt-6 space-y-4">
                        <h4 className="font-display font-bold text-xs text-text-3 uppercase tracking-wider font-mono">
                          Lịch sử báo cáo quét khác ({historyReports.length})
                        </h4>
                        <div className="flex flex-wrap gap-2.5">
                          {historyReports.map((hist) => {
                            const isCurrent = hist.id === activeReport.id;
                            return (
                              <button
                                key={hist.id}
                                onClick={() => setActiveReport(hist)}
                                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-mono transition-all duration-200 cursor-pointer ${
                                  isCurrent
                                    ? 'bg-brand-soft text-brand border-brand-border'
                                    : 'bg-surface-2/40 text-text-2 hover:text-text hover:bg-surface-2/80 border-border/50'
                                }`}
                              >
                                <Clock className="h-3.5 w-3.5" />
                                <span>{new Date(hist.scanned_at).toLocaleDateString('vi-VN')} {new Date(hist.scanned_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                  </div>
                )}

              </div>
            );
          })()}
          
        </div>

      </div>
    </div>
  );
}
