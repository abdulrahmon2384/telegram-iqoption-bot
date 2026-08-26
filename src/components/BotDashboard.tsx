import React, { useState, useEffect, useMemo } from "react";
import { 
  Play, Pause, ArrowUpRight, ArrowDownRight, Zap, 
  RefreshCw, CheckCircle2, AlertTriangle, Clock, 
  DollarSign, Activity, TrendingUp, ShieldAlert,
  Settings as SettingsIcon, Radio, MessageSquare, Tag,
  Layers, Check, Filter, Trash2, ShieldCheck, ChevronDown, ChevronUp,
  FileText, CheckCircle, XCircle, Moon, Sun, Smartphone, Bell,
  Volume2, VolumeX, Download
} from "lucide-react";
import { ParsedSignal, SignalLog, BotSettings, MonitoredMessage, TradeRecord } from "../types";
import { formatTimeInTz, getTzAbbreviation } from "../utils/timezone";
import { TradeStatsDashboard } from "./TradeStatsDashboard";
import { LiveTradePlayCard } from "./LiveTradePlayCard";

interface BotDashboardProps {
  isBotRunning: boolean;
  onToggleBot: () => void;
  isTelegramConnected: boolean;
  isIQConnected: boolean;
  monitoredChannelCount: number;
  selectedChannels: string[];
  channels?: { id: string; title: string; username?: string; isChannel?: boolean; isGroup?: boolean }[];
  settings: BotSettings;
  onUpdateSettings: (newSettings: Partial<BotSettings>) => void;
  logs: SignalLog[];
  monitoredMessages: MonitoredMessage[];
  onManualSignalSubmit: (text: string, channelName?: string) => void;
  onClearMessages?: () => void;
  onNavigateToSettings: () => void;
  onSyncCatchup?: () => Promise<any>;
  isWakeLockActive?: boolean;
  onToggleWakeLock?: () => void;
  lastCatchupTimestamp?: number;
  isReconnecting?: boolean;
  allTrades?: TradeRecord[];
  onClearStats?: () => void;
  isNotificationEnabled?: boolean;
  onToggleNotification?: () => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
  isInstallable?: boolean;
  isInstalled?: boolean;
  onPromptInstall?: () => void;
}

export const BotDashboard: React.FC<BotDashboardProps> = ({
  isBotRunning,
  onToggleBot,
  isTelegramConnected,
  isIQConnected,
  monitoredChannelCount,
  selectedChannels,
  channels = [],
  settings,
  onUpdateSettings,
  logs,
  monitoredMessages,
  onManualSignalSubmit,
  onClearMessages,
  onNavigateToSettings,
  onSyncCatchup,
  isWakeLockActive = true,
  onToggleWakeLock,
  lastCatchupTimestamp = Date.now(),
  isReconnecting = false,
  allTrades = [],
  onClearStats,
  isNotificationEnabled = false,
  onToggleNotification,
  isSoundEnabled = true,
  onToggleSound,
  isInstallable = false,
  isInstalled = false,
  onPromptInstall,
}) => {
  const [expandedTradeLogs, setExpandedTradeLogs] = useState<Record<string, boolean>>({});
  const [liveProjectTime, setLiveProjectTime] = useState("");
  const [messageFilter, setMessageFilter] = useState<"ALL" | "SIGNALS" | "CHATS">("ALL");
  const [selectedChannelFilter, setSelectedChannelFilter] = useState<string>("ALL");
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(false);
  const [customChannelName, setCustomChannelName] = useState("VIP Signal Channel");
  const [customMessageText, setCustomMessageText] = useState("");
  const [isRestartingListener, setIsRestartingListener] = useState(false);
  const [isCatchingUp, setIsCatchingUp] = useState(false);
  const [listenerFeedback, setListenerFeedback] = useState<string | null>(null);
  const [catchupFeedback, setCatchupFeedback] = useState<string | null>(null);
  const [secondsUntilNextCatchup, setSecondsUntilNextCatchup] = useState(8);

  const projectTz = settings.timeZone || "Africa/Lagos";

  // Continuous 8s countdown indicator
  useEffect(() => {
    const timer = setInterval(() => {
      const elapsedSec = Math.floor((Date.now() - lastCatchupTimestamp) / 1000);
      const remaining = Math.max(0, 8 - (elapsedSec % 8));
      setSecondsUntilNextCatchup(remaining);
    }, 1000);
    return () => clearInterval(timer);
  }, [lastCatchupTimestamp]);

  const handleRestartListener = async () => {
    setIsRestartingListener(true);
    setListenerFeedback("Reconnecting MTProto listener...");
    try {
      const res = await fetch("/api/telegram/restart-listener", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setListenerFeedback("Live MTProto Listener active & connected!");
      } else {
        setListenerFeedback(data.error || "Failed to restart listener.");
      }
    } catch (e: any) {
      setListenerFeedback("Listener connection error.");
    } finally {
      setIsRestartingListener(false);
      setTimeout(() => setListenerFeedback(null), 3500);
    }
  };

  const handleTriggerCatchup = async () => {
    setIsCatchingUp(true);
    setCatchupFeedback("Performing instant 8s continuous catchup sync across channels...");
    try {
      if (onSyncCatchup) {
        const result = await onSyncCatchup();
        if (result && result.success) {
          setCatchupFeedback(`Catchup complete: ${result.messagesRetrieved ?? 0} messages synced.`);
        } else {
          setCatchupFeedback(result?.error || "Catchup sync completed.");
        }
      } else {
        const res = await fetch("/api/telegram/catchup", { method: "POST" });
        const data = await res.json();
        if (data.success) {
          setCatchupFeedback(`Catchup complete: ${data.messagesRetrieved || 0} messages synced.`);
        } else {
          setCatchupFeedback(data.error || "Catchup sync failed.");
        }
      }
    } catch (e: any) {
      setCatchupFeedback("Catchup sync error.");
    } finally {
      setIsCatchingUp(false);
      setTimeout(() => setCatchupFeedback(null), 3500);
    }
  };

  const handleApplyPreset = (presetKey: string) => {
    const next1 = new Date(Date.now() + 60000);
    const next5 = new Date(Date.now() + 300000);
    const next10 = new Date(Date.now() + 600000);
    const time1Str = formatTimeInTz(next1.getTime(), projectTz, { withSeconds: false });
    const time5Str = formatTimeInTz(next5.getTime(), projectTz, { withSeconds: false });
    const time10Str = formatTimeInTz(next10.getTime(), projectTz, { withSeconds: false });

    if (presetKey === "vip_otc") {
      setCustomChannelName("VIP Trading Elite");
      setCustomMessageText(`Trade: 🇪🇺 EUR/USD 🇺🇸 (OTC)\nTimer: 5\nEntry: ${time1Str}\nDirection: BUY 🟩\nMartingale Levels:\nLevel 1 -> ${time5Str}\nLevel 2 -> ${time10Str}`);
    } else if (presetKey === "turbo_now") {
      setCustomChannelName("Turbo Scalping 1M");
      setCustomMessageText(`Trade: GBP/USD\nTimer: 1\nEntry: NOW\nDirection: SELL 🟥\nGale: 1`);
    } else if (presetKey === "multi_level") {
      setCustomChannelName("Pro Binary Signals");
      setCustomMessageText(`Trade: USD/JPY (OTC)\nTimeframe: M5\nEntry Time: ${time1Str}\nDirection: CALL 🟢\nLevel 1 -> ${time5Str}\nLevel 2 -> ${time10Str}`);
    } else if (presetKey === "portuguese") {
      setCustomChannelName("Sinais VIP Brasil");
      setCustomMessageText(`Ativo: AUD/CAD\nExpiração: 5M\nHorário: ${time1Str}\nDireção: COMPRA 🟢\nMartingale: 1`);
    } else if (presetKey === "chat") {
      setCustomChannelName("VIP Trading Elite");
      setCustomMessageText(`Good morning traders! The market session is opening shortly. Keep your risk management tight today!`);
    }
  };

  const samplePresetsList = [
    { key: "vip_otc", label: "📌 VIP OTC Signal (M5)" },
    { key: "turbo_now", label: "⚡ M1 Turbo (NOW)" },
    { key: "multi_level", label: "🎯 Multi-Level Martingale" },
    { key: "portuguese", label: "🇧🇷 Portuguese Format" },
    { key: "chat", label: "💬 Non-Signal Broadcast" },
  ];

  const handleSimulateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customMessageText.trim()) return;
    onManualSignalSubmit(customMessageText.trim(), customChannelName.trim() || "VIP Signal Channel");
    setCustomMessageText("");
  };

  // Live Project Clock
  useEffect(() => {
    const tick = () => {
      setLiveProjectTime(formatTimeInTz(Date.now(), projectTz));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [projectTz]);

  const toggleTradeLog = (id: string) => {
    setExpandedTradeLogs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const isReadyToTrade = isTelegramConnected && isIQConnected;
  const signalMessages = monitoredMessages.filter((m) => m.isSignal);
  const nonSignalMessages = monitoredMessages.filter((m) => !m.isSignal);

  const warningMessage = !isTelegramConnected && !isIQConnected
    ? "Setup Required: Connect Telegram MTProto and IQ Option in Settings to start receiving live signals and broker execution."
    : !isTelegramConnected
    ? "Telegram Disconnected: Connect Telegram in Settings to listen to VIP channels in real-time."
    : !isIQConnected
    ? "IQ Option Disconnected: Connect IQ Option in Settings to execute broker orders."
    : null;

  const renderTradeStatusBadge = (trade?: TradeRecord) => {
    if (!trade) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
          IDENTIFIED
        </span>
      );
    }

    switch (trade.state) {
      case "SCHEDULED":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1">
            <Clock className="w-3 h-3 text-purple-400" />
            <span>SCHEDULED ({trade.scheduledEntryTime})</span>
          </span>
        );
      case "PREPARING":
      case "WAITING_FOR_ENTRY":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 animate-pulse">
            <RefreshCw className="w-3 h-3 text-cyan-400 animate-spin" />
            <span>WAITING FOR ENTRY</span>
          </span>
        );
      case "PRE_TRADE_CHECK":
      case "EXECUTING":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1 animate-pulse">
            <Zap className="w-3 h-3 text-blue-400" />
            <span>EXECUTING ORDER</span>
          </span>
        );
      case "OPEN":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>OPEN ON BROKER</span>
          </span>
        );
      case "WIN":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/30 text-emerald-200 border border-emerald-400 flex items-center gap-1">
            <CheckCircle className="w-3 h-3 text-emerald-400" />
            <span>WIN (+${trade.profit?.toFixed(2) || "0.00"}) 🟢</span>
          </span>
        );
      case "LOSS":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/30 text-rose-200 border border-rose-400 flex items-center gap-1">
            <XCircle className="w-3 h-3 text-rose-400" />
            <span>LOSS (-${trade.stake?.toFixed(2) || "0.00"}) 🔴</span>
          </span>
        );
      case "SKIPPED":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-amber-400" />
            <span>SKIPPED</span>
          </span>
        );
      case "FAILED":
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1">
            <ShieldAlert className="w-3 h-3 text-rose-400" />
            <span>FAILED</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {trade.state}
          </span>
        );
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-12">
      {/* 1. SETUP / DISCONNECT NOTIFICATION */}
      {warningMessage && (
        <div className="bg-amber-950/40 border border-amber-500/40 rounded-2xl p-3.5 flex items-start sm:items-center justify-between gap-3 text-amber-300 animate-fade-in shadow-md">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400" />
            <p className="text-xs sm:text-sm font-medium">{warningMessage}</p>
          </div>
          <button
            onClick={onNavigateToSettings}
            className="self-start sm:self-auto min-h-[38px] px-3.5 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shrink-0 transition-all shadow active:scale-95 flex items-center gap-1.5 cursor-pointer"
          >
            <span>Settings</span>
            <SettingsIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. ALWAYS-ON REAL-TIME LISTENER & 8-SECOND CATCHUP CONTROL BAR WITH ANIMATING BANNER */}
      <div className="relative overflow-hidden bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-3">
        {/* Animated Moving Laser Beam / Top Border Highlight */}
        <div className="absolute top-0 left-0 right-0 h-[2px] overflow-hidden">
          <div className={`h-full w-1/3 animate-scanline ${
            isBotRunning ? "bg-gradient-to-r from-transparent via-emerald-400 to-transparent" : "bg-gradient-to-r from-transparent via-amber-400 to-transparent"
          }`} />
        </div>

        {/* Dynamic Continuous Marquee Ticker Ribbon */}
        <div className="bg-slate-950/90 border-b border-slate-800/80 py-1.5 px-2 overflow-hidden flex items-center">
          <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold uppercase tracking-wider z-10 shadow-sm mr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span>LIVE STREAM</span>
          </div>

          <div className="overflow-hidden whitespace-nowrap flex-1 relative mask-gradient">
            <div className="animate-marquee-smooth flex items-center gap-6 text-xs font-mono">
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
                <span>ALWAYS-ON AUTO-TRADE & REAL-TIME LISTENER ACTIVE</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-sky-300">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span>8s Continuous Catchup Sync Active</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Signal Loss Guarantee &bull; Multi-Channel MTProto</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-amber-300">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>{monitoredChannelCount} Channel{monitoredChannelCount === 1 ? "" : "s"} Monitored 24/7</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              {liveProjectTime && (
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Market Time: {liveProjectTime} {getTzAbbreviation(projectTz)}</span>
                </span>
              )}

              <span className="text-slate-600">&bull;</span>

              {/* Duplicate copy for seamless loop */}
              <span className="flex items-center gap-1.5 text-emerald-300 font-bold">
                <Zap className="w-3.5 h-3.5 fill-current text-emerald-400" />
                <span>ALWAYS-ON AUTO-TRADE & REAL-TIME LISTENER ACTIVE</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-sky-300">
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400 animate-pulse" />
                <span>8s Continuous Catchup Sync Active</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-slate-300">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Zero Signal Loss Guarantee &bull; Multi-Channel MTProto</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              <span className="flex items-center gap-1.5 text-amber-300">
                <Radio className="w-3.5 h-3.5 text-amber-400" />
                <span>{monitoredChannelCount} Channel{monitoredChannelCount === 1 ? "" : "s"} Monitored 24/7</span>
              </span>

              <span className="text-slate-600">&bull;</span>

              {liveProjectTime && (
                <span className="flex items-center gap-1.5 text-purple-300">
                  <Clock className="w-3.5 h-3.5 text-purple-400" />
                  <span>Market Time: {liveProjectTime} {getTzAbbreviation(projectTz)}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="p-4 pt-1 space-y-3.5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5">
            {/* Status & Indicators */}
            <div className="flex items-start sm:items-center gap-3 min-w-0">
              <div className="relative flex items-center justify-center shrink-0 mt-1 sm:mt-0">
                <span className={`w-4 h-4 rounded-full ${
                  isReconnecting 
                    ? "bg-amber-400 animate-ping" 
                    : isBotRunning && isTelegramConnected 
                    ? "bg-emerald-400 animate-ping" 
                    : "bg-slate-600"
                }`} />
                <span className={`absolute w-3 h-3 rounded-full ${
                  isReconnecting 
                    ? "bg-amber-500" 
                    : isBotRunning && isTelegramConnected 
                    ? "bg-emerald-500" 
                    : "bg-slate-500"
                }`} />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative group inline-block">
                    <h2 className="text-sm sm:text-base font-bold text-white tracking-tight flex items-center gap-2">
                      <span className="bg-gradient-to-r from-white via-emerald-200 to-sky-300 bg-clip-text text-transparent drop-shadow-sm font-extrabold">
                        {isBotRunning ? "Always-On Auto-Trade & Real-Time Listener Active" : "Auto-Trade Listener Active (Execution Paused)"}
                      </span>
                      {isReconnecting && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                          Auto-Recovering...
                        </span>
                      )}
                    </h2>
                  </div>

                  <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>8s Continuous Catchup Sync</span>
                  </span>

                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-slate-950 text-slate-300 border border-slate-800">
                    {monitoredChannelCount} Channel{monitoredChannelCount === 1 ? "" : "s"} Monitored
                  </span>

                  {liveProjectTime && (
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-sky-950/80 text-sky-300 border border-sky-800/60 flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5 text-sky-400" />
                      <span>{liveProjectTime} {getTzAbbreviation(projectTz)}</span>
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span>Listening 24/7 across all channels &bull; Missed message catchup runs every 8 seconds automatically.</span>
                  <span className="text-sky-400 font-mono text-[11px] font-semibold">
                    (Next sync check in ~{secondsUntilNextCatchup}s)
                  </span>
                </p>
              </div>
            </div>

            {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto">
            {/* PWA Install Button if available */}
            {isInstallable && !isInstalled && onPromptInstall && (
              <button
                type="button"
                onClick={onPromptInstall}
                className="min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white shadow-md transition-all flex items-center gap-1.5 active:scale-95 cursor-pointer"
                title="Install SignalBot as Native App on your device"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Install App</span>
              </button>
            )}

            {/* Screen Awake / Keep-Awake Toggle */}
            {onToggleWakeLock && (
              <button
                type="button"
                onClick={onToggleWakeLock}
                className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all flex items-center gap-1.5 cursor-pointer ${
                  isWakeLockActive
                    ? "bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-sm"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
                title="Keeps device screen awake while on this tab to prevent sleep & keep 8s catchup running"
              >
                {isWakeLockActive ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400 animate-spin" style={{ animationDuration: "12s" }} />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-slate-500" />
                )}
                <span>{isWakeLockActive ? "Screen Awake: ON" : "Screen Awake: OFF"}</span>
              </button>
            )}

            {/* Native Sound Toggle */}
            {onToggleSound && (
              <button
                type="button"
                onClick={onToggleSound}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs border transition-all flex items-center gap-1 cursor-pointer ${
                  isSoundEnabled
                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title={isSoundEnabled ? "Sound & outcome chimes enabled" : "Audio muted"}
              >
                {isSoundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            )}

            {/* Push Notification Toggle */}
            {onToggleNotification && (
              <button
                type="button"
                onClick={onToggleNotification}
                className={`min-h-[40px] px-2.5 py-1.5 rounded-xl text-xs border transition-all flex items-center gap-1 cursor-pointer ${
                  isNotificationEnabled
                    ? "bg-sky-500/15 border-sky-500/40 text-sky-300"
                    : "bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300"
                }`}
                title={isNotificationEnabled ? "Push notifications enabled" : "Push notifications disabled"}
              >
                <Bell className={`w-3.5 h-3.5 ${isNotificationEnabled ? "text-sky-400" : ""}`} />
              </button>
            )}

            {/* Account Mode Switcher (Demo / Real) */}
            <button
              type="button"
              disabled={!isIQConnected}
              onClick={() => {
                if (isIQConnected) {
                  onUpdateSettings({ accountMode: settings.accountMode === "PRACTICE" ? "REAL" : "PRACTICE" });
                }
              }}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold font-mono border transition-all flex items-center justify-center gap-1.5 ${
                !isIQConnected
                  ? "bg-slate-950 border-slate-800 text-slate-600 cursor-not-allowed"
                  : settings.accountMode === "PRACTICE"
                  ? "bg-amber-500/15 border-amber-500/40 text-amber-300 hover:border-amber-400 cursor-pointer"
                  : "bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:border-emerald-400 cursor-pointer"
              }`}
              title={isIQConnected ? "Toggle Demo vs Real trading mode" : "Connect IQ Option in settings"}
            >
              <span className={`w-2 h-2 rounded-full ${settings.accountMode === "PRACTICE" ? "bg-amber-400" : "bg-emerald-400"}`} />
              <span>{settings.accountMode === "PRACTICE" ? "DEMO MODE" : "REAL MODE"}</span>
            </button>

            {/* Master Auto-Trade Active / Pause Toggle */}
            <button
              type="button"
              onClick={onToggleBot}
              className={`min-h-[40px] flex items-center justify-center gap-2 px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer ${
                isBotRunning
                  ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40"
                  : "bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/40"
              }`}
              title="Toggle automatic signal execution"
            >
              {isBotRunning ? (
                <>
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Execution: Active</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Execution: Paused</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>

      {/* 3. REAL-TIME LOG OF MESSAGE RECEIVED (Multi-Channel Live Stream) */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-3 shadow-md">
        {/* Header & Quick Action Buttons */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isTelegramConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-600"}`} />
            <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider truncate flex items-center gap-1.5">
              <span>Channel Stream</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 font-normal">
                {monitoredMessages.length} Today
              </span>
            </h3>
            <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-800/60 px-1.5 py-0.5 rounded border border-slate-700/50">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              Persisted
            </span>
          </div>

          {/* Action Toolbar */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Catchup Sync */}
            {isTelegramConnected && (
              <button
                type="button"
                onClick={handleTriggerCatchup}
                disabled={isCatchingUp}
                className="px-2 py-1 text-[10px] sm:text-[11px] font-mono font-medium rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 border border-sky-500/30 flex items-center gap-1 transition-all cursor-pointer"
                title="Scan for missed messages across channels with deduplication"
              >
                <RefreshCw className={`w-3 h-3 ${isCatchingUp ? "animate-spin text-sky-400" : ""}`} />
                <span className="hidden sm:inline">{isCatchingUp ? "Syncing..." : "Sync"}</span>
              </button>
            )}

            {/* Drop Simulator Toggle */}
            <button
              type="button"
              onClick={() => setIsSimulatorOpen(!isSimulatorOpen)}
              className={`px-2 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                isSimulatorOpen
                  ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                  : "bg-slate-800 border-slate-700 text-slate-300 hover:text-white"
              }`}
              title="Test ingestion with custom signal or message"
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>{isSimulatorOpen ? "Hide Test" : "⚡ Test Drop"}</span>
            </button>

            {/* Clear Button */}
            {onClearMessages && monitoredMessages.length > 0 && (
              <button
                type="button"
                onClick={onClearMessages}
                className="p-1 sm:p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                title="Prune previous day messages (Current day messages are kept)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Feedback message if any */}
        {listenerFeedback && (
          <div className="p-2 rounded-xl bg-emerald-950/60 border border-emerald-500/30 text-emerald-300 text-xs font-mono flex items-center gap-2">
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{listenerFeedback}</span>
          </div>
        )}

        {catchupFeedback && (
          <div className="p-2 rounded-xl bg-sky-950/60 border border-sky-500/30 text-sky-300 text-xs font-mono flex items-center gap-2">
            <RefreshCw className="w-3.5 h-3.5 shrink-0 animate-spin" />
            <span className="truncate">{catchupFeedback}</span>
          </div>
        )}

        {/* Interactive Drop Message / Signal Simulator */}
        {isSimulatorOpen && (
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/40 space-y-2.5 animate-fade-in shadow-inner">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Test Signal / Message Ingestion
                </span>
              </div>
            </div>

            {/* Quick 1-Click Sample Presets */}
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Quick Sample Presets:
              </span>
              <div className="flex flex-wrap gap-1">
                {samplePresetsList.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => handleApplyPreset(preset.key)}
                    className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-emerald-300 border border-slate-800 transition-colors cursor-pointer"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Form */}
            <form onSubmit={handleSimulateSubmit} className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-1">
                  <input
                    type="text"
                    value={customChannelName}
                    onChange={(e) => setCustomChannelName(e.target.value)}
                    placeholder="Channel name..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <textarea
                    rows={2}
                    value={customMessageText}
                    onChange={(e) => setCustomMessageText(e.target.value)}
                    placeholder="Paste or type raw Telegram signal / text here..."
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2 text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <button
                  type="submit"
                  disabled={!customMessageText.trim()}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-bold font-mono flex items-center gap-1.5 transition-all shadow-md cursor-pointer ${
                    customMessageText.trim()
                      ? "bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/40 active:scale-95"
                      : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
                  }`}
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Send Test Message</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Message Filter Tabs & Channel Selector (Clean Mobile-Friendly Bar) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] font-mono pt-0.5">
          {/* Segmented Tabs */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800/80 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setMessageFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-xs ${
                messageFilter === "ALL"
                  ? "bg-slate-800 text-white font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              All ({monitoredMessages.length})
            </button>
            <button
              type="button"
              onClick={() => setMessageFilter("SIGNALS")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1 text-xs ${
                messageFilter === "SIGNALS"
                  ? "bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/40 shadow-sm"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              <Zap className="w-3 h-3 text-emerald-400" />
              <span>Signals ({signalMessages.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setMessageFilter("CHATS")}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer text-xs ${
                messageFilter === "CHATS"
                  ? "bg-slate-800 text-slate-200 font-bold shadow-sm"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Chats ({nonSignalMessages.length})
            </button>
          </div>

          {/* Channel Filter Selector */}
          <div className="flex items-center gap-1.5 self-end sm:self-auto">
            <Filter className="w-3 h-3 text-slate-500 shrink-0" />
            <select
              value={selectedChannelFilter}
              onChange={(e) => setSelectedChannelFilter(e.target.value)}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-300 font-mono focus:outline-none focus:border-sky-500 max-w-[170px] truncate"
            >
              <option value="ALL">All Channels ({monitoredMessages.length})</option>
              {Array.from(new Set(monitoredMessages.map((m) => m.channelTitle || m.channelId || "VIP Channel"))).map((chName) => (
                <option key={chName} value={chName}>
                  {chName}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Chronological Message Log Feed */}
        <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
          {monitoredMessages.length === 0 ? (
            <div className="py-6 px-4 text-center bg-slate-950/60 border border-dashed border-slate-800 rounded-xl space-y-1.5">
              <Radio className="w-5 h-5 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400 font-medium">
                {isTelegramConnected 
                  ? "Continuous multi-channel listener connected. Listening to all subscribed Telegram channels or drop a test message above..."
                  : "Telegram listener on standby. Connect Telegram in Settings or test with the 'Drop Message / Test' simulator above."}
              </p>
            </div>
          ) : (
            monitoredMessages
              .filter((msg) => {
                if (messageFilter === "SIGNALS") return msg.isSignal;
                if (messageFilter === "CHATS") return !msg.isSignal;
                return true;
              })
              .filter((msg) => {
                if (selectedChannelFilter === "ALL") return true;
                const title = msg.channelTitle || msg.channelId || "VIP Channel";
                return title === selectedChannelFilter;
              })
              .map((msg) => {
                const isSignal = msg.isSignal;
                const isBackfill = msg.isBackfill;

                return (
                  <div
                    key={msg.id}
                    className={`p-2.5 rounded-xl border text-xs font-mono transition-all flex flex-col gap-1 ${
                      isSignal
                        ? "bg-slate-950 border-emerald-500/40 text-slate-200"
                        : "bg-slate-950/70 border-slate-800/80 text-slate-300"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[11px] font-bold text-slate-300 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">
                          {msg.channelTitle || msg.channelId || "VIP Channel"}
                        </span>
                        <span className="text-[10px] text-slate-500">
                          {msg.timestamp}
                        </span>
                        {isBackfill && (
                          <span className="px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[9px] font-bold">
                            🔄 8s CATCHUP SYNCED
                          </span>
                        )}
                      </div>

                      {isSignal ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          <span>SIGNAL IDENTIFIED</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                          Log Entry
                        </span>
                      )}
                    </div>

                    {/* Log Notice Line */}
                    <div className="text-[11px] text-slate-400 pl-1 border-l-2 border-slate-800">
                      {isSignal ? (
                        <span className="text-emerald-400 font-semibold">
                          Trading signal detected &bull; {msg.parsedSignal?.asset} {msg.parsedSignal?.action} ({msg.parsedSignal?.timeframe}) &bull; Entry: {msg.parsedSignal?.scheduledTime || "NOW"} &bull; Routed to Trade Execution Engine.
                        </span>
                      ) : (
                        <span>
                          Message received &bull; {msg.rawText ? `"${msg.rawText.slice(0, 100)}${msg.rawText.length > 100 ? "..." : ""}"` : "Text broadcast logged."}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
          )}
        </div>
      </div>

      {/* 4. SCROLLABLE DETECTED SIGNALS & TRADE EXECUTION LEDGER SECTION */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>Detected VIP Signals & Trade Execution Engine</span>
                <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  {signalMessages.length} Identified
                </span>
              </h3>
            </div>
          </div>
        </div>

        {/* Scrollable Detected Signals List with Real-Time Play-out & Live Duration Bars */}
        <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
          {signalMessages.length === 0 ? (
            <div className="py-8 px-4 text-center bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl space-y-2">
              <Activity className="w-6 h-6 text-slate-600 mx-auto" />
              <p className="text-xs text-slate-400 font-medium max-w-md mx-auto">
                Always-On listener active. When trading signals arrive in monitored VIP channels, the engine validates rules, schedules entry, and executes automatically on IQ Option.
              </p>
            </div>
          ) : (
            signalMessages.map((msg) => {
              const p = msg.parsedSignal;
              if (!p) return null;
              const trade = msg.tradeRecord;
              const isExpanded = Boolean(expandedTradeLogs[msg.id]);

              if (trade) {
                return (
                  <LiveTradePlayCard
                    key={msg.id}
                    trade={trade}
                    parsedSignal={p}
                    rawText={msg.rawText}
                    sourceChannel={msg.channelTitle || msg.channelId}
                    timestamp={msg.timestamp}
                    onToggleAudit={() => toggleTradeLog(msg.id)}
                    isExpanded={isExpanded}
                  />
                );
              }

              return (
                <div
                  key={msg.id}
                  className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/40 shadow-sm space-y-2.5 transition-all"
                >
                  {/* Signal Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold font-mono text-white bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
                        {p.asset}
                      </span>
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono flex items-center gap-1 ${
                          p.action === "CALL"
                            ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50"
                            : "bg-rose-500/25 text-rose-300 border border-rose-500/50"
                        }`}
                      >
                        {p.action === "CALL" ? (
                          <>
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            <span>BUY / CALL 🟩</span>
                          </>
                        ) : (
                          <>
                            <ArrowDownRight className="w-3.5 h-3.5" />
                            <span>SELL / PUT 🟥</span>
                          </>
                        )}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400">
                        Received: {msg.timestamp}
                      </span>
                      {renderTradeStatusBadge(trade)}
                    </div>
                  </div>

                  {/* Signal Execution Parameters Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
                    <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-500 block uppercase">Timer / Expiry</span>
                      <span className="text-white font-bold">
                        {p.timeframe} ({p.durationMinutes} min)
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-500 block uppercase">Execution Entry</span>
                      <span className="text-amber-300 font-bold">
                        {p.scheduledTime ? p.scheduledTime : "NOW"}
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-500 block uppercase">Stake & Mode</span>
                      <span className="text-emerald-300 font-bold">
                        ${settings.baseStake} &bull; {settings.accountMode}
                      </span>
                    </div>

                    <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
                      <span className="text-[10px] text-slate-500 block uppercase">Broker Order</span>
                      <span className="text-sky-300 font-bold truncate block">
                        Pending Entry
                      </span>
                    </div>
                  </div>

                  {/* Raw Signal Text */}
                  <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words bg-slate-950/90 p-2.5 rounded-xl border border-slate-800/70 leading-relaxed">
                    {msg.rawText}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 5. ⭐ TRADE EXECUTION STATISTICS & PERFORMANCE DASHBOARD (Directly Below Section 4) */}
      <TradeStatsDashboard
        trades={useMemo(() => {
          const map = new Map<string, TradeRecord>();
          // 1. Add all trades from backend state
          allTrades.forEach((t) => {
            if (t && t.id) map.set(t.id, t);
          });
          // 2. Merge all tradeRecords attached to monitored messages
          monitoredMessages.forEach((m) => {
            if (m.tradeRecord && m.tradeRecord.id) {
              map.set(m.tradeRecord.id, m.tradeRecord);
            }
          });
          return Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }, [allTrades, monitoredMessages])}
        onClearStats={onClearStats}
        isNotificationEnabled={isNotificationEnabled}
        onToggleNotification={onToggleNotification}
        isSoundEnabled={isSoundEnabled}
        onToggleSound={onToggleSound}
      />
    </div>
  );
};
