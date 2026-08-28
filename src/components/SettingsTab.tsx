import React, { useState } from "react";
import { 
  Sliders, DollarSign, RefreshCw, CheckCircle2, TrendingUp, 
  ShieldAlert, Zap, Hash, Mail, Lock, Eye, EyeOff, Plus, 
  Trash2, Send, Check, AlertCircle, AlertTriangle, Radio, 
  Layers, ShieldCheck, ArrowRight, UserCheck, KeyRound, Database,
  Cloud, RefreshCcw, Server, Shield, Clock, ToggleLeft, ToggleRight,
  CheckSquare, Square, CornerDownRight, AlertOctagon, HelpCircle,
  Globe, Sparkles, Smartphone, Sun, Moon, Bell, Volume2, VolumeX,
  Download, Laptop, Activity
} from "lucide-react";
import { BotSettings, IQOptionConfig, TelegramConfig, TelegramUser, TelegramChannel, ManagementLevelRule } from "../types";
import { 
  POPULAR_TIMEZONES, 
  formatTimeInTz, 
  getTzAbbreviation, 
  getTzUtcOffset, 
  getTimeZoneLabel 
} from "../utils/timezone";
import {
  playTradeWinSound,
  playTradeLossSound,
  playSignalAlertSound,
  playTradeExecutedSound,
  sendTradeExitNotification,
  getNotificationPermission,
  isNotificationSupported
} from "../utils/notification";

export function getCurrencySymbol(currency?: string): string {
  if (!currency) return "$";
  const c = currency.toUpperCase().trim();
  switch (c) {
    case "NGN":
      return "₦";
    case "USD":
      return "$";
    case "EUR":
      return "€";
    case "GBP":
      return "£";
    case "BRL":
      return "R$";
    case "INR":
      return "₹";
    case "IDR":
      return "Rp";
    case "ZAR":
      return "R";
    case "JPY":
    case "CNY":
      return "¥";
    case "CAD":
    case "AUD":
    case "NZD":
    case "SGD":
      return "$";
    case "RUB":
      return "₽";
    case "TRY":
      return "₺";
    default:
      return c;
  }
}

export function formatCurrencyAmount(amount: number, currency?: string): string {
  const sym = getCurrencySymbol(currency);
  const code = currency || "USD";
  return `${sym}${Number(amount || 0).toLocaleString()} ${code}`;
}

interface SettingsTabProps {
  settings: BotSettings;
  iqConfig: IQOptionConfig;
  telegramConfig: TelegramConfig;
  telegramUser: TelegramUser | null;
  channels: TelegramChannel[];
  selectedChannels: string[];
  onUpdateSettings: (newSettings: Partial<BotSettings>) => void;
  onUpdateIQConfig: (newIQ: Partial<IQOptionConfig>) => void;
  onUpdateTelegramConfig: (newTg: Partial<TelegramConfig>) => void;
  onAddChannelId: (channelId: string) => void;
  onRemoveChannelId: (channelId: string) => void;
  onToggleChannel: (channelId: string) => void;
  onSaveSettings: () => Promise<void>;
  onTestIQConnection: (twoFactorCode?: string) => Promise<void>;
  onTelegramConnectSuccess: (user: TelegramUser, channels: TelegramChannel[], sessionString: string) => void;
  onTelegramDisconnect: () => void;
  onHydrateFromDatabase?: () => Promise<void>;
  isSaving: boolean;
  isTestingIQ: boolean;
  isWakeLockActive?: boolean;
  isWakeLockSupported?: boolean;
  onToggleWakeLock?: () => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
  isNotificationEnabled?: boolean;
  onToggleNotification?: () => void;
  isInstallable?: boolean;
  isInstalled?: boolean;
  onPromptInstall?: () => void;
  isIOS?: boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({
  settings,
  iqConfig,
  telegramConfig,
  telegramUser,
  channels,
  selectedChannels,
  onUpdateSettings,
  onUpdateIQConfig,
  onUpdateTelegramConfig,
  onAddChannelId,
  onRemoveChannelId,
  onToggleChannel,
  onSaveSettings,
  onTestIQConnection,
  onTelegramConnectSuccess,
  onTelegramDisconnect,
  onHydrateFromDatabase,
  isSaving,
  isTestingIQ,
  isWakeLockActive = true,
  isWakeLockSupported = true,
  onToggleWakeLock,
  isSoundEnabled = true,
  onToggleSound,
  isNotificationEnabled = false,
  onToggleNotification,
  isInstallable = false,
  isInstalled = false,
  onPromptInstall,
  isIOS = false,
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState("");
  const [newChannelInput, setNewChannelInput] = useState("");
  const [iq2FACode, setIq2FACode] = useState("");
  const [isHydratingDB, setIsHydratingDB] = useState(false);
  
  // Telegram In-Card Authentication Flow States: 'gateway_input' | 'phone_input' | 'code_input'
  const [tgStep, setTgStep] = useState<"gateway_input" | "phone_input" | "code_input">(
    telegramConfig.reActivationRequired && telegramConfig.apiId ? "phone_input" : "gateway_input"
  );
  const [isConnectingGateway, setIsConnectingGateway] = useState(false);
  const [gatewayStatus, setGatewayStatus] = useState<string>("");
  const [tgCode, setTgCode] = useState("");
  const [tgPassword, setTgPassword] = useState("");
  const [tgPhoneCodeHash, setTgPhoneCodeHash] = useState("");
  const [tgTempSession, setTgTempSession] = useState("");
  const [tgRequires2FA, setTgRequires2FA] = useState(false);
  const [isSendingTgCode, setIsSendingTgCode] = useState(false);
  const [isVerifyingTgCode, setIsVerifyingTgCode] = useState(false);
  const [tgError, setTgError] = useState("");
  const [activeLevelTab, setActiveLevelTab] = useState<"level1" | "level2" | "level3">("level1");

  const getLevelRule = (levelKey: "level1" | "level2" | "level3"): ManagementLevelRule => {
    if (settings.managementLevels?.[levelKey]) {
      return settings.managementLevels[levelKey]!;
    }
    const defaultStakes: Record<string, number> = { level1: 220, level2: 484, level3: 1064 };
    return {
      enabled: levelKey !== "level3",
      entryDelaySeconds: 0,
      stakeMode: "MULTIPLIER",
      stakeMultiplier: settings.martingaleMultiplier || 2.2,
      customStake: defaultStakes[levelKey] || 220,
      direction: "SAME",
      durationMinutes: 1,
      maxAllowedDelayMs: 4000,
    };
  };

  const updateLevelRule = (levelKey: "level1" | "level2" | "level3", updates: Partial<ManagementLevelRule>) => {
    const current = getLevelRule(levelKey);
    const existingLevels = settings.managementLevels || {
      level1: getLevelRule("level1"),
      level2: getLevelRule("level2"),
      level3: getLevelRule("level3"),
    };

    onUpdateSettings({
      managementLevels: {
        ...existingLevels,
        [levelKey]: {
          ...current,
          ...updates,
        },
      },
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSaveSettings();
    setSaveSuccessMsg("Settings, channels, and credentials synchronized to Database!");
    setTimeout(() => setSaveSuccessMsg(""), 3500);
  };

  const handleAddChannel = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newChannelInput.trim();
    if (!trimmed) return;
    onAddChannelId(trimmed);
    setNewChannelInput("");
  };

  // Instant 1-click Re-activation
  const handleQuickReactivate = async () => {
    setTgError("");
    setIsSendingTgCode(true);
    try {
      const res = await fetch("/api/telegram/reactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: telegramConfig.apiId,
          apiHash: telegramConfig.apiHash,
          phone: telegramConfig.phone,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTgPhoneCodeHash(data.phoneCodeHash || "");
        setTgTempSession(data.tempSession || "");
        setTgStep("code_input");
      } else {
        setTgError(data.error || "Could not send verification code. Please check your credentials.");
      }
    } catch (err: any) {
      setTgError("Re-activation request error: " + err.message);
    } finally {
      setIsSendingTgCode(false);
    }
  };

  // Step 1: Connect API ID and API Hash to MTProto Gateway
  const handleConnectGateway = async () => {
    if (!telegramConfig.apiId || !telegramConfig.apiHash) {
      setTgError("Please enter your Telegram API ID and API Hash first.");
      return;
    }
    setTgError("");
    setIsConnectingGateway(true);
    setGatewayStatus("Connecting to Telegram MTProto Gateway...");

    try {
      const res = await fetch("/api/telegram/validate-gateway", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: telegramConfig.apiId.trim(),
          apiHash: telegramConfig.apiHash.trim(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setGatewayStatus("MTProto Gateway Connected! Please enter your phone number.");
        setTgStep("phone_input");
      } else {
        setTgError(data.error || data.message || "Failed to initialize MTProto connection. Please verify your API ID and Hash.");
      }
    } catch (err: any) {
      setTgError("Gateway connection failed: " + err.message);
    } finally {
      setIsConnectingGateway(false);
    }
  };

  // Step 2: Request Telegram OTP for phone number
  const handleSendTgCode = async () => {
    if (!telegramConfig.phone || telegramConfig.phone.trim().length < 6) {
      setTgError("Please enter a valid phone number with country code (e.g. +1234567890).");
      return;
    }
    setTgError("");
    setIsSendingTgCode(true);

    try {
      const res = await fetch("/api/telegram/send-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: telegramConfig.apiId.trim(),
          apiHash: telegramConfig.apiHash.trim(),
          phone: telegramConfig.phone.trim(),
        }),
      });
      const data = await res.json();

      if (data.success) {
        setTgPhoneCodeHash(data.phoneCodeHash || "");
        setTgTempSession(data.tempSession || "");
        setTgStep("code_input");
      } else {
        setTgError(data.error || "Failed to send verification code. Please check your phone number.");
      }
    } catch (err: any) {
      setTgError("Failed to request code: " + err.message);
    } finally {
      setIsSendingTgCode(false);
    }
  };

  // Step 3: Verify OTP Code and complete authentication
  const handleVerifyTgCode = async () => {
    if (!tgCode.trim()) {
      setTgError("Please enter the login verification code received in your Telegram app or SMS.");
      return;
    }
    setTgError("");
    setIsVerifyingTgCode(true);

    try {
      const res = await fetch("/api/telegram/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiId: telegramConfig.apiId.trim(),
          apiHash: telegramConfig.apiHash.trim(),
          phone: telegramConfig.phone.trim(),
          code: tgCode.trim(),
          phoneCodeHash: tgPhoneCodeHash,
          password: tgPassword,
          tempSession: tgTempSession,
        }),
      });
      const data = await res.json();

      if (data.success && data.user) {
        onTelegramConnectSuccess(data.user, data.channels || [], data.sessionString || "");
        setTgStep("gateway_input");
        setTgCode("");
        setTgPassword("");
        setGatewayStatus("");
      } else if (data.requires2FA) {
        setTgRequires2FA(true);
        setTgError("Two-Step Verification (2FA Cloud Password) is required. Please enter your password below.");
      } else {
        setTgError(data.error || "Invalid verification code. Please try again.");
      }
    } catch (err: any) {
      setTgError("Verification failed: " + err.message);
    } finally {
      setIsVerifyingTgCode(false);
    }
  };

  const handleManualHydrate = async () => {
    if (!onHydrateFromDatabase) return;
    setIsHydratingDB(true);
    try {
      await onHydrateFromDatabase();
      setSaveSuccessMsg("Successfully fetched credentials and configuration from Database!");
      setTimeout(() => setSaveSuccessMsg(""), 3500);
    } finally {
      setIsHydratingDB(false);
    }
  };

  return (
    <div className="space-y-4">
      {saveSuccessMsg && (
        <div className="p-3 bg-emerald-950/40 border border-emerald-800/50 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{saveSuccessMsg}</span>
        </div>
      )}

      {/* Cloud Database Cross-Device Synchronization Status Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Database & Cross-Device Cloud Persistence</span>
                <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Supabase PostgreSQL Active
                </span>
              </h3>
              <p className="text-[11px] text-slate-400">
                All Telegram sessions, IQ Option logins, and auto-trade parameters are permanently stored in the database.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onHydrateFromDatabase && (
              <button
                type="button"
                onClick={handleManualHydrate}
                disabled={isHydratingDB}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-300 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Fetch latest saved credentials and session from database"
              >
                <RefreshCcw className={`w-3.5 h-3.5 ${isHydratingDB ? "animate-spin" : ""}`} />
                <span>Fetch from DB</span>
              </button>
            )}
            <button
              type="button"
              onClick={onSaveSettings}
              disabled={isSaving}
              className="px-3 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Sync All to DB</span>
            </button>
          </div>
        </div>

        {/* Sync Badges */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
          <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${telegramConfig.isConnected || telegramConfig.apiId ? "bg-emerald-400" : "bg-slate-600"}`} />
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Telegram Auth</div>
              <div className="text-xs font-bold text-white">
                {telegramConfig.isConnected ? "Session Synced" : telegramConfig.apiId ? "Credentials Stored" : "Not Configured"}
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${iqConfig.email ? "bg-emerald-400" : "bg-slate-600"}`} />
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">IQ Option Broker</div>
              <div className="text-xs font-bold text-white">
                {iqConfig.isConnected ? "Connected & Synced" : iqConfig.email ? "Credentials Stored" : "Not Configured"}
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Risk & Strategy</div>
              <div className="text-xs font-bold text-white">
                ${settings.baseStake} • G{settings.maxGaleSteps} • {settings.minPayout}%
              </div>
            </div>
          </div>

          <div className="p-2.5 bg-slate-950/70 border border-slate-800 rounded-xl flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div>
              <div className="text-[10px] text-slate-400 font-semibold uppercase">Monitored VIPs</div>
              <div className="text-xs font-bold text-white">
                {selectedChannels.length} Channels Synced
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <form onSubmit={handleSave} className="space-y-4">

        {/* 1. IQ Option Broker Credentials Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                iqConfig.isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-amber-500/20 text-amber-400"
              }`}>
                <DollarSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>IQ Option Broker Credentials</span>
                  {iqConfig.isConnected ? (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected • {iqConfig.accountMode === "REAL" ? `REAL ($${(iqConfig.realBalance ?? 0).toFixed(2)})` : `DEMO ($${(iqConfig.practiceBalance ?? 10000).toFixed(2)})`}
                    </span>
                  ) : (
                    <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-700">
                      Not Connected
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                  <span>Stored securely in PostgreSQL database. Credentials persist across devices.</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onTestIQConnection(iq2FACode || undefined)}
              disabled={isTestingIQ || !iqConfig.email || !iqConfig.password}
              className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-95"
            >
              {isTestingIQ ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Connecting to Broker...</span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>{iqConfig.isConnected ? "Re-Test Live Balance" : "Connect IQ Option"}</span>
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                IQ Option Email / Login
              </label>
              <div className="relative">
                <Mail className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type="email"
                  value={iqConfig.email}
                  onChange={(e) => onUpdateIQConfig({ email: e.target.value })}
                  placeholder="trader@iqoption.com"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                IQ Option Password
              </label>
              <div className="relative">
                <Lock className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={iqConfig.password || ""}
                  onChange={(e) => onUpdateIQConfig({ password: e.target.value })}
                  placeholder="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-8 pr-8 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          {/* 2FA Token input if required by IP change */}
          {iqConfig.requires2FA && (
            <div className="p-3 bg-amber-950/40 border border-amber-800/50 rounded-xl space-y-2">
              <div className="text-xs text-amber-300 font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>IQ Option 2FA Code Required (New IP Address Detected)</span>
              </div>
              <p className="text-[11px] text-slate-300">
                Please enter the 6-digit confirmation code IQ Option sent to your registered email/phone:
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={iq2FACode}
                  onChange={(e) => setIq2FACode(e.target.value)}
                  placeholder="Enter 6-digit 2FA code"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => onTestIQConnection(iq2FACode)}
                  disabled={!iq2FACode.trim() || isTestingIQ}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all"
                >
                  Verify 2FA
                </button>
              </div>
            </div>
          )}

          {/* Live Balances and Account Mode Switcher */}
          <div className="pt-1">
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-300">
                Trading Account Mode & Live Broker Balances
              </label>
              {!iqConfig.isConnected && (
                <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Connect IQ Option to toggle mode
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!iqConfig.isConnected}
                onClick={() => {
                  onUpdateIQConfig({ accountMode: "PRACTICE" });
                  onUpdateSettings({ accountMode: "PRACTICE" });
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${
                  !iqConfig.isConnected
                    ? "bg-slate-950/60 border-slate-800/60 text-slate-600 cursor-not-allowed"
                    : (iqConfig.accountMode || settings.accountMode || "PRACTICE") === "PRACTICE"
                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300 shadow-sm"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    (iqConfig.accountMode || settings.accountMode || "PRACTICE") === "PRACTICE" ? "bg-amber-400" : "bg-slate-600"
                  }`} />
                  <span>Demo Practice</span>
                </div>
                <span className="font-mono text-[11px] text-amber-400 font-bold">
                  ${(iqConfig.practiceBalance ?? 10000).toFixed(2)} {iqConfig.currency || "USD"}
                </span>
              </button>

              <button
                type="button"
                disabled={!iqConfig.isConnected}
                onClick={() => {
                  onUpdateIQConfig({ accountMode: "REAL" });
                  onUpdateSettings({ accountMode: "REAL" });
                }}
                className={`py-2.5 px-3 rounded-xl text-xs font-bold border transition-all flex items-center justify-between ${
                  !iqConfig.isConnected
                    ? "bg-slate-950/60 border-slate-800/60 text-slate-600 cursor-not-allowed"
                    : (iqConfig.accountMode || settings.accountMode) === "REAL"
                    ? "bg-emerald-500/20 border-emerald-500/60 text-emerald-300 shadow-sm"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    (iqConfig.accountMode || settings.accountMode) === "REAL" ? "bg-emerald-400" : "bg-slate-600"
                  }`} />
                  <span>Real Account</span>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[11px] text-emerald-400 font-bold">
                    ${(iqConfig.realBalance ?? 0).toFixed(2)} {iqConfig.currency || "USD"}
                  </div>
                  {Boolean(iqConfig.bonusBalance && iqConfig.bonusBalance > 0) && (
                    <div className="text-[9px] text-emerald-300/80 font-mono">
                      + Bonus: ${iqConfig.bonusBalance?.toFixed(2)}
                    </div>
                  )}
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* 2. Telegram MTProto Telethon Credentials & Channel Manager Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                telegramConfig.isConnected ? "bg-emerald-500/20 text-emerald-400" : "bg-sky-500/20 text-sky-400"
              }`}>
                <Send className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Telegram MTProto Authentication</span>
                  {telegramConfig.isConnected ? (
                    <span className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected • {telegramUser?.firstName || telegramUser?.username || "Authorized"}
                    </span>
                  ) : (
                    <span className="bg-slate-800 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-slate-700">
                      Not Connected
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Credentials & session stored in database. If IP address changes, 1-click re-activation confirms session.
                </p>
              </div>
            </div>

            {telegramConfig.isConnected && (
              <button
                type="button"
                onClick={onTelegramDisconnect}
                className="px-3 py-1.5 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-800/50 text-rose-300 rounded-xl text-xs font-semibold transition-colors"
              >
                Disconnect Telegram
              </button>
            )}
          </div>

          {/* Re-Activation Notification Banner for Cross-Device / IP Change */}
          {!telegramConfig.isConnected && telegramConfig.reActivationRequired && (
            <div className="p-3.5 bg-amber-950/50 border border-amber-800/60 rounded-xl space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 text-xs font-bold">
                  <KeyRound className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>Session Retrieved from Database (IP/Device Confirmation Required)</span>
                </div>
                <span className="text-[10px] font-mono text-amber-400 bg-amber-900/50 px-2 py-0.5 rounded">
                  {telegramConfig.phone || "Saved Account"}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Your Telegram API ID, Hash, and Phone were successfully loaded from the database. Because Telegram detects a new IP address or container instance, click below to request a fresh OTP login code without re-entering credentials:
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleQuickReactivate}
                  disabled={isSendingTgCode}
                  className="px-4 py-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md"
                >
                  {isSendingTgCode ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending OTP Code...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>⚡ 1-Click Re-activate Session</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTgStep("gateway_input")}
                  className="text-xs text-slate-400 hover:text-slate-200 underline px-2 py-1"
                >
                  Edit API Credentials Manually
                </button>
              </div>
            </div>
          )}

          {/* Connected User Profile Banner */}
          {telegramConfig.isConnected && telegramUser ? (
            <div className="p-3 bg-slate-950 border border-emerald-800/40 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-sky-500/20 border border-sky-500/30 text-sky-400 flex items-center justify-center font-bold text-xs">
                  {(telegramUser.firstName || "U").slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>{telegramUser.firstName} {telegramUser.lastName || ""}</span>
                    {telegramUser.username && (
                      <span className="text-slate-400 font-mono text-[11px]">@{telegramUser.username}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2">
                    <span>Phone: {telegramUser.phone}</span>
                    <span>•</span>
                    <span>ID: {telegramUser.id}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-semibold bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1 rounded-lg">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Session Saved in Database & Active</span>
              </div>
            </div>
          ) : (
            /* Sequential Step-by-Step Flow */
            <div className="space-y-3">
              {/* Step Navigation Pill Indicators */}
              <div className="grid grid-cols-3 gap-2">
                <div className={`p-2 rounded-xl border text-center transition-all ${
                  tgStep === "gateway_input"
                    ? "bg-sky-500/10 border-sky-500/50 text-sky-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Step 1</div>
                  <div className="text-[11px] font-semibold">API Gateway</div>
                </div>
                <div className={`p-2 rounded-xl border text-center transition-all ${
                  tgStep === "phone_input"
                    ? "bg-sky-500/10 border-sky-500/50 text-sky-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Step 2</div>
                  <div className="text-[11px] font-semibold">Phone & OTP</div>
                </div>
                <div className={`p-2 rounded-xl border text-center transition-all ${
                  tgStep === "code_input"
                    ? "bg-sky-500/10 border-sky-500/50 text-sky-300"
                    : "bg-slate-950/60 border-slate-800 text-slate-400"
                }`}>
                  <div className="text-[10px] font-bold uppercase tracking-wider">Step 3</div>
                  <div className="text-[11px] font-semibold">Verify Code</div>
                </div>
              </div>

              {/* Step 1: Gateway Configuration (API ID & API Hash) */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] flex items-center justify-center font-mono">1</span>
                    <span>Telegram API Credentials (my.telegram.org)</span>
                  </span>
                  {tgStep !== "gateway_input" && (
                    <button
                      type="button"
                      onClick={() => setTgStep("gateway_input")}
                      className="text-[10px] text-sky-400 hover:text-sky-300 underline"
                    >
                      Edit Credentials
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      API ID
                    </label>
                    <input
                      type="text"
                      disabled={tgStep !== "gateway_input"}
                      value={telegramConfig.apiId}
                      onChange={(e) => onUpdateTelegramConfig({ apiId: e.target.value })}
                      placeholder="e.g. 12345678"
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-60 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      API HASH
                    </label>
                    <input
                      type="password"
                      disabled={tgStep !== "gateway_input"}
                      value={telegramConfig.apiHash}
                      onChange={(e) => onUpdateTelegramConfig({ apiHash: e.target.value })}
                      placeholder="e.g. 0123456789abcdef..."
                      className="w-full bg-slate-900 border border-slate-700 disabled:opacity-60 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                  </div>
                </div>

                {tgStep === "gateway_input" && (
                  <button
                    type="button"
                    onClick={handleConnectGateway}
                    disabled={isConnectingGateway || !telegramConfig.apiId || !telegramConfig.apiHash}
                    className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    {isConnectingGateway ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Initializing Gateway & Connecting DC...</span>
                      </>
                    ) : (
                      <>
                        <span>Step 1: Connect MTProto Gateway</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Step 2: Phone Number Input & Request Code */}
              {tgStep === "phone_input" && (
                <div className="p-3.5 bg-slate-950 border border-sky-800/60 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] flex items-center justify-center font-mono">2</span>
                      <span>Enter Phone Number to Receive Login OTP</span>
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      Gateway Ready
                    </span>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">
                      Phone Number (with Country Code)
                    </label>
                    <input
                      type="tel"
                      value={telegramConfig.phone}
                      onChange={(e) => onUpdateTelegramConfig({ phone: e.target.value })}
                      placeholder="+1234567890"
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Telegram will send an official login code to your Telegram app or SMS.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleSendTgCode}
                    disabled={isSendingTgCode || !telegramConfig.phone}
                    className="w-full py-2.5 bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    {isSendingTgCode ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending Verification Code to Phone...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Step 2: Request Telegram Login OTP</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Step 3: Verification Code and 2FA */}
              {tgStep === "code_input" && (
                <div className="p-3.5 bg-slate-950 border border-sky-800/60 rounded-xl space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 text-[10px] flex items-center justify-center font-mono">3</span>
                      <span>Enter Verification Code for {telegramConfig.phone}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTgStep("phone_input")}
                      className="text-[10px] text-slate-400 hover:text-slate-200"
                    >
                      Change Phone
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Telegram Login Code
                      </label>
                      <input
                        type="text"
                        value={tgCode}
                        onChange={(e) => setTgCode(e.target.value)}
                        placeholder="5-digit code"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white tracking-widest focus:outline-none focus:border-sky-500"
                      />
                    </div>

                    {tgRequires2FA && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-400 mb-1">
                          2FA Cloud Password
                        </label>
                        <input
                          type="password"
                          value={tgPassword}
                          onChange={(e) => setTgPassword(e.target.value)}
                          placeholder="Telegram 2FA Password"
                          className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={handleVerifyTgCode}
                    disabled={isVerifyingTgCode || !tgCode.trim()}
                    className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-sm active:scale-95"
                  >
                    {isVerifyingTgCode ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying Code & Saving Session...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Step 3: Verify & Save Permanent Session</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Error Display */}
              {tgError && (
                <div className="p-3 bg-rose-950/40 border border-rose-800/60 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{tgError}</span>
                </div>
              )}
            </div>
          )}

          {/* Monitored Channels Manager */}
          <div className="pt-2 border-t border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-sky-400" />
                <span>Monitored Telegram VIP Channels & Chats ({selectedChannels.length} Active)</span>
              </label>
              <div className="flex items-center gap-2">
                {channels.length > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        channels.forEach((c) => {
                          if (!selectedChannels.includes(c.id)) onToggleChannel(c.id);
                        });
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 transition-colors cursor-pointer"
                    >
                      Select All ({channels.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        channels.forEach((c) => {
                          if (selectedChannels.includes(c.id)) onToggleChannel(c.id);
                        });
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                )}
                <span className="text-[10px] text-slate-400 font-mono">
                  Simultaneous MTProto Multi-Channel Stream
                </span>
              </div>
            </div>

            {/* Multi-Channel Listening Notice */}
            <div className="p-2.5 rounded-xl bg-sky-950/40 border border-sky-800/40 text-[11px] font-mono text-sky-300 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Simultaneous Listener: Real-time Telegram MTProto event handlers listen to and ingest signals from all active channels at once.</span>
              </div>
            </div>

            {/* Custom Channel ID Input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newChannelInput}
                onChange={(e) => setNewChannelInput(e.target.value)}
                placeholder="Add Channel/Group ID (e.g. -1001234567890 or @vip_channel)"
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-sky-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddChannel(e);
                  }
                }}
              />
              <button
                type="button"
                onClick={handleAddChannel}
                disabled={!newChannelInput.trim()}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {/* List of Detected & Custom Channels */}
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {channels.length > 0 ? (
                channels.map((ch) => {
                  const isSelected = selectedChannels.includes(ch.id);
                  return (
                    <div
                      key={ch.id}
                      onClick={() => onToggleChannel(ch.id)}
                      className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isSelected
                          ? "bg-sky-500/10 border-sky-500/40 text-white"
                          : "bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? "bg-sky-500 border-sky-400 text-white" : "border-slate-700 bg-slate-900"
                        }`}>
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="truncate">
                          <div className="text-xs font-bold text-slate-200 truncate">{ch.title}</div>
                          <div className="text-[10px] text-slate-500 font-mono truncate">
                            ID: {ch.id} {ch.username ? `• @${ch.username}` : ""} • {ch.type}
                          </div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isSelected ? "bg-sky-500/20 text-sky-300" : "bg-slate-800 text-slate-500"
                      }`}>
                        {isSelected ? "Active Listener" : "Ignored"}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="p-4 bg-slate-950/40 border border-dashed border-slate-800 rounded-xl text-center">
                  <p className="text-xs text-slate-500">
                    No dialogs loaded yet. Connect your Telegram account above to automatically load your subscribed VIP channels, or type a channel ID above.
                  </p>
                </div>
              )}

              {/* Manually Added IDs not in dialog list */}
              {selectedChannels
                .filter((id) => !channels.some((c) => c.id === id))
                .map((customId) => (
                  <div
                    key={customId}
                    className="p-2.5 rounded-xl border bg-sky-500/10 border-sky-500/40 text-white flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-4 h-4 rounded bg-sky-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-200 font-mono">{customId}</div>
                        <div className="text-[10px] text-sky-400 font-mono">Custom Monitored Channel ID</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onRemoveChannelId(customId);
                      }}
                      className="p-1 text-slate-400 hover:text-rose-400 rounded transition-colors"
                      title="Remove custom channel"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* 2.5 Unified Project & Trades Timezone (Strict Lagos / Global Sync) */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-sky-500/20 text-sky-400 flex items-center justify-center">
                <Globe className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Unified Project & Trades Timezone</span>
                  <span className="bg-sky-500/10 text-sky-400 border border-sky-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    Zero Time Mismatch
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">
                  Guarantees that Telegram signals, trade execution triggers, logs, and timer countdowns all use the exact same timezone.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <div className="bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-sky-400" />
                <span>Live Time:</span>
                <strong className="text-white">
                  {formatTimeInTz(Date.now(), settings.timeZone || "Africa/Lagos")}
                </strong>
                <span className="text-[10px] text-sky-400 font-bold bg-sky-950 px-1.5 py-0.5 rounded border border-sky-800/60">
                  {getTzAbbreviation(settings.timeZone || "Africa/Lagos")} ({getTzUtcOffset(settings.timeZone || "Africa/Lagos")})
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Primary Timezone Dropdown */}
            <div className="md:col-span-2 space-y-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Select Project Timezone:</span>
                <span className="text-[10px] text-slate-400">Default: Africa/Lagos (West Africa Time, UTC+1)</span>
              </label>
              <select
                value={settings.timeZone || "Africa/Lagos"}
                onChange={(e) => onUpdateSettings({ timeZone: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white font-mono focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none transition-colors"
              >
                {POPULAR_TIMEZONES.map((tz) => (
                  <option key={tz.value} value={tz.value}>
                    {tz.label} &bull; {tz.offset} ({tz.region})
                  </option>
                ))}
              </select>
            </div>

            {/* Quick Lagos Preset Button */}
            <div className="flex flex-col justify-end">
              <button
                type="button"
                onClick={() => onUpdateSettings({ timeZone: "Africa/Lagos" })}
                className={`w-full min-h-[42px] px-3 py-2 rounded-xl text-xs font-bold font-mono border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  (settings.timeZone || "Africa/Lagos") === "Africa/Lagos"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm"
                    : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                }`}
              >
                <span>🇳🇬 Set Africa/Lagos (WAT)</span>
                {(settings.timeZone || "Africa/Lagos") === "Africa/Lagos" && (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                )}
              </button>
            </div>
          </div>

          {/* Timezone sync summary banner */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 text-[11px] text-slate-400 flex items-start gap-2.5">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <strong className="text-slate-200">Active Sync Scope: </strong>
              Signal Entry times parsed from Telegram (e.g. <span className="text-amber-300 font-mono">14:30</span>) are computed precisely in <span className="text-sky-300 font-mono">{settings.timeZone || "Africa/Lagos"} ({getTzAbbreviation(settings.timeZone || "Africa/Lagos")})</span>. Broker execution timestamps, logs, and countdown timers will match this time identically.
            </div>
          </div>
        </div>

        {/* 3. Risk Management & Trade Execution Engine (Rules Enforced) */}
        {(() => {
          const activeCurrency = iqConfig.currency || "USD";
          const currSymbol = getCurrencySymbol(activeCurrency);

          return (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <span>Trade Management & Capital Risk Engine</span>
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-2 py-0.5 rounded-full">
                        Active & Enforced
                      </span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Multi-Stage Execution Architecture: Precision Scheduled Entry → Checkpoint Early Profit (L1/L2) → Broker Settlement → Managed Recovery (Max L3).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-[11px] font-mono text-slate-300">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Base Risk: <strong className="text-white">{currSymbol}{Number(settings.baseStake || 0).toLocaleString()} {activeCurrency}</strong></span>
                  </div>
                </div>
              </div>

              {/* Architectural Overview Card: Current Trade Management Implementation */}
              <div className="bg-gradient-to-br from-slate-950 via-slate-900/90 to-slate-950 border border-emerald-500/20 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    <h4 className="text-xs font-bold text-slate-200">
                      Active Trade Management Architecture & Workflow
                    </h4>
                  </div>
                  <span className="text-[10px] bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 px-2 py-0.5 rounded-md font-mono font-medium">
                    Native {activeCurrency} Account Support
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 text-[11px] text-slate-300">
                  {/* Stage 1 */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-1.5 text-sky-400 font-bold text-xs">
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>1. Scheduled Entry</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Executes strictly at the signal entry timestamp in <span className="text-sky-300 font-mono">{settings.timeZone || "Africa/Lagos"}</span>. 1 trade per signal, zero premature market entry, automatic late-tolerance skip.
                    </p>
                  </div>

                  {/* Stage 2 */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs">
                      <TrendingUp className="w-3.5 h-3.5 shrink-0" />
                      <span>2. L1/L2 Checkpoints</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      At intermediate targets (e.g. +2m, +4m), live spot is evaluated. If in profit (ITM), bot triggers early broker sell to lock in profit early as a WIN. If negative, position continues safely.
                    </p>
                  </div>

                  {/* Stage 3 */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-1.5 text-purple-400 font-bold text-xs">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>3. Broker Settlement</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Awaits official IQ Option broker settlement at expiration. WIN ends management immediately. Only verified LOSS proceeds to user-configured recovery levels.
                    </p>
                  </div>

                  {/* Stage 4 */}
                  <div className="p-3 bg-slate-900/90 border border-slate-800/80 rounded-xl space-y-1.5">
                    <div className="flex items-center gap-1.5 text-amber-400 font-bold text-xs">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>4. Multi-Currency Sizing</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-relaxed">
                      Directly scales from <strong className="text-white">{currSymbol}1</strong> to <strong className="text-white">{currSymbol}10,000,000 {activeCurrency}</strong> to accommodate currencies like NGN, USD, EUR, INR, BRL without artificial caps.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section A: Initial Trade (Level 0) Configuration */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 sm:p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center text-xs font-bold font-mono">
                      0
                    </div>
                    <h4 className="text-xs font-bold text-white">Initial Trade (Level 0) Parameters & Capital Sizing</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Rule 1 & Rule 8</span>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Base Price / Stake */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-300">
                        Default Base Risk / Stake ({activeCurrency})
                      </label>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">
                        {currSymbol}{Number(settings.baseStake || 0).toLocaleString()} {activeCurrency}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs font-bold">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={10000000}
                        step={1}
                        value={settings.baseStake}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          onUpdateSettings({ baseStake: Math.max(1, Math.min(10000000, val || 1)) });
                        }}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-9 pr-20 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                        placeholder="Enter stake amount"
                      />
                      <span className="absolute right-3 top-2 text-slate-500 font-mono text-[11px]">
                        {activeCurrency}
                      </span>
                    </div>

                    {/* Quick Stake Preset Chips */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-slate-500 mr-1">Quick Presets:</span>
                      {[
                        { label: `${currSymbol}100`, val: 100 },
                        { label: `${currSymbol}1,000`, val: 1000 },
                        { label: `${currSymbol}5,000`, val: 5000 },
                        { label: `${currSymbol}25,000`, val: 25000 },
                        { label: `${currSymbol}100,000`, val: 100000 },
                        { label: `${currSymbol}500,000`, val: 500000 },
                        { label: `${currSymbol}1,000,000`, val: 1000000 },
                        { label: `${currSymbol}5,000,000`, val: 5000000 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => onUpdateSettings({ baseStake: preset.val })}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                            settings.baseStake === preset.val
                              ? "bg-emerald-600 border-emerald-500 text-white font-bold"
                              : "bg-slate-900/80 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>

                    <p className="text-[10px] text-slate-500 leading-tight">
                      Configurable range: <strong className="text-slate-400 font-mono">{currSymbol}1</strong> to <strong className="text-slate-400 font-mono">{currSymbol}10,000,000 {activeCurrency}</strong>. Allows proper risk calibration across standard and high-denomination account currencies.
                    </p>
                  </div>

                  {/* Min Payout & Account Currency info */}
                  <div className="space-y-2">
                    <label className="block text-xs font-semibold text-slate-300">
                      Minimum Asset Payout Filter (%)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min={50}
                        max={99}
                        value={settings.minPayout}
                        onChange={(e) => onUpdateSettings({ minPayout: Number(e.target.value) || 80 })}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-3 top-2 text-slate-500 font-mono text-xs">% payout</span>
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Signals on assets with broker payout lower than this threshold will be skipped safely.
                    </span>

                    {/* Account Currency Synchronizer banner */}
                    <div className="mt-2 p-2.5 bg-slate-900/80 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Globe className="w-3.5 h-3.5 text-sky-400" />
                        <span className="text-slate-300">Active Account Currency:</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-xs">
                        <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold">
                          {currSymbol} {activeCurrency}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Level 1 Rule Enforcement Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-1">
                  <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <Clock className="w-3 h-3 text-sky-400" />
                      <span>Scheduled Entry Time</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Trades at exact signal entry time in active timezone. Never trades immediately when Telegram message arrives.
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="text-[11px] font-bold text-slate-200 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Single Order Guarantee</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      Executes strictly ONE initial trade per signal. Prevents duplicate order placement across messages.
                    </p>
                  </div>

                  <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-lg space-y-1">
                    <div className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                      <AlertOctagon className="w-3 h-3 text-emerald-400" />
                      <span>WIN = STOP Immediately</span>
                    </div>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      If Level 1 wins (or locks in early profit at Level 1 / Level 2 checkpoint), all management stops. No further trades are placed.
                    </p>
                  </div>
                </div>
              </div>

              {/* Section B: Global Management Hierarchy & Overrides */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white">Management Levels Hierarchy & Rules</h4>
                  </div>
                  <span className="text-[10px] text-emerald-400 font-mono font-bold">Rule 4, 6 & 7</span>
                </div>

                {/* Visual Progression Map */}
                <div className="p-2.5 bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto">
                  <div className="flex items-center gap-2 text-[11px] font-mono whitespace-nowrap min-w-max">
                    <span className="px-2 py-1 bg-sky-950 border border-sky-800/60 text-sky-300 rounded font-bold">
                      Level 1 (Signal Entry)
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-emerald-400">WIN: STOP</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-rose-400">IN-LOSS:</span>
                    <span className="px-2 py-1 bg-amber-950 border border-amber-800/60 text-amber-300 rounded font-bold">
                      Level 2 (Checkpoint 2)
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="text-emerald-400">WIN: STOP</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-rose-400">IN-LOSS:</span>
                    <span className="px-2 py-1 bg-rose-950 border border-rose-800/60 text-rose-300 rounded font-bold">
                      Level 3 (Full Expiry Close)
                    </span>
                    <span className="text-slate-500">→</span>
                    <span className="px-2 py-1 bg-slate-800 text-slate-300 rounded font-bold border border-slate-700">
                      STOP (Management Complete)
                    </span>
                  </div>
                </div>

                {/* Max Allowed Gale Steps Selector */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      Maximum Management Depth Allowed (Management Limit)
                    </label>
                    <span className="text-[10px] text-amber-400 font-mono">
                      {settings.maxGaleSteps <= 1 ? "Level 1 Entry Only" : settings.maxGaleSteps === 2 ? "Up to Level 2 Checkpoint" : "Up to Level 3 Full Close"}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { level: 1, label: "Level 1 (Entry Only)", desc: "Direct Single Trade" },
                      { level: 2, label: "Level 2 (Up to L2)", desc: "Up to Checkpoint 2" },
                      { level: 3, label: "Level 3 (Up to L3)", desc: "Up to Full Close (Hard Stop)" },
                    ].map(({ level, label, desc }) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => onUpdateSettings({ maxGaleSteps: level })}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all text-center ${
                          settings.maxGaleSteps === level || (level === 1 && (settings.maxGaleSteps === 0 || !settings.maxGaleSteps))
                            ? "bg-emerald-600 border-emerald-500 text-white shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div>{label}</div>
                        <div className="text-[9px] font-normal opacity-75 font-mono">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Precision Checkpoint Lead Time (Pre-Close 3 Seconds Before Minute) */}
                <div className="p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-sky-400" />
                        <span>Precision Early Close Lead Time (Pre-Minute Close)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        Triggers spot evaluation and transmits early sell command before the minute checkpoint, sealing profit before the candle closes.
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-sky-950 border border-sky-800 text-sky-300 text-[11px] font-mono font-bold rounded">
                      T-{settings.checkpointLeadSeconds ?? 3}s
                    </span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 pt-1">
                    {[
                      { sec: 2, label: "T - 2s", desc: "Fast" },
                      { sec: 3, label: "T - 3s (Optimal)", desc: "Recommended" },
                      { sec: 4, label: "T - 4s", desc: "High Buffer" },
                      { sec: 5, label: "T - 5s", desc: "Ultra Safe" },
                    ].map(({ sec, label, desc }) => (
                      <button
                        key={sec}
                        type="button"
                        onClick={() => onUpdateSettings({ checkpointLeadSeconds: sec })}
                        className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all text-center ${
                          (settings.checkpointLeadSeconds ?? 3) === sec
                            ? "bg-sky-600 border-sky-500 text-white shadow-sm"
                            : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <div>{label}</div>
                        <div className="text-[9px] font-normal opacity-75">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Rule 6 & Rule 7 Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-1">
                  {/* Rule 6: Ignore Telegram Martingale */}
                  <div 
                    onClick={() => onUpdateSettings({ ignoreTelegramMartingale: !(settings.ignoreTelegramMartingale ?? true) })}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      (settings.ignoreTelegramMartingale ?? true)
                        ? "bg-emerald-500/10 border-emerald-500/40 text-slate-200"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      (settings.ignoreTelegramMartingale ?? true)
                        ? "bg-emerald-500 border-emerald-400 text-white"
                        : "border-slate-700 bg-slate-950"
                    }`}>
                      {(settings.ignoreTelegramMartingale ?? true) && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Rule 6: Ignore Telegram Signal MG Tags</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        Ignores signal provider's MG1/MG2 tags. The bot's internal Level 1/2/3 rules control all management.
                      </p>
                    </div>
                  </div>

                  {/* Rule 7: Wait for Confirmed Result */}
                  <div 
                    onClick={() => onUpdateSettings({ waitForActualResult: !(settings.waitForActualResult ?? true) })}
                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-2.5 ${
                      (settings.waitForActualResult ?? true)
                        ? "bg-emerald-500/10 border-emerald-500/40 text-slate-200"
                        : "bg-slate-900 border-slate-800 text-slate-400"
                    }`}
                  >
                    <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                      (settings.waitForActualResult ?? true)
                        ? "bg-emerald-500 border-emerald-400 text-white"
                        : "border-slate-700 bg-slate-950"
                    }`}>
                      {(settings.waitForActualResult ?? true) && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-1.5">
                        <span>Rule 7: Wait for Confirmed IQ Option Result</span>
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">
                        Waits for official IQ settlement. Only a confirmed LOSS moves to the next level. WIN halts immediately.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section C: Configured Rules for Each Management Level (Level 1, 2, 3 - Rule 5) */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h4 className="text-xs font-bold text-white">Rule 5: Detailed Management Level Configurations</h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">
                    A loss does not auto-trade unless rules match
                  </span>
                </div>

                {/* Level Tabs: Level 1 | Level 2 | Level 3 */}
                <div className="flex border-b border-slate-800 gap-1 pb-1">
                  {(["level1", "level2", "level3"] as const).map((lvlKey, idx) => {
                    const lvlNum = idx + 1;
                    const rule = getLevelRule(lvlKey);
                    const isActive = activeLevelTab === lvlKey;
                    return (
                      <button
                        key={lvlKey}
                        type="button"
                        onClick={() => setActiveLevelTab(lvlKey)}
                        className={`flex-1 py-2 px-3 rounded-t-xl text-xs font-bold border-b-2 transition-all flex items-center justify-center gap-2 ${
                          isActive
                            ? "bg-slate-900 border-emerald-500 text-white shadow-sm"
                            : "bg-slate-950/50 border-transparent text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${rule.enabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                        <span>Level {lvlNum} (MG {lvlNum})</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          rule.enabled ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-500"
                        }`}>
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Active Level Rule Form (Rule 5 Parameters) */}
                {(() => {
                  const rule = getLevelRule(activeLevelTab);
                  const lvlNum = activeLevelTab === "level1" ? 1 : activeLevelTab === "level2" ? 2 : 3;

                  return (
                    <div className="space-y-4 pt-1">
                      {/* Enable Switch Banner */}
                      <div className="flex items-center justify-between p-3 bg-slate-900 rounded-xl border border-slate-800">
                        <div>
                          <div className="text-xs font-bold text-white flex items-center gap-2">
                            <span>Enable Level {lvlNum} Execution</span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono ${
                              rule.enabled ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-slate-800 text-slate-400"
                            }`}>
                              {rule.enabled ? `Evaluated only if Level ${lvlNum - 1} LOSES` : "Level Inactive (Skipped)"}
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {lvlNum === 3
                              ? "Level 3 is the final management boundary. WIN or LOSS at Level 3 terminates management."
                              : `If Level ${lvlNum - 1} results in a confirmed LOSS, Level ${lvlNum} will be executed if rules are met.`}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => updateLevelRule(activeLevelTab, { enabled: !rule.enabled })}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                            rule.enabled
                              ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                              : "bg-slate-800 hover:bg-slate-700 text-slate-400"
                          }`}
                        >
                          {rule.enabled ? "Enabled" : "Disabled"}
                        </button>
                      </div>

                      {/* 5 Parameters Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
                        {/* 1. Stake Sizing Mode & Value */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                          <label className="block text-xs font-semibold text-slate-300">
                            1. Stake Sizing Rule ({activeCurrency})
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            <button
                              type="button"
                              onClick={() => updateLevelRule(activeLevelTab, { stakeMode: "MULTIPLIER" })}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                                rule.stakeMode !== "FIXED"
                                  ? "bg-emerald-600 border-emerald-500 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400"
                              }`}
                            >
                              Multiplier
                            </button>
                            <button
                              type="button"
                              onClick={() => updateLevelRule(activeLevelTab, { stakeMode: "FIXED" })}
                              className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${
                                rule.stakeMode === "FIXED"
                                  ? "bg-emerald-600 border-emerald-500 text-white"
                                  : "bg-slate-950 border-slate-800 text-slate-400"
                              }`}
                            >
                              Fixed ({currSymbol})
                            </button>
                          </div>

                          {rule.stakeMode === "FIXED" ? (
                            <div className="relative">
                              <span className="absolute left-3 top-2 text-slate-400 font-mono text-xs font-bold">
                                {currSymbol}
                              </span>
                              <input
                                type="number"
                                min={1}
                                max={10000000}
                                value={rule.customStake || (lvlNum === 1 ? 220 : lvlNum === 2 ? 484 : 1064)}
                                onChange={(e) => updateLevelRule(activeLevelTab, { customStake: Number(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-8 pr-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                              />
                            </div>
                          ) : (
                            <div className="relative">
                              <input
                                type="number"
                                step="0.1"
                                min={1.0}
                                max={5.0}
                                value={rule.stakeMultiplier || 2.2}
                                onChange={(e) => updateLevelRule(activeLevelTab, { stakeMultiplier: Number(e.target.value) })}
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                              />
                              <span className="absolute right-3 top-2 text-slate-400 font-mono text-xs">x stake</span>
                            </div>
                          )}
                        </div>

                        {/* 2. Trade Direction */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                          <label className="block text-xs font-semibold text-slate-300">
                            2. Trade Direction
                          </label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {[
                              { val: "SAME", label: "Same (Signal)" },
                              { val: "REVERSE", label: "Reverse" },
                              { val: "CALL", label: "Force CALL" },
                              { val: "PUT", label: "Force PUT" },
                            ].map((dirOpt) => (
                              <button
                                key={dirOpt.val}
                                type="button"
                                onClick={() => updateLevelRule(activeLevelTab, { direction: dirOpt.val as any })}
                                className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-all text-center ${
                                  (rule.direction || "SAME") === dirOpt.val
                                    ? "bg-emerald-600 border-emerald-500 text-white"
                                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                {dirOpt.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 3. Timer (Duration) */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                          <label className="block text-xs font-semibold text-slate-300">
                            3. Timer (Trade Duration)
                          </label>
                          <div className="grid grid-cols-3 gap-1.5">
                            {[1, 2, 5].map((mins) => (
                              <button
                                key={mins}
                                type="button"
                                onClick={() => updateLevelRule(activeLevelTab, { durationMinutes: mins })}
                                className={`py-1.5 px-2 rounded-lg text-xs font-mono font-bold border transition-all ${
                                  (rule.durationMinutes || 1) === mins
                                    ? "bg-emerald-600 border-emerald-500 text-white"
                                    : "bg-slate-950 border-slate-800 text-slate-400"
                                }`}
                              >
                                {mins} Min
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 4. Entry Delay Offset */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5">
                          <label className="block text-xs font-semibold text-slate-300">
                            4. Entry Timing (Offset)
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={0}
                              max={30}
                              value={rule.entryDelaySeconds || 0}
                              onChange={(e) => updateLevelRule(activeLevelTab, { entryDelaySeconds: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                            />
                            <span className="absolute right-3 top-2 text-slate-400 font-mono text-xs">sec offset</span>
                          </div>
                          <span className="text-[10px] text-slate-500">0 = Exact previous expiration second</span>
                        </div>

                        {/* 5. Late Entry Tolerance */}
                        <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-1.5 sm:col-span-2">
                          <label className="block text-xs font-semibold text-rose-300 flex items-center justify-between">
                            <span>5. Maximum Allowed Delay (Tolerance)</span>
                            <span className="text-[10px] font-mono text-rose-400">Rule 5 Strict Skip</span>
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              min={1000}
                              max={15000}
                              step={500}
                              value={rule.maxAllowedDelayMs || 4000}
                              onChange={(e) => updateLevelRule(activeLevelTab, { maxAllowedDelayMs: Number(e.target.value) })}
                              className="w-full bg-slate-950 border border-rose-800/50 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                            />
                            <span className="absolute right-3 top-2 text-slate-400 font-mono text-xs">milliseconds (ms)</span>
                          </div>
                          <p className="text-[10px] text-slate-400 leading-tight">
                            Never executes late. If entry is delayed beyond {rule.maxAllowedDelayMs || 4000}ms, Level {lvlNum} is <strong>SKIPPED</strong> automatically.
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Section D: Daily Stop Loss and Take Profit Guards (Currency-Aware) */}
              <div className="bg-slate-950/70 border border-slate-800/90 rounded-xl p-3.5 sm:p-4 space-y-3.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-rose-400" />
                    <h4 className="text-xs font-bold text-white">
                      Daily Account Protection Guards ({activeCurrency})
                    </h4>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono">Daily Auto-Cutoff</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Daily Stop Loss */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-rose-300 flex items-center gap-1">
                        <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                        <span>Daily Stop-Loss ({activeCurrency})</span>
                      </label>
                      <span className="text-[11px] font-mono text-rose-400 font-bold">
                        {currSymbol}{Number(settings.dailyStopLoss || 0).toLocaleString()} {activeCurrency}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs font-bold">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={100000000}
                        value={settings.dailyStopLoss}
                        onChange={(e) => onUpdateSettings({ dailyStopLoss: Number(e.target.value) || 500 })}
                        className="w-full bg-slate-900 border border-rose-800/40 rounded-xl pl-9 pr-16 py-2 text-xs font-mono text-white focus:outline-none focus:border-rose-500"
                      />
                      <span className="absolute right-3 top-2 text-slate-500 font-mono text-[11px]">
                        {activeCurrency}
                      </span>
                    </div>

                    {/* Quick Stop Loss Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
                      {[
                        { label: `${currSymbol}500`, val: 500 },
                        { label: `${currSymbol}5,000`, val: 5000 },
                        { label: `${currSymbol}50,000`, val: 50000 },
                        { label: `${currSymbol}250,000`, val: 250000 },
                        { label: `${currSymbol}1,000,000`, val: 1000000 },
                        { label: `${currSymbol}5,000,000`, val: 5000000 },
                      ].map((p) => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => onUpdateSettings({ dailyStopLoss: p.val })}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                            settings.dailyStopLoss === p.val
                              ? "bg-rose-600/80 border-rose-500 text-white font-bold"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Halts all automated trading if cumulative daily net loss reaches this threshold.
                    </span>
                  </div>

                  {/* Daily Take Profit */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-emerald-300 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Daily Take-Profit ({activeCurrency})</span>
                      </label>
                      <span className="text-[11px] font-mono text-emerald-400 font-bold">
                        {currSymbol}{Number(settings.dailyTakeProfit || 0).toLocaleString()} {activeCurrency}
                      </span>
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-400 font-mono text-xs font-bold">
                        {currSymbol}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={100000000}
                        value={settings.dailyTakeProfit}
                        onChange={(e) => onUpdateSettings({ dailyTakeProfit: Number(e.target.value) || 1000 })}
                        className="w-full bg-slate-900 border border-emerald-800/40 rounded-xl pl-9 pr-16 py-2 text-xs font-mono text-white focus:outline-none focus:border-emerald-500"
                      />
                      <span className="absolute right-3 top-2 text-slate-500 font-mono text-[11px]">
                        {activeCurrency}
                      </span>
                    </div>

                    {/* Quick Take Profit Presets */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-500 mr-1">Presets:</span>
                      {[
                        { label: `${currSymbol}1,000`, val: 1000 },
                        { label: `${currSymbol}10,000`, val: 10000 },
                        { label: `${currSymbol}100,000`, val: 100000 },
                        { label: `${currSymbol}500,000`, val: 500000 },
                        { label: `${currSymbol}2,000,000`, val: 2000000 },
                        { label: `${currSymbol}10,000,000`, val: 10000000 },
                      ].map((p) => (
                        <button
                          key={p.val}
                          type="button"
                          onClick={() => onUpdateSettings({ dailyTakeProfit: p.val })}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-lg border transition-all ${
                            settings.dailyTakeProfit === p.val
                              ? "bg-emerald-600/80 border-emerald-500 text-white font-bold"
                              : "bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                    <span className="text-[10px] text-slate-500 block">
                      Locks in daily profits and pauses further automated executions once target is hit.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* 4. Native App (PWA), Screen Keep-Awake & Audio Alert Center */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-sky-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                <Smartphone className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Native App, Screen Awake & Audio Alerts</span>
                  {isInstalled ? (
                    <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      Installed Native PWA
                    </span>
                  ) : (
                    <span className="bg-sky-500/20 text-sky-300 border border-sky-500/40 text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-sky-400" />
                      PWA Standalone Ready
                    </span>
                  )}
                </h3>
                <p className="text-[11px] text-slate-400">
                  Configure hardware wake lock, installable standalone mode, and native sound and notification alerts.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Left Column: Screen Keep-Awake (Wake Lock) */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isWakeLockActive ? "bg-amber-500/20 text-amber-400" : "bg-slate-800 text-slate-400"
                  }`}>
                    {isWakeLockActive ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Screen Keep-Awake</h4>
                    <p className="text-[10px] text-slate-400">Prevents screen from sleeping/locking</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleWakeLock}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isWakeLockActive
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                      : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isWakeLockActive ? "bg-amber-400 animate-pulse" : "bg-slate-600"}`} />
                  <span>{isWakeLockActive ? "Enabled (Active)" : "Disabled"}</span>
                </button>
              </div>

              <div className="p-2.5 bg-slate-900/80 border border-slate-800/80 rounded-lg text-[11px] text-slate-300 leading-relaxed">
                <p>
                  {isWakeLockActive ? (
                    <span className="text-amber-300 font-medium">
                      💡 <strong>Screen Wake Lock is Active.</strong> Your display will remain awake so real-time Telegram signals and IQ Option trade timers execute uninterrupted without device sleep.
                    </span>
                  ) : (
                    <span className="text-slate-400">
                      Standard operating system screen timeout will apply when inactive. Enable to keep display awake during trading hours.
                    </span>
                  )}
                </p>
              </div>
            </div>

            {/* Right Column: PWA Installation Banner */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <Laptop className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Install Native PWA App</h4>
                    <p className="text-[10px] text-slate-400">Run standalone with zero browser chrome</p>
                  </div>
                </div>

                {isInstalled ? (
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                    <Check className="w-3 h-3 text-emerald-400" />
                    Installed
                  </span>
                ) : isInstallable && onPromptInstall ? (
                  <button
                    type="button"
                    onClick={onPromptInstall}
                    className="px-3 py-1.5 bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md active:scale-95 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Install App</span>
                  </button>
                ) : (
                  <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                    Standalone Ready
                  </span>
                )}
              </div>

              <div className="p-2.5 bg-slate-900/80 border border-slate-800/80 rounded-lg text-[11px] text-slate-300">
                {isIOS ? (
                  <p className="text-slate-300">
                    📱 <strong>iOS Installation:</strong> Tap the <span className="font-semibold text-sky-400">Share button</span> in Safari and select <span className="font-semibold text-emerald-400">"Add to Home Screen"</span> to install as a full native app.
                  </p>
                ) : (
                  <p className="text-slate-300">
                    🚀 Install this app on your desktop, tablet, or phone for fullscreen native windowing, automatic offline shell caching, and instant launch from your home screen.
                  </p>
                )}
              </div>
            </div>

            {/* Bottom Row Left: Native Sound Chimes */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isSoundEnabled ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-800 text-slate-500"
                  }`}>
                    {isSoundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Audio & Outcome Chimes</h4>
                    <p className="text-[10px] text-slate-400">Synthesized latency-free audio chimes</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleSound}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isSoundEnabled
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50"
                      : "bg-slate-900 text-slate-400 border-slate-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isSoundEnabled ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span>{isSoundEnabled ? "Sound ON" : "Muted"}</span>
                </button>
              </div>

              {/* Interactive Audio Test Buttons */}
              <div className="pt-1">
                <div className="text-[10px] text-slate-400 font-semibold mb-1.5">Interactive Sound Preview:</div>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() => playTradeWinSound()}
                    className="py-1.5 px-2 bg-emerald-950/60 hover:bg-emerald-900/80 border border-emerald-700/60 text-emerald-300 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <span>🟢 Test WIN</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => playTradeLossSound()}
                    className="py-1.5 px-2 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-700/60 text-rose-300 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <span>🔴 Test LOSS</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => playSignalAlertSound()}
                    className="py-1.5 px-2 bg-sky-950/60 hover:bg-sky-900/80 border border-sky-700/60 text-sky-300 rounded-lg text-[11px] font-bold transition-all flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                  >
                    <span>⚡ Signal Alert</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Row Right: Browser Push Notifications */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                    isNotificationEnabled ? "bg-sky-500/20 text-sky-400" : "bg-slate-800 text-slate-500"
                  }`}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">System Push Notifications</h4>
                    <p className="text-[10px] text-slate-400">Instant trade exit and alert notifications</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onToggleNotification}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    isNotificationEnabled
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/50"
                      : "bg-slate-900 text-slate-400 border-slate-700"
                  }`}
                >
                  <span className={`w-2 h-2 rounded-full ${isNotificationEnabled ? "bg-sky-400" : "bg-slate-600"}`} />
                  <span>{isNotificationEnabled ? "Notifications ON" : "Disabled"}</span>
                </button>
              </div>

              {/* Notification Test Button & Status */}
              <div className="flex items-center justify-between pt-1 gap-2">
                <span className="text-[10px] text-slate-400 font-mono">
                  Permission: {isNotificationSupported() ? getNotificationPermission() : "Unsupported"}
                </span>

                <button
                  type="button"
                  onClick={() => {
                    if (!isNotificationEnabled && onToggleNotification) {
                      onToggleNotification();
                    }
                    sendTradeExitNotification({
                      asset: "EUR/USD (OTC)",
                      action: "CALL",
                      outcome: "WIN",
                      profit: 87.0,
                      stake: 100.0,
                      managementLevel: 0,
                      orderId: "TEST-9988",
                      accountMode: iqConfig.accountMode || "PRACTICE",
                    });
                  }}
                  className="py-1 px-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-[11px] font-semibold transition-all active:scale-95 cursor-pointer"
                >
                  🔔 Send Test Push Notification
                </button>
              </div>
            </div>

          </div>
        </div>

        {/* Master Save Button */}
        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-sky-600 hover:from-emerald-500 hover:to-sky-500 disabled:opacity-50 text-white text-xs font-bold px-6 py-3 rounded-xl shadow-lg transition-all active:scale-95"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Saving to Cloud Database...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Save All Settings & Sync Database</span>
              </>
            )}
          </button>
        </div>

      </form>
    </div>
  );
};
