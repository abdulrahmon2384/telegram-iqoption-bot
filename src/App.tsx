import React, { useState, useEffect, useCallback, useRef } from "react";
import { 
  Bot, Send, Play, Pause, Terminal, CheckCircle2, AlertCircle, 
  Settings, RefreshCw, ArrowUpRight, ArrowDownRight, Radio, 
  Shield, Code2, Database, Sliders, MessageSquare, Zap, DollarSign,
  CheckCircle, Sparkles, AlertTriangle, X, Cloud, TrendingUp,
  Clock, Eye, Download, Smartphone, Volume2, VolumeX, Bell
} from "lucide-react";
import { 
  TelegramUser, TelegramChannel, ParsedSignal, SignalLog, 
  BotSettings, IQOptionConfig, TelegramConfig, AutoTradeSession,
  MonitoredMessage, TradeRecord 
} from "./types";
import { BotDashboard } from "./components/BotDashboard";
import { SettingsTab } from "./components/SettingsTab";
import { parseSignalClient } from "./utils/parser";
import { getSupabaseConfig } from "./lib/supabase";
import { formatTimeInTz } from "./utils/timezone";
import { useWakeLock } from "./hooks/useWakeLock";
import { usePWAInstall } from "./hooks/usePWAInstall";
import { 
  playTradeWinSound, playTradeLossSound, playSignalAlertSound, playTradeExecutedSound,
  sendTradeExitNotification, requestNotificationPermission, getNotificationPermission, isNotificationSupported 
} from "./utils/notification";

export default function App() {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  
  // Screen Keep-Awake Hook
  const { isLocked: isWakeLockActive, isSupported: isWakeLockSupported, toggleWakeLock, requestWakeLock } = useWakeLock();

  // PWA Native Installation Hook
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();

  // Telegram State
  const [isTelegramConnected, setIsTelegramConnected] = useState(false);
  const [telegramUser, setTelegramUser] = useState<TelegramUser | null>(null);
  const [channels, setChannels] = useState<TelegramChannel[]>([]);
  const [selectedChannels, setSelectedChannels] = useState<string[]>([]);
  const [isCheckingSession, setIsCheckingSession] = useState(true);

  // Database-Backed Credentials & Configurations
  const [telegramConfig, setTelegramConfig] = useState<TelegramConfig>({
    apiId: "",
    apiHash: "",
    phone: "",
    sessionString: "",
    isConnected: false,
  });

  const [iqConfig, setIQConfig] = useState<IQOptionConfig>({
    email: "",
    password: "",
    accountMode: "PRACTICE",
    isConnected: false,
    balance: 10000.0,
  });

  // Bot Risk & Strategy Settings (Always-On by default)
  const [isBotRunning, setIsBotRunning] = useState(true);
  const [lastCatchupTimestamp, setLastCatchupTimestamp] = useState<number>(Date.now());
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Executed Trades Ledger & Notification States
  const [allTrades, setAllTrades] = useState<TradeRecord[]>([]);
  const [isNotificationEnabled, setIsNotificationEnabled] = useState(false);
  const [isSoundEnabled, setIsSoundEnabled] = useState(true);
  const [activeToast, setActiveToast] = useState<{ id: string; title: string; message: string; type: "WIN" | "LOSS" | "DRAW" | "INFO" } | null>(null);

  // Initial check for notification permissions
  useEffect(() => {
    if (isNotificationSupported() && getNotificationPermission() === "granted") {
      setIsNotificationEnabled(true);
    }
  }, []);

  const handleToggleNotification = async () => {
    if (!isNotificationSupported()) {
      alert("Browser notifications are not supported in this environment.");
      return;
    }
    if (!isNotificationEnabled) {
      const perm = await requestNotificationPermission();
      if (perm === "granted") {
        setIsNotificationEnabled(true);
        setGlobalStatusMsg("Browser trade exit notifications enabled!");
        setTimeout(() => setGlobalStatusMsg(""), 3000);
      } else {
        setIsNotificationEnabled(false);
        alert("Notification permission not granted. Please enable notifications in your browser settings.");
      }
    } else {
      setIsNotificationEnabled(false);
    }
  };

  const [settings, setSettings] = useState<BotSettings>({
    isEnabled: true,
    accountMode: "PRACTICE",
    baseStake: 100,
    minPayout: 80,
    martingaleMultiplier: 2.2,
    maxGaleSteps: 1,
    dailyStopLoss: 500,
    dailyTakeProfit: 1000,
    timeZone: "Africa/Lagos",
    ignoreTelegramMartingale: true,
    waitForActualResult: true,
    managementLevels: {
      level1: {
        enabled: true,
        entryDelaySeconds: 0,
        stakeMode: "MULTIPLIER",
        stakeMultiplier: 2.2,
        customStake: 220,
        direction: "SAME",
        durationMinutes: 1,
        maxAllowedDelayMs: 4000,
      },
      level2: {
        enabled: true,
        entryDelaySeconds: 0,
        stakeMode: "MULTIPLIER",
        stakeMultiplier: 2.2,
        customStake: 484,
        direction: "SAME",
        durationMinutes: 1,
        maxAllowedDelayMs: 4000,
      },
      level3: {
        enabled: false,
        entryDelaySeconds: 0,
        stakeMode: "MULTIPLIER",
        stakeMultiplier: 2.2,
        customStake: 1064,
        direction: "SAME",
        durationMinutes: 1,
        maxAllowedDelayMs: 4000,
      },
    },
  });

  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [isTestingIQ, setIsTestingIQ] = useState(false);
  const [globalStatusMsg, setGlobalStatusMsg] = useState("");

  // Monitored Channel Messages Feed (Real-Time Live)
  const [monitoredMessages, setMonitoredMessages] = useState<MonitoredMessage[]>([]);

  // Identified Signal Logs (Real-Time Live)
  const [logs, setLogs] = useState<SignalLog[]>([]);

  // 1. Initial Load: Retrieve Full Config and Always-On Status from Server
  useEffect(() => {
    const loadInitialConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          if (data.config) {
            if (data.config.telegram) {
              setTelegramConfig(data.config.telegram);
              if (data.config.telegram.isConnected) {
                setIsTelegramConnected(true);
              }
            }
            if (data.config.iqOption) {
              setIQConfig(data.config.iqOption);
            }
            if (data.config.settings) {
              setSettings(data.config.settings);
              if (data.config.settings.isEnabled !== undefined) {
                setIsBotRunning(Boolean(data.config.settings.isEnabled));
              }
            }
            if (data.config.selectedChannels && Array.isArray(data.config.selectedChannels) && data.config.selectedChannels.length > 0) {
              setSelectedChannels(data.config.selectedChannels);
            }
          }
        }
      } catch (err) {
        console.warn("Could not load initial config:", err);
      } finally {
        setIsCheckingSession(false);
      }
    };

    const checkAutoTradeStatus = async () => {
      try {
        const res = await fetch("/api/autotrade/status");
        if (res.ok) {
          const data = await res.json();
          if (data.isActive !== undefined) {
            setIsBotRunning(data.isActive);
          }
          if (data.lastCatchupTimestamp) {
            setLastCatchupTimestamp(data.lastCatchupTimestamp);
          }
        }
      } catch (err) {
        console.warn("Auto-trade status check error:", err);
      }
    };

    const checkSavedTelegramSession = async () => {
      try {
        const res = await fetch("/api/telegram/session-status");
        const data = await res.json();

        if (data.connected && data.user) {
          setIsTelegramConnected(true);
          setTelegramUser(data.user);
          const channelList = data.channels || [];
          setChannels(channelList);
          setTelegramConfig((prev) => ({
            ...prev,
            isConnected: true,
            reActivationRequired: false,
            apiId: data.apiId || prev.apiId,
            apiHash: data.apiHash || prev.apiHash,
            phone: data.phone || prev.phone,
            sessionString: data.sessionString || prev.sessionString,
          }));
        } else if (data.reActivationRequired) {
          setIsTelegramConnected(false);
          setTelegramConfig((prev) => ({
            ...prev,
            isConnected: false,
            reActivationRequired: true,
            reActivationReason: data.reason || "Credentials loaded from database. Re-activation required.",
            apiId: data.apiId || prev.apiId,
            apiHash: data.apiHash || prev.apiHash,
            phone: data.phone || prev.phone,
          }));
        }
      } catch (err) {
        console.error("Failed to check saved Telegram session:", err);
      }
    };

    loadInitialConfig()
      .then(() => checkAutoTradeStatus())
      .then(() => checkSavedTelegramSession());
  }, []);

  // 1.5 Hydrate all configuration from database
  const handleHydrateFromSupabase = async () => {
    try {
      const res = await fetch("/api/config");
      const data = await res.json();
      if (data.success && data.config) {
        const { telegram, iqOption, settings: s, selectedChannels: sc } = data.config;
        if (telegram) {
          setTelegramConfig((prev) => ({
            ...prev,
            ...telegram,
            isConnected: Boolean(telegram.isConnected),
          }));
        }
        if (iqOption) {
          setIQConfig((prev) => ({
            ...prev,
            ...iqOption,
            isConnected: Boolean(iqOption.isConnected),
          }));
        }
        if (s) {
          setSettings((prev) => ({ ...prev, ...s }));
        }
        if (Array.isArray(sc)) {
          setSelectedChannels(sc);
        }
      }
      const tgRes = await fetch("/api/telegram/session-status");
      const tgData = await tgRes.json();
      if (tgData.connected && tgData.user) {
        setIsTelegramConnected(true);
        setTelegramUser(tgData.user);
        if (tgData.channels) setChannels(tgData.channels);
      } else if (tgData.reActivationRequired) {
        setIsTelegramConnected(false);
        setTelegramConfig((prev) => ({
          ...prev,
          isConnected: false,
          reActivationRequired: true,
          reActivationReason: tgData.reason,
        }));
      }
    } catch (e) {
      console.warn("Hydrate from DB error:", e);
    }
  };

  // Close modal on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isSettingsOpen) setIsSettingsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSettingsOpen]);

  // 2. Toggle Auto-Trade Execution State (Always-on active vs. paused)
  const handleToggleAutoTrade = async () => {
    const nextState = !isBotRunning;
    setIsBotRunning(nextState);
    try {
      const res = await fetch("/api/autotrade/toggle", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        setIsBotRunning(data.isEnabled);
        setSettings((prev) => ({ ...prev, isEnabled: data.isEnabled }));
        setGlobalStatusMsg(data.isEnabled ? "Auto-Trade Execution Active (24/7)" : "Auto-Trade Execution Paused");
        setTimeout(() => setGlobalStatusMsg(""), 3000);
      }
    } catch (e: any) {
      console.warn("Toggle auto trade error:", e);
    }
  };

  // 3. Save Settings
  const handleSaveSettings = async () => {
    setIsSavingConfig(true);
    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          telegram: telegramConfig,
          iqOption: iqConfig,
          settings,
          selectedChannels,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setGlobalStatusMsg("Settings saved and synchronized!");
        setTimeout(() => setGlobalStatusMsg(""), 3000);
      }
    } catch (e: any) {
      console.error("Save config error:", e);
    } finally {
      setIsSavingConfig(false);
    }
  };

  // 4. Test IQ Option Connection
  const handleTestIQConnection = async (twoFactorCode?: string) => {
    setIsTestingIQ(true);
    try {
      const activeMode = iqConfig.accountMode || settings.accountMode || "PRACTICE";
      const res = await fetch("/api/iqoption/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: iqConfig.email,
          password: iqConfig.password,
          accountMode: activeMode,
          twoFactorCode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIQConfig((prev) => ({
          ...prev,
          isConnected: true,
          balance: data.balance,
          practiceBalance: data.practiceBalance,
          realBalance: data.realBalance,
          currency: data.currency || "USD",
          accountMode: data.accountMode,
        }));
        setGlobalStatusMsg(`Connected to IQ Option (${data.accountMode} Mode)! Practice: $${(data.practiceBalance ?? 10000).toFixed(2)} | Real: $${(data.realBalance ?? 0).toFixed(2)} ${data.currency || "USD"}`);
        setTimeout(() => setGlobalStatusMsg(""), 5000);
      } else {
        if (data.requires2FA) {
          const userCode = prompt("IQ Option requires 2FA authentication code. Please enter the code sent to your email or authenticator app:");
          if (userCode) {
            handleTestIQConnection(userCode.trim());
            return;
          }
        }
        alert(data.error || "Failed to authenticate with IQ Option. Please verify your credentials.");
      }
    } catch (e: any) {
      console.error("IQ Option test error:", e);
      alert("Error checking broker connection: " + e.message);
    } finally {
      setIsTestingIQ(false);
    }
  };

  // 5. Force Sync IQ Option Live Balance
  const handleSyncIQBalance = async () => {
    try {
      const activeMode = iqConfig.accountMode || settings.accountMode || "PRACTICE";
      const res = await fetch("/api/iqoption/sync-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: iqConfig.email,
          password: iqConfig.password,
          accountMode: activeMode,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIQConfig((prev) => ({
          ...prev,
          isConnected: data.status?.connected || Boolean(data.status?.hasSession) || prev.isConnected,
          balance: data.activeBalance,
          practiceBalance: data.practiceBalance ?? prev.practiceBalance,
          realBalance: data.realBalance ?? prev.realBalance,
          currency: data.currency || prev.currency || "USD",
          accountMode: data.accountMode || prev.accountMode,
        }));
        return data;
      }
      return data;
    } catch (e: any) {
      console.warn("IQ Option live balance sync failed:", e);
      return { success: false, error: e.message };
    }
  };

  // Auto-sync live balance periodically (every 30s) if configured
  useEffect(() => {
    if (!iqConfig.email) return;
    const interval = setInterval(() => {
      handleSyncIQBalance().catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [iqConfig.email, iqConfig.password, iqConfig.accountMode]);

  // 6. Telegram Connect & Disconnect
  const handleTelegramConnectSuccess = (user: TelegramUser, channelList: TelegramChannel[], sessionString: string) => {
    setIsTelegramConnected(true);
    setTelegramUser(user);
    setChannels(channelList);
    
    const autoIds = channelList.map((c) => c.id);
    const combined = Array.from(new Set([...selectedChannels, ...autoIds]));
    setSelectedChannels(combined);

    const updatedTg = {
      ...telegramConfig,
      sessionString,
      phone: user.phone || telegramConfig.phone,
      isConnected: true,
    };
    setTelegramConfig(updatedTg);

    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram: updatedTg,
        selectedChannels: combined,
      }),
    }).catch(console.warn);
  };

  const handleTelegramDisconnect = async () => {
    try {
      await fetch("/api/telegram/disconnect", { method: "POST" });
    } catch (e) {}

    setIsTelegramConnected(false);
    setTelegramUser(null);
    setChannels([]);
    setTelegramConfig((prev) => ({ ...prev, isConnected: false, sessionString: "" }));
  };

  // 7. Channel Management Handlers
  const handleAddChannelId = (channelId: string) => {
    const trimmed = channelId.trim();
    if (!trimmed) return;
    if (!selectedChannels.includes(trimmed)) {
      const next = [...selectedChannels, trimmed];
      setSelectedChannels(next);
      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedChannels: next }),
      }).catch(console.warn);
    }
  };

  const handleRemoveChannelId = (channelId: string) => {
    const next = selectedChannels.filter((id) => id !== channelId);
    setSelectedChannels(next);
    fetch("/api/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectedChannels: next }),
    }).catch(console.warn);
  };

  const handleToggleChannel = (channelId: string) => {
    setSelectedChannels((prev) => {
      const next = prev.includes(channelId)
        ? prev.filter((id) => id !== channelId)
        : [...prev, channelId];
      
      fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedChannels: next }),
      }).catch(console.warn);

      return next;
    });
  };

  // 8. Ingest incoming channel message and parse signal
  const handleIncomingChannelMessage = async (rawText: string, channelName: string = "VIP Signal Feed") => {
    const tz = settings.timeZone || "Africa/Lagos";
    try {
      const res = await fetch("/api/channel-messages/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: rawText,
          channel: channelName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.message) {
          setMonitoredMessages((prev) => {
            const exists = prev.some((m) => m.id === data.message.id || (m.rawText?.trim() === rawText.trim() && m.channelTitle === channelName));
            if (exists) return prev;
            return [data.message, ...prev.slice(0, 150)];
          });

          if (data.identified && data.message.parsedSignal) {
            const newLog: SignalLog = {
              id: "sig-" + data.message.id,
              timestamp: data.message.timestamp,
              sourceChannel: channelName,
              rawText,
              parsed: data.message.parsedSignal,
              status: "IDENTIFIED",
              stake: settings.baseStake,
              accountMode: settings.accountMode,
            };
            setLogs((prev) => [newLog, ...prev.slice(0, 80)]);
          }
        }
      }
    } catch (err) {
      console.warn("Could not sync simulated message to backend:", err);
      // Fallback local creation
      const parsed = parseSignalClient(rawText, tz);
      const isSignal = Boolean(parsed && parsed.asset && parsed.action);
      const newMsg: MonitoredMessage = {
        id: "msg-" + Date.now(),
        channelId: channelName,
        channelTitle: channelName,
        timestamp: formatTimeInTz(Date.now(), tz),
        rawText,
        isSignal,
        matchedKeywords: parsed?.matchedKeywords || [],
        parsedSignal: parsed || undefined,
        status: isSignal ? "IDENTIFIED" : "NON_SIGNAL",
      };
      setMonitoredMessages((prev) => [newMsg, ...prev.slice(0, 150)]);
    }
  };

  // 8B. Clear Message History (Prunes older days, retains current day)
  const handleClearMessages = async (forceAll: boolean = false) => {
    try {
      const res = await fetch(`/api/channel-messages/clear${forceAll ? "?all=true" : ""}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.messages) {
          setMonitoredMessages(data.messages);
        } else if (forceAll) {
          setMonitoredMessages([]);
          setLogs([]);
        }
        setGlobalStatusMsg(data.message || "Message history updated.");
        setTimeout(() => setGlobalStatusMsg(""), 3500);
        return;
      }
    } catch (e) {}

    setGlobalStatusMsg("Channel messages updated.");
    setTimeout(() => setGlobalStatusMsg(""), 2500);
  };

  // 8C. Trigger Catchup Backfill for Missed Messages
  const handleSyncCatchup = async () => {
    try {
      const res = await fetch("/api/telegram/catchup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (data.success) {
        setLastCatchupTimestamp(Date.now());
        const msgRes = await fetch("/api/channel-messages");
        if (msgRes.ok) {
          const msgData = await msgRes.json();
          if (msgData.messages) setMonitoredMessages(msgData.messages);
        }
      }
      return data;
    } catch (err: any) {
      return { success: false, error: err.message || String(err) };
    }
  };

  // 9. Real-Time Server-Sent Events (SSE) + Continuous Synchronization Engine
  useEffect(() => {
    let isMounted = true;
    let eventSource: EventSource | null = null;

    const performSync = async () => {
      try {
        const [msgRes, tradesRes] = await Promise.all([
          fetch("/api/channel-messages"),
          fetch("/api/trades"),
        ]);

        if (msgRes.ok) {
          const data = await msgRes.json();
          if (data.messages && Array.isArray(data.messages) && isMounted) {
            // Deduplicate incoming messages array
            const seen = new Set<string>();
            const uniqueList: MonitoredMessage[] = [];
            for (const m of data.messages) {
              if (!seen.has(m.id)) {
                seen.add(m.id);
                uniqueList.push(m);
              }
            }

            setMonitoredMessages(uniqueList);
            setIsReconnecting(false);

            const detectedLogs: SignalLog[] = uniqueList
              .filter((m: any) => m.isSignal && m.parsedSignal)
              .map((m: any) => ({
                id: "sig-" + m.id,
                timestamp: m.timestamp,
                sourceChannel: m.channelTitle || m.channelId || "VIP Signal Feed",
                rawText: m.rawText,
                parsed: m.parsedSignal,
                status: "IDENTIFIED" as const,
                stake: settings.baseStake,
                accountMode: settings.accountMode,
              }));

            setLogs(detectedLogs);
          }
        } else {
          if (isMounted) setIsReconnecting(true);
        }

        if (tradesRes.ok) {
          const tradeData = await tradesRes.json();
          if (tradeData.trades && Array.isArray(tradeData.trades) && isMounted) {
            setAllTrades(tradeData.trades);
          }
        }
      } catch (err) {
        if (isMounted) setIsReconnecting(true);
      }
    };

    // Fast initial fetch
    performSync();

    // ⚡ INSTANT LIVE SSE STREAM: Connect to server EventSource for sub-millisecond push
    try {
      eventSource = new EventSource("/api/channel-messages/stream");

      eventSource.onopen = () => {
        if (isMounted) {
          setIsReconnecting(false);
          console.log("⚡ SSE Real-Time Channel Message & Trade Stream Connected");
        }
      };

      eventSource.onmessage = (event) => {
        try {
          if (!event.data || !isMounted) return;
          const parsed = JSON.parse(event.data);

          // 1. Live Message Arrived
          if (parsed.type === "NEW_MESSAGE" && parsed.message) {
            const incoming: MonitoredMessage = parsed.message;

            setMonitoredMessages((prev) => {
              // If already exists, update it
              const idx = prev.findIndex(
                (m) => m.id === incoming.id || 
                (m.telegramMsgId && m.telegramMsgId === incoming.telegramMsgId && m.channelId === incoming.channelId)
              );
              if (idx >= 0) {
                const updated = [...prev];
                updated[idx] = { ...prev[idx], ...incoming };
                return updated;
              }
              return [incoming, ...prev.slice(0, 150)];
            });

            if (incoming.isSignal && incoming.parsedSignal) {
              if (isSoundEnabled) {
                playSignalAlertSound();
              }
              const newLog: SignalLog = {
                id: "sig-" + incoming.id,
                timestamp: incoming.timestamp,
                sourceChannel: incoming.channelTitle || incoming.channelId || "VIP Signal Feed",
                rawText: incoming.rawText,
                parsed: incoming.parsedSignal,
                status: "IDENTIFIED",
                stake: settings.baseStake,
                accountMode: settings.accountMode,
              };
              setLogs((prev) => {
                if (prev.some((l) => l.id === newLog.id || l.rawText === newLog.rawText)) {
                  return prev;
                }
                return [newLog, ...prev.slice(0, 80)];
              });
            }
          }

          // 2. ⭐ Live Trade Execution Status Update Arrived (Real-Time Play-out & Exit Alert)
          if (parsed.type === "TRADE_UPDATE" && parsed.trade) {
            const updatedTrade: TradeRecord = parsed.trade;

            // Audio blip on broker execution
            if (updatedTrade.state === "OPEN" && isSoundEnabled) {
              playTradeExecutedSound();
            }

            // Update allTrades array
            setAllTrades((prev) => {
              const idx = prev.findIndex((t) => t.id === updatedTrade.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updatedTrade;
                return next;
              }
              return [updatedTrade, ...prev];
            });

            // Update monitored messages to reflect live active/terminal states immediately
            setMonitoredMessages((prev) => {
              return prev.map((m) => {
                if (
                  m.tradeRecord?.id === updatedTrade.id ||
                  m.tradeRecord?.signalId === updatedTrade.signalId ||
                  m.id === updatedTrade.signalId ||
                  m.id === `sig-${updatedTrade.id}` ||
                  (m.tradeRecord?.deterministicKey && m.tradeRecord.deterministicKey === updatedTrade.deterministicKey)
                ) {
                  return {
                    ...m,
                    tradeRecord: { ...updatedTrade },
                    status: updatedTrade.state,
                  };
                }
                return m;
              });
            });

            // ⭐ CHECK FOR TERMINAL EXIT NOTIFICATION & CHIME (WIN / LOSS / DRAW)
            if (
              updatedTrade.state === "WIN" ||
              updatedTrade.state === "LOSS" ||
              updatedTrade.state === "DRAW"
            ) {
              const isWin = updatedTrade.state === "WIN" || updatedTrade.outcome === "WIN";
              const isLoss = updatedTrade.state === "LOSS" || updatedTrade.outcome === "LOSS";

              // 🔊 Audio Chime
              if (isSoundEnabled) {
                if (isWin) {
                  playTradeWinSound();
                } else if (isLoss) {
                  playTradeLossSound();
                }
              }

              // 🔔 Browser System Push Notification
              if (isNotificationEnabled) {
                sendTradeExitNotification({
                  asset: updatedTrade.asset,
                  action: updatedTrade.action,
                  outcome: updatedTrade.state as any,
                  profit: updatedTrade.profit,
                  stake: updatedTrade.stake,
                  managementLevel: updatedTrade.managementLevel || 0,
                  orderId: updatedTrade.orderId,
                  accountMode: updatedTrade.accountMode,
                });
              }

              // 🟢 Live Interactive Toast Alert
              const toastTitle = isWin
                ? `WIN: +$${(updatedTrade.profit || updatedTrade.stake * 0.87).toFixed(2)} (${updatedTrade.asset})`
                : isLoss
                ? `LOSS: -$${updatedTrade.stake.toFixed(2)} (${updatedTrade.asset})`
                : `DRAW: ${updatedTrade.asset} Refunded`;

              const toastMsg = isWin
                ? `${updatedTrade.action} on ${updatedTrade.asset} settled ITM! Order #${updatedTrade.orderId || "N/A"}`
                : isLoss
                ? `${updatedTrade.action} on ${updatedTrade.asset} finished OTM.`
                : `Trade returned stake.`;

              setActiveToast({
                id: `${updatedTrade.id}-${Date.now()}`,
                title: toastTitle,
                message: toastMsg,
                type: updatedTrade.state as any,
              });

              setTimeout(() => {
                setActiveToast(null);
              }, 6500);
            }
          }
        } catch (e) {
          console.warn("SSE event parsing error:", e);
        }
      };

      eventSource.onerror = () => {
        if (isMounted) {
          // SSE auto-reconnects, but mark reconnecting briefly
          setIsReconnecting(true);
        }
      };
    } catch (e) {
      console.warn("EventSource setup notice:", e);
    }

    // Polling fallback to guarantee state synchronization (every 2.5 seconds)
    const syncInterval = setInterval(performSync, 2500);

    return () => {
      isMounted = false;
      if (eventSource) {
        eventSource.close();
      }
      clearInterval(syncInterval);
    };
  }, [settings.baseStake, settings.accountMode]);

  // Window Focus / Tab Wakeup Handler: re-requests wakeLock and triggers immediate catchup backfill
  useEffect(() => {
    const handleWakeup = () => {
      if (document.visibilityState === "visible") {
        requestWakeLock().catch(() => {});
        handleSyncCatchup().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleWakeup);
    window.addEventListener("focus", handleWakeup);

    return () => {
      document.removeEventListener("visibilitychange", handleWakeup);
      window.removeEventListener("focus", handleWakeup);
    };
  }, [requestWakeLock]);

  const supabaseConfig = getSupabaseConfig();
  const isDatabaseConnected = Boolean(supabaseConfig.url && supabaseConfig.anonKey);

  // Clear all recorded trades and performance metrics
  const handleClearTrades = async () => {
    try {
      await fetch("/api/trades/clear", { method: "POST" });
      setAllTrades([]);
      setMonitoredMessages((prev) =>
        prev.map((m) => {
          const next = { ...m };
          delete next.tradeRecord;
          return next;
        })
      );
      setGlobalStatusMsg("Trade statistics and performance ledger reset.");
      setTimeout(() => setGlobalStatusMsg(""), 3000);
    } catch (e) {
      console.warn("Failed to clear trades:", e);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-emerald-500 selection:text-slate-950 relative">
      
      {/* 🔔 LIVE FLOATING TRADE EXIT TOAST NOTIFICATION */}
      {activeToast && (
        <div className="fixed top-16 right-4 z-50 max-w-sm w-full animate-fade-in shadow-2xl">
          <div className={`p-4 rounded-2xl border backdrop-blur-md flex items-start gap-3 transition-all ${
            activeToast.type === "WIN"
              ? "bg-emerald-950/95 border-emerald-500/80 text-white"
              : activeToast.type === "LOSS"
              ? "bg-rose-950/95 border-rose-500/80 text-white"
              : "bg-slate-900/95 border-slate-700 text-white"
          }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
              activeToast.type === "WIN"
                ? "bg-emerald-500/20 text-emerald-400"
                : activeToast.type === "LOSS"
                ? "bg-rose-500/20 text-rose-400"
                : "bg-slate-800 text-slate-300"
            }`}>
              {activeToast.type === "WIN" ? (
                <ArrowUpRight className="w-5 h-5" />
              ) : activeToast.type === "LOSS" ? (
                <ArrowDownRight className="w-5 h-5" />
              ) : (
                <Clock className="w-5 h-5" />
              )}
            </div>

            <div className="flex-1 min-w-0 pr-1">
              <h4 className="text-xs font-bold font-mono uppercase tracking-wide flex items-center gap-1.5">
                <span>{activeToast.title}</span>
              </h4>
              <p className="text-[11px] text-slate-200 mt-0.5 leading-tight font-medium">
                {activeToast.message}
              </p>
            </div>

            <button
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* 1. TOP HEADER */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur-md sticky top-0 z-30 px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-emerald-500 to-sky-500 flex items-center justify-center text-slate-950 font-bold shadow-md shrink-0">
            <Bot className="w-4 h-4 fill-current" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold text-white tracking-tight truncate">SignalBot</h1>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border flex items-center gap-1 tracking-wider shrink-0 ${
                (iqConfig.accountMode === "REAL" || settings.accountMode === "REAL")
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  (iqConfig.accountMode === "REAL" || settings.accountMode === "REAL") ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                }`} />
                <span>{(iqConfig.accountMode === "REAL" || settings.accountMode === "REAL") ? "LIVE" : "DEMO"}</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block truncate">
              Always-On Telegram VIP Signal Listener &bull; 8s Continuous Catchup Sync &bull; IQ Option Bot
            </p>
          </div>
        </div>

        {/* Status Indicators & Settings */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* PWA Direct Header Install Button */}
          {isInstallable && !isInstalled && (
            <button
              type="button"
              onClick={promptInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-600 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer mr-1"
              title="Install SignalBot as standalone app on your device"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Install App</span>
            </button>
          )}

          {/* Cloud Database Status */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`relative flex items-center justify-center w-8 h-8 rounded-xl border transition-all cursor-pointer ${
              isDatabaseConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
            title={isDatabaseConnected ? "Cloud Database: Active & Synced" : "Database: Local Storage Mode"}
          >
            <Cloud className="w-4 h-4" />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
              isDatabaseConnected ? "bg-emerald-400 ring-2 ring-emerald-500/20" : "bg-slate-500"
            }`} />
          </button>

          {/* IQ Option Status */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`relative flex items-center justify-center w-8 h-8 rounded-xl border transition-all cursor-pointer ${
              iqConfig.isConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
            title={iqConfig.isConnected ? `IQ Option: Connected (${iqConfig.accountMode})` : "IQ Option: Offline"}
          >
            <TrendingUp className="w-4 h-4" />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
              iqConfig.isConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
            }`} />
          </button>

          {/* Telegram Status */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className={`relative flex items-center justify-center w-8 h-8 rounded-xl border transition-all cursor-pointer ${
              isTelegramConnected
                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-400"
                : "bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700"
            }`}
            title={isTelegramConnected ? "Telegram: Connected & Listening 24/7" : "Telegram: Offline"}
          >
            <Send className="w-4 h-4 -rotate-12" />
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full border border-slate-950 ${
              isTelegramConnected ? "bg-emerald-400 animate-pulse" : "bg-slate-500"
            }`} />
          </button>

          {/* Direct Settings Gear */}
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="flex items-center justify-center w-8 h-8 rounded-xl border border-slate-800 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white transition-all ml-0.5"
            title="Open Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Re-Activation Notification Banner */}
      {!isTelegramConnected && telegramConfig.reActivationRequired && (
        <div 
          onClick={() => setIsSettingsOpen(true)}
          className="bg-amber-950/80 border-b border-amber-800/60 text-amber-200 text-xs px-4 py-2.5 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-900/60 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span className="font-bold">Database Sync Notice:</span>
            <span>Telegram credentials loaded from database for {telegramConfig.phone || "saved account"}. 1-click re-activation required for this device/IP.</span>
          </div>
          <span className="text-[11px] font-bold underline text-amber-300 shrink-0">Click to Re-activate &rarr;</span>
        </div>
      )}

      {/* Global Status Banner Notification */}
      {globalStatusMsg && (
        <div className="bg-emerald-600 text-slate-950 text-xs font-bold px-4 py-2 text-center flex items-center justify-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          <span>{globalStatusMsg}</span>
        </div>
      )}

      {/* 2. MAIN UNIFIED AUTO-TRADE & REAL-TIME LISTENER VIEW */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-3.5 sm:p-6 pb-8 sm:pb-12">
        <BotDashboard
          isBotRunning={isBotRunning}
          onToggleBot={handleToggleAutoTrade}
          isTelegramConnected={isTelegramConnected}
          isIQConnected={Boolean(iqConfig.isConnected)}
          monitoredChannelCount={selectedChannels.length}
          selectedChannels={selectedChannels}
          channels={channels}
          settings={settings}
          onUpdateSettings={(newVals) => {
            const updated = { ...settings, ...newVals };
            setSettings(updated);
            if (newVals.accountMode) {
              setIQConfig((prev) => ({ ...prev, accountMode: newVals.accountMode! }));
              fetch("/api/iqoption/change-account-mode", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accountMode: newVals.accountMode }),
              }).catch(() => {});
            }
            fetch("/api/config", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ settings: updated }),
            }).catch(console.warn);
          }}
          logs={logs}
          monitoredMessages={monitoredMessages}
          onManualSignalSubmit={(text, ch) => handleIncomingChannelMessage(text, ch || selectedChannels[0] || "VIP Signal Feed")}
          onClearMessages={handleClearMessages}
          onNavigateToSettings={() => setIsSettingsOpen(true)}
          onSyncCatchup={handleSyncCatchup}
          isWakeLockActive={isWakeLockActive}
          onToggleWakeLock={toggleWakeLock}
          lastCatchupTimestamp={lastCatchupTimestamp}
          isReconnecting={isReconnecting}
          allTrades={allTrades}
          onClearStats={handleClearTrades}
          isNotificationEnabled={isNotificationEnabled}
          onToggleNotification={handleToggleNotification}
          isSoundEnabled={isSoundEnabled}
          onToggleSound={() => setIsSoundEnabled(!isSoundEnabled)}
          isInstallable={isInstallable}
          isInstalled={isInstalled}
          onPromptInstall={promptInstall}
        />
      </main>

      {/* 3. SETTINGS MODAL DIALOG */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
          <div 
            className="bg-slate-900 border border-slate-800 w-full max-w-3xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-900/90">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Sliders className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-white tracking-tight">Project Settings</h2>
                  <p className="text-[11px] text-slate-400">Configure IQ Option, Telegram Telethon, Channels & Risk Parameters</p>
                </div>
              </div>

              <button
                onClick={() => setIsSettingsOpen(false)}
                className="w-8 h-8 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors border border-slate-700 cursor-pointer"
                title="Close (Esc)"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <SettingsTab
                settings={settings}
                iqConfig={iqConfig}
                telegramConfig={telegramConfig}
                telegramUser={telegramUser}
                channels={channels}
                selectedChannels={selectedChannels}
                onUpdateSettings={(newVals) => setSettings((prev) => ({ ...prev, ...newVals }))}
                onUpdateIQConfig={(newIQ) => {
                  setIQConfig((prev) => ({ ...prev, ...newIQ }));
                  if (newIQ.accountMode) {
                    setSettings((prev) => ({ ...prev, accountMode: newIQ.accountMode! }));
                  }
                }}
                onUpdateTelegramConfig={(newTg) => setTelegramConfig((prev) => ({ ...prev, ...newTg }))}
                onAddChannelId={handleAddChannelId}
                onRemoveChannelId={handleRemoveChannelId}
                onToggleChannel={handleToggleChannel}
                onSaveSettings={handleSaveSettings}
                onTestIQConnection={handleTestIQConnection}
                onTelegramConnectSuccess={handleTelegramConnectSuccess}
                onTelegramDisconnect={handleTelegramDisconnect}
                onHydrateFromDatabase={handleHydrateFromSupabase}
                isSaving={isSavingConfig}
                isTestingIQ={isTestingIQ}
                isWakeLockActive={isWakeLockActive}
                isWakeLockSupported={isWakeLockSupported}
                onToggleWakeLock={toggleWakeLock}
                isSoundEnabled={isSoundEnabled}
                onToggleSound={() => setIsSoundEnabled(!isSoundEnabled)}
                isNotificationEnabled={isNotificationEnabled}
                onToggleNotification={handleToggleNotification}
                isInstallable={isInstallable}
                isInstalled={isInstalled}
                onPromptInstall={promptInstall}
                isIOS={isIOS}
              />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
