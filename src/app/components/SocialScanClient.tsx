'use client';

import React, { useState, useEffect } from 'react';
import { Project, ScanReport, BotCommand } from '@/lib/db';
import { 
  dispatchSocialScanAction, 
  getBotCommandStatusAction, 
  getScanReportsAction, 
  getLatestScanReportsAction 
} from '@/app/actions';
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  ArrowRight, 
  Search, 
  Calendar, 
  ShieldAlert, 
  Sparkles, 
  RefreshCw, 
  Check, 
  Loader2, 
  ChevronRight, 
  ExternalLink,
  MessageSquare,
  Users,
  TrendingUp,
  FileText
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
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface/50 text-text border border-border/30">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
        </span>
      );
    }
    if (name.includes('telegram')) {
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0088cc]/10 text-[#0088cc] border border-[#0088cc]/20">
          <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.37.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
        </span>
      );
    }
    if (name.includes('discord')) {
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#5865F2]/10 text-[#5865F2] border border-[#5865F2]/20">
          <MessageSquare className="h-4 w-4" />
        </span>
      );
    }
    if (name.includes('github')) {
      return (
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#24292e]/20 text-[#fafbfc] border border-[#30363d]/40">
          <GithubIcon className="h-4 w-4" />
        </span>
      );
    }
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-text-3 border border-border">
        <Users className="h-4 w-4" />
      </span>
    );
  };

  // Momentum rating badge helper
  const getMomentumBadge = (momentum: ScanReport['payload']['momentum']) => {
    const mappings = {
      accelerating: { text: 'Bứt Phá (Accelerating)', cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
      steady: { text: 'Ổn Định (Steady)', cls: 'bg-blue-500/10 text-blue-400 border-blue-500/25' },
      slowing: { text: 'Chậm Lại (Slowing)', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
      inactive: { text: 'Tạm Ngưng (Inactive)', cls: 'bg-rose-500/10 text-rose-400 border-rose-500/25' }
    };
    const resolved = mappings[momentum] || { text: momentum, cls: 'bg-surface border-border text-text-2' };
    return (
      <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-display font-semibold ${resolved.cls}`}>
        <TrendingUp className="h-3.5 w-3.5" />
        {resolved.text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-border pb-6">
        <div>
          <h1 className="font-display font-[800] text-3xl text-text tracking-tight">
            Dự Án <span className="text-brand">Scan</span>
          </h1>
          <p className="text-sm text-text-3 mt-1">
            Giám sát xung lực, xu hướng hoạt động cộng đồng và phát hiện Red Flags của dự án thông qua AI Agent Bốp.
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
            <h3 className="font-display font-bold text-base text-text">Dự Án Theo Dõi</h3>
            
            {/* Search Input */}
            <div className="relative">
              <input
                type="text"
                placeholder="Tìm kiếm dự án..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-2 border border-border rounded-xl py-2 pl-9 pr-4 text-xs text-text placeholder-text-3 focus:outline-none focus:border-brand-border transition"
              />
              <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-text-3" />
            </div>

            {/* Batch Selection Header */}
            {filteredProjects.length > 0 && (
              <div className="flex items-center justify-between border-b border-border pb-3 pt-1 text-xs select-none">
                <label className="flex items-center gap-2 text-text-3 hover:text-text-2 cursor-pointer transition">
                  <input
                    type="checkbox"
                    checked={selectedProjectIds.size === filteredProjects.length && filteredProjects.length > 0}
                    onChange={toggleSelectAll}
                    className="rounded border-border text-brand bg-surface focus:ring-0 focus:ring-offset-0 h-3.5 w-3.5 cursor-pointer"
                  />
                  <span>Chọn tất cả ({filteredProjects.length})</span>
                </label>
                {selectedProjectIds.size > 0 && (
                  <span className="text-brand font-semibold">Đã chọn {selectedProjectIds.size}</span>
                )}
              </div>
            )}

            {/* Scrollable Project List */}
            <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1 custom-scrollbar">
              {filteredProjects.length === 0 ? (
                <div className="text-center py-8 text-xs text-text-3">
                  Không tìm thấy dự án nào.
                </div>
              ) : (
                filteredProjects.map((p) => {
                  const isSelected = selectedProjectIds.has(p.id);
                  const isActive = activeProjectId === p.id;
                  const report = latestReports[p.id];
                  
                  return (
                    <div 
                      key={p.id}
                      className={`flex items-center justify-between p-2.5 rounded-xl border transition-all ${
                        isActive 
                          ? 'bg-brand-soft/20 border-brand-border/30 text-text' 
                          : 'bg-surface-2/30 border-border/50 hover:bg-surface-2/70 text-text-2'
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
                          <h4 className="text-xs sm:text-sm font-display font-semibold truncate hover:text-brand transition">
                            {p.name}
                          </h4>
                          <p className="text-[10px] text-text-3 truncate mt-0.5 font-mono">
                            {p.website.replace(/^https?:\/\//i, '')}
                          </p>
                        </div>
                      </div>

                      {/* Info & Navigation */}
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
                          <span className="text-[9px] text-text-3 border border-border/50 px-1 py-0.5 rounded font-mono">N/A</span>
                        )}
                        <button
                          onClick={() => setActiveProjectId(p.id)}
                          className="text-text-3 hover:text-brand transition p-1 cursor-pointer"
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
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] font-display font-semibold text-sm py-3 px-4 transition duration-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isScanning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Activity className="h-4 w-4" />
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
              <div className="w-full bg-surface-2 h-1 rounded-full overflow-hidden">
                <div className="h-full bg-brand rounded-full animate-progress-bar" />
              </div>
            </div>
          )}

          {/* Command Status Box (when not scanning but has message) */}
          {!isScanning && scanProgress && (
            <div className="bg-surface border border-border rounded-2xl p-4 flex gap-2 items-start text-xs font-mono">
              {scanProgress.startsWith('❌') ? (
                <AlertTriangle className="h-4 w-4 text-neg shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-pos shrink-0 mt-0.5" />
              )}
              <div className="flex-grow min-w-0">
                <p className="text-text-2 leading-normal">{scanProgress}</p>
              </div>
              <button 
                onClick={() => setScanProgress('')}
                className="text-text-3 hover:text-text shrink-0 cursor-pointer"
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
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 border border-border mx-auto text-text-3 mb-6">
                <Activity className="h-8 w-8" />
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
            
            return (
              <div className="space-y-6">
                
                {/* PROJECT NO REPORT YET STATE */}
                {!activeReport && (
                  <div className="bg-surface border border-border rounded-3xl p-12 text-center shadow-sm">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-2 border border-border mx-auto text-text-3 mb-6">
                      <ShieldAlert className="h-6.5 w-6.5" />
                    </div>
                    <h3 className="text-lg font-display font-bold text-text mb-2">
                      Dự án: {project.name}
                    </h3>
                    <p className="text-sm text-text-3 max-w-sm mx-auto mb-6">
                      Dự án này chưa được AI Agent Bốp scan mạng xã hội hoặc chưa có báo cáo nào được lưu trữ.
                    </p>
                    <button
                      onClick={() => {
                        setSelectedProjectIds(new Set([project.id]));
                        handleStartScan();
                      }}
                      disabled={isScanning}
                      className="inline-flex items-center gap-2 rounded-xl bg-brand-soft border border-brand-border px-5 py-2.5 text-xs font-display font-semibold text-brand hover:bg-brand-soft/40 transition cursor-pointer"
                    >
                      <Activity className="h-4 w-4 animate-pulse" />
                      <span>Scan mạng xã hội ngay bây giờ</span>
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
                          <h2 className="font-display font-[800] text-xl sm:text-2xl text-text">
                            {project.name}
                          </h2>
                          <a 
                            href={project.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-text-3 hover:text-brand transition"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-text-3 mt-1 font-mono">
                          <Calendar className="h-3.5 w-3.5" />
                          <span>Thời gian quét: {new Date(activeReport.scanned_at).toLocaleString('vi-VN')}</span>
                        </div>
                      </div>
                      
                      <div className="shrink-0">
                        {getMomentumBadge(activeReport.payload.momentum)}
                      </div>
                    </div>

                    {/* Overall assessment quote */}
                    <div className="relative p-5 rounded-2xl bg-brand-soft/5 border border-brand-border/20">
                      <div className="absolute top-0 left-4 -translate-y-1/2 bg-surface px-3 py-0.5 rounded-full border border-border text-[9px] font-mono uppercase tracking-wider text-brand">
                        Đánh giá chung (Verdict)
                      </div>
                      <p className="text-sm text-text leading-relaxed font-medium italic">
                        &ldquo;{activeReport.payload.overall_note}&rdquo;
                      </p>
                    </div>

                    {/* Channels Statistics Grid */}
                    <div className="space-y-4">
                      <h3 className="font-display font-bold text-sm text-text-3 uppercase tracking-wider font-mono">
                        Chỉ số hoạt động các kênh (7 Ngày qua)
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {activeReport.payload.channels.map((chan, idx) => (
                          <div 
                            key={idx}
                            className="bg-surface-2/30 border border-border/50 rounded-xl p-4 space-y-3 hover:bg-surface-2/50 transition duration-200"
                          >
                            {/* Platform header */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {getPlatformIcon(chan.platform)}
                                <span className="font-display font-bold text-sm text-text truncate">
                                  {chan.platform}
                                </span>
                              </div>
                              {chan.url && (
                                <a 
                                  href={chan.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-text-3 hover:text-brand p-1 cursor-pointer"
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                              )}
                            </div>

                            {/* Metrics list */}
                            <div className="grid grid-cols-2 gap-3 border-t border-border/40 pt-2.5 font-mono text-xs text-text-3">
                              <div>
                                <span className="text-[10px] text-text-3/60 block uppercase">Followers</span>
                                <span className="text-text font-bold text-sm">
                                  {chan.follower_count ? chan.follower_count.toLocaleString() : 'N/A'}
                                </span>
                                {chan.follower_delta_7d !== null && chan.follower_delta_7d !== undefined && (
                                  <span className={`text-[10px] block mt-0.5 ${chan.follower_delta_7d >= 0 ? 'text-pos' : 'text-neg'}`}>
                                    {chan.follower_delta_7d >= 0 ? `+${chan.follower_delta_7d}` : chan.follower_delta_7d} (7d)
                                  </span>
                                )}
                              </div>
                              <div>
                                <span className="text-[10px] text-text-3/60 block uppercase">Số Bài đăng (7d)</span>
                                <span className="text-text font-bold text-sm">
                                  {chan.post_count_7d ?? 'N/A'} posts
                                </span>
                                {chan.last_post_at && (
                                  <span className="text-[9px] block mt-1 truncate" title={`Bài cuối: ${new Date(chan.last_post_at).toLocaleString()}`}>
                                    Cuối: {new Date(chan.last_post_at).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quality evaluation */}
                            {chan.engagement_notes && (
                              <div className="border-t border-border/40 pt-2 text-xs text-text-2 leading-relaxed">
                                <span className="text-[10px] text-text-3 font-semibold block mb-0.5">Tương tác &amp; Nội dung:</span>
                                {chan.engagement_notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* In-depth Activity summary */}
                    <div className="space-y-3">
                      <h3 className="font-display font-bold text-sm text-text-3 uppercase tracking-wider font-mono">
                        Tóm tắt hoạt động chi tiết
                      </h3>
                      <div className="bg-surface-2/10 border border-border/40 rounded-2xl p-5 text-sm text-text-2 leading-relaxed font-sans">
                        {activeReport.payload.activity_summary}
                      </div>
                    </div>

                    {/* Positive Signals and Red Flags */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Positive Signals */}
                      <div className="space-y-3">
                        <h3 className="font-display font-bold text-sm text-pos uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <CheckCircle2 className="h-4 w-4 text-pos" />
                          Tín hiệu tích cực (Progress)
                        </h3>
                        <div className="bg-surface-2/15 border border-pos-bd/30 rounded-2xl p-4 space-y-2">
                          {activeReport.payload.progress_signals.length === 0 ? (
                            <p className="text-xs text-text-3 italic">Không có tín hiệu nổi bật.</p>
                          ) : (
                            activeReport.payload.progress_signals.map((sig, i) => (
                              <div key={i} className="flex gap-2 text-xs text-text-2 items-start leading-normal">
                                <Check className="h-4 w-4 text-pos shrink-0 mt-0.5" />
                                <span>{sig}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Red Flags / Risks */}
                      <div className="space-y-3">
                        <h3 className="font-display font-bold text-sm text-neg uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <ShieldAlert className="h-4 w-4 text-neg animate-pulse" />
                          Cảnh báo rủi ro (Red Flags)
                        </h3>
                        <div className="bg-surface-2/15 border border-neg-bd/30 rounded-2xl p-4 space-y-2">
                          {activeReport.payload.red_flags.length === 0 ? (
                            <p className="text-xs text-text-3 italic">Không phát hiện rủi ro nghiêm trọng.</p>
                          ) : (
                            activeReport.payload.red_flags.map((risk, i) => (
                              <div key={i} className="flex gap-2 text-xs text-text-2 items-start leading-normal">
                                <AlertTriangle className="h-4 w-4 text-neg shrink-0 mt-0.5 animate-shake" />
                                <span className="text-text-2 font-medium">{risk}</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                    </div>

                    {/* History View & Sidebar */}
                    {historyReports.length > 1 && (
                      <div className="border-t border-border pt-6 space-y-3">
                        <h4 className="font-display font-bold text-xs text-text-3 uppercase tracking-wider font-mono">
                          Lịch sử báo cáo quét khác ({historyReports.length})
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {historyReports.map((hist) => {
                            const isCurrent = hist.id === activeReport.id;
                            return (
                              <button
                                key={hist.id}
                                onClick={() => setActiveReport(hist)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition cursor-pointer ${
                                  isCurrent
                                    ? 'bg-brand-soft text-brand border-brand-border'
                                    : 'bg-surface-2 text-text-2 hover:text-text hover:bg-surface-2/80 border-border/50'
                                }`}
                              >
                                <FileText className="h-3.5 w-3.5" />
                                <span>{new Date(hist.scanned_at).toLocaleDateString()}</span>
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

// Inline mini components to prevent import breakages
function GithubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.34-3.369-1.34-.454-1.156-1.11-1.464-1.11-1.464-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.646.35-1.086.636-1.336-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.203 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.577.688.479C19.138 20.162 22 16.418 22 12c0-5.523-4.477-10-10-10z" />
    </svg>
  );
}
