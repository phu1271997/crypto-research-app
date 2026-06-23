'use client';

import { useState, useEffect } from 'react';
import {
  getBotStatusAction,
  sendBotCommandAction,
  getDraftArticlesAction,
  getDraftArticleByIdAction,
  updateDraftArticleAction,
  getBotCommandsAction,
  getRecentArticlesAction
} from '@/app/actions/admin';
import {
  BotStatus,
  BotCommand,
  DraftArticle,
  RecentArticle
} from '@/lib/db';
import {
  Terminal,
  Activity,
  Cpu,
  FileText,
  RefreshCw,
  Send,
  Loader2,
  Check,
  AlertCircle,
  Plus,
  Trash2,
  Save,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Sparkles,
  ExternalLink,
  Settings
} from 'lucide-react';

// ──────────────────────────────────────────
// Model Constants
// ──────────────────────────────────────────
const ARTICLE_MODELS = [
  { id: 'openai/gpt-5.5', name: 'OpenAI GPT-5.5', cost: '$5.00 / $15.00' },
  { id: 'google/gemini-3.5-flash:online', name: 'Gemini 3.5 Flash Online', cost: '$0.075 / $0.30' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', cost: '$0.435 / $0.87' },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', cost: '$0.10 / $0.20' },
  { id: 'tencent/hunyuan-3-preview', name: 'Tencent Hunyuan 3 Preview', cost: '$0.50 / $1.00' },
  { id: 'openai/gpt-5.4', name: 'OpenAI GPT-5.4', cost: '$2.50 / $7.50' },
  { id: 'openai/gpt-5-mini', name: 'OpenAI GPT-5 Mini', cost: '$0.15 / $0.60' },
  { id: 'anthropic/claude-opus-4.6', name: 'Claude Opus 4.6', cost: '$15.00 / $75.00' },
  { id: 'qwen/qwen-3.6-plus', name: 'Qwen 3.6 Plus', cost: '$1.00 / $3.00' },
  { id: 'qwen/qwen-3.7-max', name: 'Qwen 3.7 Max', cost: '$2.50 / $7.50' },
];

const IMAGE_MODELS = [
  { id: 'openai/gpt-5.4-image-2', name: 'OpenAI GPT-5.4 Image 2', note: 'Model tạo ảnh mặc định' },
  { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash', note: 'Nhanh, rẻ, ảnh tốt' },
  { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', note: 'Chất lượng cao hơn' },
  { id: 'openai/gpt-image-1', name: 'GPT Image 1', note: 'DALL-E chất lượng cao' },
  { id: 'black-forest-labs/flux-1.1-pro', name: 'Flux 1.1 Pro', note: 'Chuyên tạo ảnh, sắc nét' },
];

// ──────────────────────────────────────────
// Admin Dashboard Component
// ──────────────────────────────────────────
export default function AdminPage() {
  // Core data states
  const [status, setStatus] = useState<BotStatus | null>(null);
  const [commands, setCommands] = useState<BotCommand[]>([]);
  const [drafts, setDrafts] = useState<DraftArticle[]>([]);
  const [recentArticles, setRecentArticles] = useState<RecentArticle[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const [selectedDraft, setSelectedDraft] = useState<DraftArticle | null>(null);

  // Quick generate input
  const [newTopic, setNewTopic] = useState('');

  // Editor states
  const [editTitle, setEditTitle] = useState('');
  const [editArticleMd, setEditArticleMd] = useState('');
  const [editTweets, setEditTweets] = useState<string[]>([]);

  // Publish config states (shared: set in Generate panel, loaded from draft in Editor)
  const [targetPlatform, setTargetPlatform] = useState<'primus' | 'azdag'>('primus');
  const [publishMode, setPublishMode] = useState<'both' | 'web_only' | 'x_only'>('both');
  const [xFormat, setXFormat] = useState<'thread' | 'article'>('thread');

  // AI model selection
  const [selectedArticleModel, setSelectedArticleModel] = useState(ARTICLE_MODELS[0].id);
  const [selectedImageModel, setSelectedImageModel] = useState(IMAGE_MODELS[0].id);
  const [modelsSynced, setModelsSynced] = useState(false);

  // UI States
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(true);

  // ── Effects ──

  // Auto-dismiss notifications
  useEffect(() => {
    if (successMsg) {
      const timer = setTimeout(() => setSuccessMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMsg]);
  useEffect(() => {
    if (errorMsg) {
      const timer = setTimeout(() => setErrorMsg(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [errorMsg]);

  // Poll dashboard data
  useEffect(() => {
    async function fetchData() {
      try {
        const [stat, cmdList, draftList, recentList] = await Promise.all([
          getBotStatusAction(),
          getBotCommandsAction(8),
          getDraftArticlesAction(),
          getRecentArticlesAction(8),
        ]);
        setStatus(stat);
        setCommands(cmdList);
        setDrafts(draftList);
        setRecentArticles(recentList);
      } catch (err) {
        console.error('Failed to poll dashboard data:', err);
      }
    }

    fetchData();
    if (!isPolling) return;

    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [isPolling]);

  // Load draft details into editor
  useEffect(() => {
    if (!selectedDraftId) {
      setSelectedDraft(null);
      return;
    }
    async function loadDraft() {
      const id = selectedDraftId;
      if (!id) return;
      const draft = await getDraftArticleByIdAction(id);
      if (draft) {
        setSelectedDraft(draft);
        setEditTitle(draft.payload.title || '');
        setEditArticleMd(draft.payload.article_md || '');
        setEditTweets(draft.payload.tweets || []);
        // Load metadata configs
        const meta = draft.payload.meta || {};
        setTargetPlatform(meta.target_platform || 'primus');
        setPublishMode(meta.publish_mode || 'both');
        setXFormat(meta.x_format || 'thread');
      }
    }
    loadDraft();
  }, [selectedDraftId]);

  // Sync model selection from bot_status config (one-time)
  useEffect(() => {
    if (status?.config && !modelsSynced) {
      if (status.config.model_article) {
        const found = ARTICLE_MODELS.find(m => m.id === status.config.model_article);
        if (found) setSelectedArticleModel(found.id);
      }
      if (status.config.model_image) {
        const found = IMAGE_MODELS.find(m => m.id === status.config.model_image);
        if (found) setSelectedImageModel(found.id);
      }
      setModelsSynced(true);
    }
  }, [status, modelsSynced]);

  // ── Computed ──
  const isOnline = status
    ? (new Date().getTime() - new Date(status.last_seen).getTime()) < 30000
    : false;
  const isAnyLoading = loadingAction !== null;

  // ── Handlers ──

  const handleQueueCommand = async (type: BotCommand['type'], payload: any = {}, actionKey: string) => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingAction(actionKey);
    try {
      const res = await sendBotCommandAction(type, payload);
      if (res.success) {
        setSuccessMsg(`Đã tạo lệnh ${type} thành công! ID: ${res.data.id}`);
        const cmdList = await getBotCommandsAction(8);
        setCommands(cmdList);
        if (type === 'GENERATE') setNewTopic('');
      } else {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Đã xảy ra lỗi.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSaveDraft = async (publishAfterSave = false) => {
    if (!selectedDraft) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingAction(publishAfterSave ? 'publish' : 'save');

    const updatedPayload = {
      ...selectedDraft.payload,
      title: editTitle,
      article_md: editArticleMd,
      tweets: editTweets,
      meta: {
        ...(selectedDraft.payload.meta || {}),
        target_platform: targetPlatform,
        publish_mode: publishMode,
        x_format: xFormat,
      },
    };

    try {
      const res = await updateDraftArticleAction(selectedDraft.id, {
        payload: updatedPayload,
        status: publishAfterSave ? 'approved' : 'editing',
      });

      if (res.success) {
        setSelectedDraft(res.data);
        const draftList = await getDraftArticlesAction();
        setDrafts(draftList);

        if (publishAfterSave) {
          const pubRes = await sendBotCommandAction('PUBLISH', {
            draft_id: selectedDraft.id,
            version: res.data.version,
          });
          if (pubRes.success) {
            setSuccessMsg('Đã lưu và gửi yêu cầu PUBLISH lên VPS thành công!');
          } else {
            setErrorMsg(pubRes.error);
          }
        } else {
          setSuccessMsg('Đã lưu nháp thành công!');
        }
      } else {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu nháp.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleUpdateConfig = async () => {
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoadingAction('update_config');
    try {
      const res = await sendBotCommandAction('UPDATE_CONFIG', {
        model_article: selectedArticleModel,
        model_image: selectedImageModel,
      });
      if (res.success) {
        setSuccessMsg('Đã gửi yêu cầu cập nhật cấu hình model thành công!');
        const cmdList = await getBotCommandsAction(8);
        setCommands(cmdList);
      } else {
        setErrorMsg(res.error);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi cập nhật cấu hình.');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTweetChange = (index: number, text: string) => {
    const nextTweets = [...editTweets];
    nextTweets[index] = text;
    setEditTweets(nextTweets);
  };
  const handleAddTweet = () => setEditTweets([...editTweets, '']);
  const handleRemoveTweet = (index: number) => setEditTweets(editTweets.filter((_, i) => i !== index));

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}d ${h}h ${m}m`;
  };

  // ── Segmented Control Helper ──
  const SegmentedControl = ({ options, value, onChange }: { options: { label: string; value: string }[]; value: string; onChange: (v: any) => void }) => (
    <div className="flex rounded-lg bg-surface-2 p-0.5 border border-border">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-1.5 rounded-md text-[11px] font-display font-semibold transition-all duration-200 whitespace-nowrap ${
            value === opt.value
              ? 'bg-brand-soft text-brand border border-brand-border/30 shadow-sm'
              : 'text-text-3 hover:text-text border border-transparent'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  // ════════════════════════════════════════
  // JSX
  // ════════════════════════════════════════
  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* ─── Header ─── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h1 className="text-3xl font-display font-[800] tracking-tight text-text flex items-center gap-3">
            <Terminal className="text-brand h-8 w-8" />
            Social Bot <span className="text-brand font-medium">Manager</span>
          </h1>
          <p className="mt-1 text-text-3 text-sm">
            Quản trị trạng thái và phát hành bài viết lên WordPress + X (Twitter) từ xa.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Trending Button */}
          <button
            onClick={() => handleQueueCommand('TRENDING', {}, 'trending')}
            disabled={isAnyLoading}
            className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 text-[#052e2a] shadow transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none"
          >
            {loadingAction === 'trending' ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang quét...</>
            ) : (
              <><Sparkles className="h-3.5 w-3.5 text-[#052e2a] animate-pulse" /> Quét Tin Hot (Trending)</>
            )}
          </button>

          {/* Polling Toggle */}
          <button
            onClick={() => setIsPolling(!isPolling)}
            className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold border transition-all duration-200 ${
              isPolling
                ? 'bg-brand-soft text-brand border-brand-border'
                : 'bg-surface-2 text-text-2 border-border hover:bg-surface-hover hover:text-text'
            }`}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isPolling ? 'animate-spin' : ''}`} />
            {isPolling ? 'Tự Động Cập Nhật' : 'Dừng Cập Nhật'}
          </button>

          {/* Online badge */}
          <div className={`flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border ${
            isOnline
              ? 'bg-pos-soft text-pos border-pos-bd shadow-sm'
              : 'bg-neg-soft text-neg border-neg-bd'
          }`}>
            <span className={`h-2 w-2 rounded-full ${isOnline ? 'bg-pos animate-pulse' : 'bg-neg'}`} />
            {isOnline ? 'VPS Bot Online' : 'VPS Bot Offline'}
          </div>
        </div>
      </div>

      {/* ─── Notifications ─── */}
      {errorMsg && (
        <div className="flex items-start gap-3 rounded-xl bg-neg-soft border border-neg-bd p-4 text-sm text-neg animate-in slide-in-from-top-2 duration-300">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-grow">
            <p className="font-medium">Lỗi xảy ra</p>
            <p className="text-neg/90">{errorMsg}</p>
          </div>
        </div>
      )}
      {successMsg && (
        <div className="flex items-start gap-3 rounded-xl bg-pos-soft border border-pos-bd p-4 text-sm text-pos animate-in slide-in-from-top-2 duration-300">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <div className="flex-grow">
            <p className="font-medium">Thành công</p>
            <p className="text-pos/90">{successMsg}</p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          TOP DASHBOARD GRID (3 cols)
          ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* ──── Status Panel + Model Config (4 cols) ──── */}
        <div className="lg:col-span-4 rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-display font-bold text-text flex items-center gap-2">
            <Activity className="text-brand h-5 w-5" /> Trạng Thái Hoạt Động
          </h2>

          <div className="divide-y divide-border text-sm space-y-3 pt-2">
            <div className="flex justify-between py-1">
              <span className="text-text-3">Trạng thái:</span>
              <span className="font-semibold text-text capitalize font-mono">{status?.status || 'Không rõ'}</span>
            </div>
            <div className="flex justify-between py-1 pt-2">
              <span className="text-text-3">Uptime:</span>
              <span className="font-semibold text-text-2">{status ? formatUptime(status.uptime) : 'N/A'}</span>
            </div>
            <div className="flex justify-between py-1 pt-2">
              <span className="text-text-3">Cập nhật lúc:</span>
              <span className="font-semibold text-text-2">{status ? new Date(status.last_seen).toLocaleTimeString() : 'N/A'}</span>
            </div>
          </div>

          {/* ── Model Configuration ── */}
          <div className="pt-4 border-t border-border space-y-3">
            <h3 className="text-xs font-display font-semibold text-text-3 uppercase tracking-wider flex items-center gap-1.5">
              <Settings className="h-3.5 w-3.5 text-brand" /> Cấu Hình Model AI
            </h3>

            <div className="space-y-2.5">
              <div>
                <label className="block text-[10px] font-medium text-text-3 uppercase mb-1">Model viết bài</label>
                <select
                  value={selectedArticleModel}
                  onChange={(e) => setSelectedArticleModel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text focus:border-brand focus:outline-none transition cursor-pointer font-mono"
                >
                  {ARTICLE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {m.cost}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-medium text-text-3 uppercase mb-1">Model tạo ảnh</label>
                <select
                  value={selectedImageModel}
                  onChange={(e) => setSelectedImageModel(e.target.value)}
                  className="w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-xs text-text focus:border-brand focus:outline-none transition cursor-pointer font-mono"
                >
                  {IMAGE_MODELS.map(m => (
                    <option key={m.id} value={m.id}>{m.name} — {m.note}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleUpdateConfig}
                disabled={isAnyLoading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-surface-2 border border-border px-2.5 py-1.5 text-xs font-display font-semibold text-text-2 hover:bg-surface-hover hover:text-text transition disabled:bg-surface-2 disabled:text-text-3 disabled:border-transparent disabled:cursor-not-allowed"
              >
                {loadingAction === 'update_config' ? (
                  <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang cập nhật...</>
                ) : (
                  <><Settings className="h-3.5 w-3.5" /> Cập Nhật Cấu Hình</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ──── Generate Panel + Config Options (5 cols) ──── */}
        <div className="lg:col-span-5 rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-display font-bold text-text flex items-center gap-2">
            <Cpu className="text-copper h-5 w-5" /> Yêu Cầu Viết Bài Mới
          </h2>

          <div className="space-y-4 pt-1">
            {/* Topic input */}
            <div>
              <label className="block text-xs font-semibold text-text-3 uppercase mb-1.5">Chủ đề bài viết</label>
              <textarea
                rows={2}
                value={newTopic}
                onChange={(e) => setNewTopic(e.target.value)}
                placeholder="Nhập chủ đề crypto cần phân tích và viết..."
                className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text placeholder-text-3 focus:border-brand focus:bg-surface-hover focus:outline-none transition resize-none leading-relaxed"
              />
            </div>

            {/* Config options - segmented controls */}
            <div className="bg-surface-2/40 border border-border rounded-xl p-3.5 space-y-3">
              <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Tùy chọn xuất bản</span>

              <div className="flex flex-col gap-2.5">
                {/* Platform */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 sm:border-0 pb-2 sm:pb-0">
                  <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Nền tảng</label>
                  <div className="w-full sm:w-56">
                    <SegmentedControl
                      options={[
                        { label: 'Primus Spark', value: 'primus' },
                        { label: 'AZDAG', value: 'azdag' },
                      ]}
                      value={targetPlatform}
                      onChange={setTargetPlatform}
                    />
                  </div>
                </div>

                {/* Mode */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 sm:border-0 pb-2 sm:pb-0">
                  <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Phương thức</label>
                  <div className="w-full sm:w-64">
                    <SegmentedControl
                      options={[
                        { label: 'Web & X', value: 'both' },
                        { label: 'Chỉ Web', value: 'web_only' },
                        { label: 'Chỉ X', value: 'x_only' },
                      ]}
                      value={publishMode}
                      onChange={setPublishMode}
                    />
                  </div>
                </div>

                {/* X Format */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Định dạng X</label>
                  <div className="w-full sm:w-56">
                    <SegmentedControl
                      options={[
                        { label: 'Thread', value: 'thread' },
                        { label: 'X Article', value: 'article' },
                      ]}
                      value={xFormat}
                      onChange={setXFormat}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Generate button */}
            <button
              onClick={() => handleQueueCommand('GENERATE', {
                topic: newTopic,
                meta: { target_platform: targetPlatform, publish_mode: publishMode, x_format: xFormat },
              }, 'generate')}
              disabled={isAnyLoading || !newTopic.trim()}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-4 py-2 text-xs font-display font-semibold text-[#052e2a] hover:shadow-md transition duration-200 disabled:bg-surface-2 disabled:text-text-3 disabled:cursor-not-allowed disabled:brightness-100 disabled:shadow-none"
            >
              {loadingAction === 'generate' ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Đang tạo bài viết...</>
              ) : (
                <><Send className="h-4 w-4" /> Gửi Lệnh GENERATE</>
              )}
            </button>
          </div>
        </div>

        {/* ──── Command Queue (3 cols) ──── */}
        <div className="lg:col-span-3 rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-display font-bold text-text flex items-center gap-2">
            <Terminal className="text-brand h-5 w-5" /> Hàng Đợi Lệnh
          </h2>

          <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
            {commands.length === 0 ? (
              <p className="text-text-3 text-sm py-4 text-center">Chưa có lệnh nào.</p>
            ) : (
              commands.map((cmd) => (
                <div key={cmd.id} className="flex items-center justify-between border-b border-border pb-2 text-xs">
                  <div className="space-y-0.5">
                    <span className="font-semibold text-brand font-mono">#{cmd.id}</span>
                    <span className="bg-surface-2 px-1.5 py-0.5 rounded ml-2 font-mono text-[10px] text-text-2">{cmd.type}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                      cmd.status === 'done'
                        ? 'bg-pos-soft text-pos border border-pos-bd'
                        : cmd.status === 'failed'
                        ? 'bg-neg-soft text-neg border border-neg-bd'
                        : cmd.status === 'processing'
                        ? 'bg-warn-soft text-warn border border-warn-bd animate-pulse-slow'
                        : 'bg-surface-2 text-text-3 border border-border'
                    }`}>
                      {cmd.status === 'processing' && <Loader2 className="h-2.5 w-2.5 animate-spin inline mr-1" />}
                      {cmd.status}
                    </span>
                    <span className="text-text-3 text-[10px]">
                      {new Date(cmd.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════
          SUGGESTED TOPICS GRID
          ═══════════════════════════════════ */}
      {status?.config?.trending_topics && (
        <div className="rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-border pb-4">
            <div>
              <h2 className="text-lg font-display font-bold text-text flex items-center gap-2">
                <Sparkles className="text-brand h-5 w-5 animate-pulse" />
                Chủ Đề Nổi Bật Được AI Gợi Ý (Trending Topics)
              </h2>
              <p className="mt-1 text-text-3 text-xs">
                Tổng hợp từ RSS, CryptoPanic và Coin68. Nhấp vào chủ đề để tự động điền vào ô viết bài bên trên.
              </p>
            </div>
            <div className="text-[10px] text-text-3 font-medium md:text-right">
              Cập nhật lúc: {status ? new Date(status.last_seen).toLocaleTimeString() : 'N/A'}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {status.config.trending_topics.map((t: any, idx: number) => (
              <button
                key={idx}
                onClick={() => {
                  setNewTopic(t.title);
                  const element = document.querySelector('input[placeholder*="Nhập chủ đề crypto"]');
                  if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    (element as HTMLInputElement).focus();
                  }
                }}
                className="group text-left p-4 rounded-xl border border-border bg-surface-2/50 hover:bg-surface-hover hover:border-border-strong transition-all duration-300 flex flex-col justify-between gap-3 shadow-sm"
              >
                <div className="space-y-2">
                  <div className="flex items-start gap-2.5">
                    <span className="flex items-center justify-center shrink-0 w-5 h-5 rounded bg-brand-soft text-brand font-mono text-xs font-bold mt-0.5 group-hover:bg-brand group-hover:text-[#052e2a] transition-colors duration-300">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-sm text-text group-hover:text-brand leading-snug transition-colors duration-200 line-clamp-2">
                      {t.title}
                    </span>
                  </div>
                  {t.reason && (
                    <p className="text-xs text-text-2 leading-relaxed pl-7 line-clamp-2">
                      {t.reason}
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] pl-7 text-text-3">
                  <span className="bg-surface-2 px-2 py-0.5 rounded font-medium font-mono text-[9px] uppercase tracking-wider text-text-3 group-hover:bg-brand-soft group-hover:text-brand transition-all duration-300">
                    {t.source || 'Tin tức'}
                  </span>
                  <span className="opacity-0 group-hover:opacity-100 text-brand font-semibold transition-opacity duration-300 flex items-center gap-0.5">
                    Chọn chủ đề <ArrowUpRight className="h-3 w-3" />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════
          MAIN PANEL: Drafts + Editor
          ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

        {/* ──── Left: Draft Articles List (4 cols) ──── */}
        <div className="lg:col-span-4 rounded-2xl border border-border bg-surface p-6 space-y-4 shadow-sm">
          <h2 className="text-lg font-display font-bold text-text flex items-center gap-2">
            <FileText className="text-copper h-5 w-5" /> Danh Sách Nháp Chờ Duyệt ({drafts.length})
          </h2>

          <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
            {drafts.length === 0 ? (
              <p className="text-text-3 text-sm py-8 text-center">Chưa có bài viết nháp nào.</p>
            ) : (
              drafts.map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => setSelectedDraftId(draft.id)}
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedDraftId === draft.id
                      ? 'bg-brand-soft border-brand-border'
                      : 'border-border bg-surface-2/60 hover:border-border-strong hover:bg-surface-hover'
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wider ${
                      draft.status === 'published'
                        ? 'bg-pos-soft text-pos border border-pos-bd'
                        : draft.status === 'publishing'
                        ? 'bg-warn-soft text-warn border border-warn-bd animate-pulse-slow'
                        : draft.status === 'approved'
                        ? 'bg-brand-soft text-brand border border-brand-border'
                        : draft.status === 'failed'
                        ? 'bg-neg-soft text-neg border border-neg-bd'
                        : 'bg-surface-2 text-text-2 border border-border'
                    }`}>
                      {draft.status}
                    </span>
                    <span className="text-[10px] text-text-3 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(draft.updated_at).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}
                    </span>
                  </div>
                  <h3 className="mt-2 text-sm font-bold text-text line-clamp-2">
                    {draft.payload?.title || draft.topic}
                  </h3>
                  <p className="mt-1 text-xs text-text-2 line-clamp-1">Chủ đề: {draft.topic}</p>
                  <div className="mt-2 flex justify-between items-center text-[10px] text-text-3">
                    <span>Phiên bản: v{draft.version}</span>
                    <span>{draft.payload?.tweets?.length || 0} Tweets</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* ──── Right: Interactive Editor (8 cols) ──── */}
        <div className="lg:col-span-8 rounded-2xl border border-border bg-surface p-6 shadow-sm">

          {!selectedDraft ? (
            /* Empty state */
            <div className="h-full flex flex-col justify-center items-center py-20 text-center space-y-4">
              <Sparkles className="h-12 w-12 text-text-3 animate-pulse" />
              <div>
                <h3 className="text-base font-display font-semibold text-text">Chưa Chọn Bài Viết</h3>
                <p className="mt-1 text-sm text-text-2 max-w-sm">
                  Chọn một bài viết nháp ở danh sách bên trái để mở giao diện biên tập chi tiết và duyệt phát hành bài viết.
                </p>
              </div>

              {/* Recent articles archive */}
              <div className="w-full max-w-md pt-8 text-left space-y-3">
                <h4 className="text-xs font-semibold text-text-3 uppercase tracking-wider flex items-center gap-2">
                  <ArrowUpRight className="h-4 w-4 text-brand" /> Nhật ký phát hành gần đây:
                </h4>
                <div className="bg-surface-2 rounded-xl border border-border p-3 space-y-2">
                  {recentArticles.length === 0 ? (
                    <div className="text-text-3 text-xs py-2 text-center">Chưa có lịch sử xuất bản.</div>
                  ) : (
                    recentArticles.map(art => (
                      <div key={art.id} className="text-xs flex items-center justify-between border-b border-border pb-2 last:border-0 last:pb-0">
                        <span className="font-semibold text-text-2 truncate max-w-[200px] font-display">{art.title}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          {art.primus_url && (
                            <a href={art.primus_url} target="_blank" rel="noreferrer" className="text-brand hover:text-brand-2 flex items-center gap-0.5">
                              WP <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {art.x1_url && (
                            <a href={art.x1_url} target="_blank" rel="noreferrer" className="text-copper hover:underline flex items-center gap-0.5">
                              X1 <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                          {art.x2_url && (
                            <a href={art.x2_url} target="_blank" rel="noreferrer" className="text-copper hover:underline flex items-center gap-0.5">
                              X2 <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ──── Active Editor ──── */
            <div className="space-y-6">

              {/* Editor header */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-4">
                <div>
                  <h3 className="text-lg font-display font-bold text-text">Biên Tập & Kiểm Duyệt</h3>
                  <p className="text-xs text-text-3 truncate max-w-[400px]">
                    ID: {selectedDraft.id} | Phiên bản: v{selectedDraft.version}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* Save button */}
                  <button
                    onClick={() => handleSaveDraft(false)}
                    disabled={isAnyLoading}
                    className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs font-display font-semibold text-text-2 hover:bg-surface-hover hover:text-text transition disabled:bg-surface-2 disabled:text-text-3 disabled:border-transparent disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'save' ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang lưu...</>
                    ) : (
                      <><Save className="h-3.5 w-3.5" /> Lưu Nháp</>
                    )}
                  </button>

                  {/* Publish button */}
                  <button
                    onClick={() => handleSaveDraft(true)}
                    disabled={isAnyLoading || selectedDraft.status === 'publishing' || selectedDraft.status === 'published'}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-2 to-brand hover:brightness-110 px-3 py-1.5 text-xs font-display font-semibold text-[#052e2a] hover:shadow-sm transition disabled:bg-surface-2 disabled:text-text-3 disabled:cursor-not-allowed disabled:brightness-100 disabled:shadow-none"
                  >
                    {loadingAction === 'publish' ? (
                      <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Đang đăng bài...</>
                    ) : (
                      <><Check className="h-3.5 w-3.5" /> Duyệt & Đăng bài</>
                    )}
                  </button>
                </div>
              </div>

              {/* Regenerate action bar */}
              <div className="bg-brand-soft/50 rounded-xl border border-brand-border/30 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="text-text-3 font-semibold uppercase tracking-wider text-[10px]">Tái tạo bài viết nháp này:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleQueueCommand('REGENERATE_THREAD', { draft_id: selectedDraft.id }, 'regen_thread')}
                    disabled={isAnyLoading}
                    className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-text-2 hover:text-text border border-border hover:bg-surface-hover transition disabled:bg-surface-2/40 disabled:text-text-3 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'regen_thread' ? (
                      <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Đang viết lại...</>
                    ) : 'Viết Lại Thread'}
                  </button>
                  <button
                    onClick={() => handleQueueCommand('REGENERATE_IMAGES', { draft_id: selectedDraft.id }, 'regen_images')}
                    disabled={isAnyLoading}
                    className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-xs text-text-2 hover:text-text border border-border hover:bg-surface-hover transition disabled:bg-surface-2/40 disabled:text-text-3 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'regen_images' ? (
                      <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Đang tạo ảnh...</>
                    ) : 'Tạo Lại Ảnh'}
                  </button>
                  <button
                    onClick={() => handleQueueCommand('REGENERATE_ALL', { draft_id: selectedDraft.id }, 'regen_all')}
                    disabled={isAnyLoading}
                    className="rounded-lg bg-copper-soft px-2.5 py-1.5 text-xs text-copper hover:brightness-110 border border-copper/30 hover:bg-copper-soft/80 transition disabled:bg-surface-2/40 disabled:text-text-3 disabled:cursor-not-allowed"
                  >
                    {loadingAction === 'regen_all' ? (
                      <><Loader2 className="h-3 w-3 animate-spin inline mr-1" />Đang làm mới...</>
                    ) : 'Làm Mới Toàn Bộ'}
                  </button>
                </div>
              </div>

              {/* Draft payload editor */}
              <div className="space-y-4">

                {/* Publishing config (editable, loaded from draft meta) */}
                <div className="bg-surface-2/40 border border-border rounded-xl p-4 space-y-3">
                  <span className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Cấu hình xuất bản (chỉnh sửa trước khi đăng)</span>
                  <div className="flex flex-col gap-2.5">
                    {/* Platform */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 sm:border-0 pb-2 sm:pb-0">
                      <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Nền tảng</label>
                      <div className="w-full sm:w-56">
                        <SegmentedControl
                          options={[
                            { label: 'Primus Spark', value: 'primus' },
                            { label: 'AZDAG', value: 'azdag' },
                          ]}
                          value={targetPlatform}
                          onChange={setTargetPlatform}
                        />
                      </div>
                    </div>
                    {/* Mode */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/40 sm:border-0 pb-2 sm:pb-0">
                      <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Phương thức</label>
                      <div className="w-full sm:w-64">
                        <SegmentedControl
                          options={[
                            { label: 'Web & X', value: 'both' },
                            { label: 'Chỉ Web', value: 'web_only' },
                            { label: 'Chỉ X', value: 'x_only' },
                          ]}
                          value={publishMode}
                          onChange={setPublishMode}
                        />
                      </div>
                    </div>
                    {/* X Format */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <label className="text-[10px] font-semibold text-text-3 uppercase tracking-wider">Định dạng X</label>
                      <div className="w-full sm:w-56">
                        <SegmentedControl
                          options={[
                            { label: 'Thread', value: 'thread' },
                            { label: 'X Article', value: 'article' },
                          ]}
                          value={xFormat}
                          onChange={setXFormat}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Title input */}
                <div>
                  <label className="block text-xs font-semibold text-text-3 uppercase mb-1.5">Tiêu đề bài viết</label>
                  <textarea
                    rows={2}
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-2.5 text-sm text-text focus:border-brand focus:bg-surface-hover focus:outline-none transition resize-none leading-relaxed"
                  />
                </div>

                {/* Markdown Content */}
                <div>
                  <label className="block text-xs font-semibold text-text-3 uppercase mb-1.5">Nội dung bài viết (Markdown - Tiếng Việt)</label>
                  <textarea
                    rows={12}
                    value={editArticleMd}
                    onChange={(e) => setEditArticleMd(e.target.value)}
                    className="w-full rounded-xl border border-border bg-surface-2 px-4 py-3 text-sm text-text font-mono focus:border-brand focus:bg-surface-hover focus:outline-none transition resize-y"
                  />
                </div>

                {/* Twitter Thread */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-text-3 uppercase">Twitter Thread (Tiếng Anh)</label>
                    <button
                      onClick={handleAddTweet}
                      className="flex items-center gap-1 rounded bg-surface-2 border border-border hover:bg-surface-hover px-2 py-1 text-[11px] text-text-2 transition"
                    >
                      <Plus className="h-3 w-3" /> Thêm Tweet
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                    {editTweets.map((tweet, idx) => (
                      <div key={idx} className="bg-surface-2 rounded-xl border border-border p-3 relative flex gap-3 group">
                        <div className="flex flex-col items-center shrink-0">
                          <div className="h-6 w-6 rounded-full bg-brand-soft text-brand text-xs font-bold flex items-center justify-center border border-brand-border">
                            {idx + 1}
                          </div>
                          {idx < editTweets.length - 1 && (
                            <div className="w-0.5 bg-brand-border flex-grow my-1 border-dashed" />
                          )}
                        </div>
                        <div className="flex-grow space-y-1">
                          <textarea
                            rows={3}
                            value={tweet}
                            onChange={(e) => handleTweetChange(idx, e.target.value)}
                            maxLength={4000}
                            className="w-full bg-transparent p-0 text-text text-xs leading-relaxed focus:outline-none resize-none"
                            placeholder="Nội dung tweet..."
                          />
                          <div className="flex justify-between items-center text-[10px] text-text-3">
                            <span>{tweet.length}/4000 ký tự</span>
                            {tweet.length > 4000 && <span className="text-neg">Vượt quá giới hạn!</span>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleRemoveTweet(idx)}
                          className="text-text-3 hover:text-neg opacity-0 group-hover:opacity-100 transition duration-150 absolute top-2 right-2 p-1 cursor-pointer"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Attached Images */}
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-text-3 uppercase">Hình ảnh đính kèm</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {selectedDraft.payload?.images?.map((img, i) => (
                      <div key={i} className="bg-surface-2 border border-border rounded-xl p-3 flex items-center gap-3">
                        <div className="relative h-12 w-20 shrink-0 bg-surface rounded-lg overflow-hidden flex items-center justify-center text-[10px] text-text-3 border border-border">
                          {img.url ? (
                            <img src={img.url} alt={img.role} className="object-cover h-full w-full" />
                          ) : (
                            'No image'
                          )}
                        </div>
                        <div className="text-xs truncate">
                          <div className="font-semibold text-text capitalize font-display">{img.role}</div>
                          {img.url ? (
                            <a href={img.url} target="_blank" rel="noreferrer" className="text-brand hover:underline flex items-center gap-0.5 truncate max-w-[150px]">
                              {img.url}
                            </a>
                          ) : (
                            <span className="text-text-3 italic">Chưa tạo ảnh</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
