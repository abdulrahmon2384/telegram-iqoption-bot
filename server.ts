import express from "express";
import path from "path";
import { execFile, exec } from "child_process";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import {
  validateGateway,
  sendTelegramCode,
  verifyTelegramCode,
  validateTelegramSession,
  startLiveTelegramListener,
  stopLiveTelegramListener,
  getTelegramListenerStatus,
  backfillMissedMessages,
  IngestedTelegramMessage,
} from "./server/telegram_service";
import {
  TradeExecutionEngine,
  TradeRecord,
  normalizeAssetForIQ
} from "./server/execution_engine";
import { globalIQClient } from "./server/iqoption_client";
import {
  formatTimeInTz,
  formatDateInTz,
  getActiveTimezone,
  setActiveTimezone,
  calculateLevel3TargetTimer,
  getNearestValidIQTimeframe,
  calculateMinutesDiff,
  VALID_IQ_TIMEFRAMES,
} from "./server/timezone_helper";

// Global error handlers to intercept and silence background MTProto socket TIMEOUTs
process.on("unhandledRejection", (reason: any) => {
  if (reason?.message === "TIMEOUT" || String(reason).includes("TIMEOUT")) {
    return; // Handled transient GramJS update ping timeout
  }
  console.warn("[Server Warning] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err: any) => {
  if (err?.message === "TIMEOUT" || String(err).includes("TIMEOUT")) {
    return; // Handled transient GramJS update ping timeout
  }
  console.error("[Server Error] Uncaught Exception:", err);
});

interface SignalParseRequest {
  text: string;
}

interface SignalParseResult {
  success: boolean;
  rawText: string;
  asset?: string;
  action?: "CALL" | "PUT";
  timeframe?: string; // e.g. "M1", "M5", "M15"
  durationMinutes?: number;
  entryType?: "NOW" | "SCHEDULED";
  scheduledTime?: string;
  martingaleSteps?: number;
  confidence: number;
  notes?: string[];
  error?: string;
}

// Helper to strip markdown and telegram HTML formatting
function cleanRawTelegramText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ") // Remove HTML tags like <b>, <code>
    .replace(/[*_`~#]/g, " ") // Remove Markdown markers
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim();
}

// Resilient multi-format signal parser
export function parseTradingSignal(text: string): SignalParseResult {
  if (!text || typeof text !== "string") {
    return { success: false, rawText: "", confidence: 0, error: "Empty signal text provided" };
  }

  const rawClean = text.trim();
  const normalizedText = cleanRawTelegramText(text);
  const upper = normalizedText.toUpperCase();
  const notes: string[] = [];
  const isOTC = upper.includes("(OTC)") || upper.includes("-OTC") || upper.includes("_OTC") || /\bOTC\b/.test(upper);

  // 1. DETECT ASSET / CURRENCY PAIR (Always mapped to OTC for OTC-only Trading Bot)
  let asset = "";

  // 1A. Check structured line e.g. "Trade: EUR/USD (OTC)", "Par: GBPUSD", "Asset: AUD/CAD"
  const tradeLineMatch = rawClean.match(/(?:Trade|Par|Asset|Pair|Ativo|Currency|Moeda|Symbol)\s*[:=-]\s*([^\n\r,;]+)/i);
  if (tradeLineMatch) {
    const rawTradeLine = tradeLineMatch[1].toUpperCase();
    const pairInLine = rawTradeLine.match(/([A-Z]{3})[\/_ -]?([A-Z]{3})/);
    if (pairInLine) {
      asset = `${pairInLine[1]}${pairInLine[2]}-OTC`;
      notes.push(`Asset Identified from Header: ${asset}`);
    } else {
      const cryptoMatch = rawTradeLine.match(/\b(BTC|ETH|LTC|XRP|SOL|DOGE|XAU|GOLD)[\/_ -]?(USD|USDT)?\b/);
      if (cryptoMatch) {
        asset = `${cryptoMatch[1]}${cryptoMatch[2] || "USD"}-OTC`;
        notes.push(`Crypto/Commodity Asset: ${asset}`);
      }
    }
  }

  // 1B. Fallback: Search anywhere in the message for currency pairs or crypto
  if (!asset) {
    const pairMatch = upper.match(/\b([A-Z]{3})[\/_ -]?([A-Z]{3})(?:[-_ ]?OTC)?\b/);
    if (pairMatch) {
      const c1 = pairMatch[1];
      const c2 = pairMatch[2];
      const validCurrencies = ["EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "BRL", "TRY", "ZAR", "MXN", "INR", "NGN", "CNY", "HKD", "SGD"];
      if (validCurrencies.includes(c1) || validCurrencies.includes(c2)) {
        asset = `${c1}${c2}-OTC`;
        notes.push(`Detected Currency Pair: ${asset}`);
      }
    }
  }

  // 1C. Popular pairs dictionary fallback
  if (!asset) {
    const popularPairs = [
      "EURUSD", "GBPUSD", "USDJPY", "AUDCAD", "AUDJPY", "NZDUSD", "USDCHF", "USDCAD",
      "EURJPY", "GBPJPY", "EURGBP", "AUDUSD", "EURAUD", "EURCAD", "GBPCHF", "GBPAUD",
      "NZDCAD", "NZDCHF", "NZDJPY", "AUDNZD", "AUDCHF", "CADCHF", "CADJPY", "CHFJPY",
      "BTCUSD", "ETHUSD", "XAUUSD", "USDBRL", "USDTRY"
    ];
    for (const p of popularPairs) {
      if (upper.replace(/[\/_ -]/g, "").includes(p)) {
        asset = `${p}-OTC`;
        notes.push(`Found Asset in Dictionary: ${asset}`);
        break;
      }
    }
  }

  // 2. DETECT ACTION (Direction: CALL / PUT)
  let action: "CALL" | "PUT" | undefined = undefined;

  // 2A. Check structured direction line e.g. "Direction: BUY 🟩", "Dir: PUT 🔴"
  const directionLineMatch = rawClean.match(/(?:Direction|Dir|Action|Direção|Direcao|Order|Side|Tipo)\s*[:=-]\s*([^\n\r]+)/i);
  if (directionLineMatch) {
    const dirContent = directionLineMatch[1].toUpperCase();
    if (
      dirContent.includes("BUY") || dirContent.includes("CALL") || dirContent.includes("COMPRA") ||
      dirContent.includes("ALTA") || dirContent.includes("SUBE") || dirContent.includes("ARRIBA") ||
      dirContent.includes("🟩") || dirContent.includes("🟢") || dirContent.includes("🔼") || dirContent.includes("⬆️")
    ) {
      action = "CALL";
      notes.push("Direction from Header: CALL (BUY) 🟩");
    } else if (
      dirContent.includes("SELL") || dirContent.includes("PUT") || dirContent.includes("VENDA") ||
      dirContent.includes("BAIXA") || dirContent.includes("BAJA") || dirContent.includes("ABAJO") ||
      dirContent.includes("🟥") || dirContent.includes("🔴") || dirContent.includes("🔽") || dirContent.includes("⬇️")
    ) {
      action = "PUT";
      notes.push("Direction from Header: PUT (SELL) 🟥");
    }
  }

  // 2B. Direct keyword scanning anywhere in the message
  if (!action) {
    if (
      /\b(CALL|BUY|HIGHER|UP|BUYING|COMPRA|ALTA|SUBE|ARRIBA|VERDE)\b/i.test(normalizedText) ||
      rawClean.includes("🟩") || rawClean.includes("🟢") || rawClean.includes("🔼") || rawClean.includes("⬆️")
    ) {
      action = "CALL";
      notes.push("Direction: CALL (BUY / HIGHER)");
    } else if (
      /\b(PUT|SELL|LOWER|DOWN|SELLING|VENDA|BAIXA|BAJA|ABAJO|ROJO)\b/i.test(normalizedText) ||
      rawClean.includes("🟥") || rawClean.includes("🔴") || rawClean.includes("🔽") || rawClean.includes("⬇️")
    ) {
      action = "PUT";
      notes.push("Direction: PUT (SELL / LOWER)");
    }
  }

  // 3. DETECT SCHEDULED ENTRY TIME
  let entryType: "NOW" | "SCHEDULED" = "NOW";
  let scheduledTime: string | undefined = undefined;

  const entryLineMatch = rawClean.match(/(?:Entry|Entry\s*Time|Time|Hora|Horário|Horario|Start|At|Início)\s*[:=-]\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (entryLineMatch) {
    scheduledTime = entryLineMatch[1].trim();
    entryType = "SCHEDULED";
    notes.push(`Scheduled Entry Time: ${scheduledTime}`);
  } else {
    const timeMatch = upper.match(/\b([0-2]?[0-9]:[0-5][0-9](?:\s*(?:AM|PM))?)\b/);
    if (timeMatch && !upper.includes("EXPIRY") && !upper.includes("EXP")) {
      scheduledTime = timeMatch[1].trim();
      entryType = "SCHEDULED";
      notes.push(`Entry Schedule: ${scheduledTime}`);
    } else {
      entryType = "NOW";
      notes.push("Entry: Immediate (NOW)");
    }
  }

  // 4. DETECT BASE TIMER & CALCULATE LEVEL 3 TARGET TIMER
  let baseTimerMinutes = 5;
  const timerLineMatch = rawClean.match(/(?:Timer|Expiry|Expiration|Timeframe|TF|Exp|Expiração|Tempo|Duracao)\s*[:=-]\s*(\d+)\s*(?:minutes?|mins?|m)?/i);
  if (timerLineMatch) {
    baseTimerMinutes = parseInt(timerLineMatch[1], 10);
  } else {
    const tfMatch = upper.match(/\b(M1|M2|M5|M15|M30|H1|1M|2M|5M|15M|30M|1\s*MIN(?:UTE)?S?|2\s*MIN(?:UTE)?S?|5\s*MIN(?:UTE)?S?|15\s*MIN(?:UTE)?S?)\b/);
    if (tfMatch) {
      const matched = tfMatch[1].replace(/\s+/g, "");
      if (matched.includes("1M") || matched.includes("M1") || matched.includes("1MIN")) baseTimerMinutes = 1;
      else if (matched.includes("2M") || matched.includes("M2") || matched.includes("2MIN")) baseTimerMinutes = 2;
      else if (matched.includes("5M") || matched.includes("M5") || matched.includes("5MIN")) baseTimerMinutes = 5;
      else if (matched.includes("15M") || matched.includes("M15") || matched.includes("15MIN")) baseTimerMinutes = 15;
      else if (matched.includes("30M") || matched.includes("M30") || matched.includes("30MIN")) baseTimerMinutes = 30;
      else if (matched.includes("H1") || matched.includes("60M")) baseTimerMinutes = 60;
    }
  }

  // Level 3 Target Calculation:
  // Duration is calculated from Entry time to Level 3 time (e.g. 4:24 PM to 4:30 PM = 6m).
  // If the calculated duration isn't a valid IQ Option timeframe, fall back to nearest valid timeframe (e.g. 6m -> 5m / M5).
  const l3TimerResult = calculateLevel3TargetTimer(rawClean, scheduledTime, baseTimerMinutes);
  const durationMinutes = l3TimerResult.durationMinutes;
  const timeframe = l3TimerResult.timeframe;

  if (l3TimerResult.level3TimeStr && scheduledTime) {
    notes.push(`🎯 Level 3 Timer Target: Entry ${scheduledTime} to Level 3 ${l3TimerResult.level3TimeStr} = ${l3TimerResult.calculatedMinutes}m (IQ Valid Fallback: ${timeframe} - ${durationMinutes} min)`);
  } else {
    notes.push(`🎯 Timer Target: ${l3TimerResult.method}`);
  }

  // 5. ENFORCE STRICT SINGLE TRADE (NO MARTINGALE RETAKES)
  // Per user instruction: No martingale retakes. Exactly 1 single trade per signal.
  const martingaleSteps = 0;
  notes.push("🛡️ Single Trade Rule: Martingale retakes disabled. Exactly 1 single trade executed.");

  if (!asset) {
    return {
      success: false,
      rawText: rawClean,
      confidence: 0.2,
      error: "Could not identify valid currency pair or asset name in signal."
    };
  }

  if (!action) {
    return {
      success: false,
      rawText: rawClean,
      asset,
      confidence: 0.4,
      error: "Could not identify trade direction (CALL or PUT) in signal."
    };
  }

  return {
    success: true,
    rawText: rawClean,
    asset,
    action,
    timeframe,
    durationMinutes,
    entryType,
    scheduledTime,
    martingaleSteps,
    confidence: 0.96,
    notes
  };
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  app.use(express.json());

  // Supabase Configuration from Environment
  const SUPABASE_URL = (process.env.VITE_SUPABASE_URL || "").replace(/\/$/, "");
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
  const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);

  // File path for local persistent Telegram session and configuration
  const SESSION_FILE = path.join(process.cwd(), "telegram_session.json");
  const CONFIG_FILE = path.join(process.cwd(), "bot_config.json");

  // Robust helper to safely read and parse JSON files without throwing SyntaxErrors on empty or corrupted files
  function safeReadJsonFile<T = any>(filePath: string, fallback: T): T {
    try {
      if (!fs.existsSync(filePath)) {
        return fallback;
      }
      const raw = fs.readFileSync(filePath, "utf-8").trim();
      if (!raw) {
        return fallback;
      }
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  // Robust helper to safely write JSON files
  function safeWriteJsonFile(filePath: string, data: any): boolean {
    try {
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
      return true;
    } catch (e) {
      console.warn(`[Storage Warning] Error writing file ${filePath}:`, e);
      return false;
    }
  }

  // Supabase REST Helper
  const supabaseFetch = async (endpoint: string, options: any = {}) => {
    if (!isSupabaseConfigured) return null;
    try {
      const headers = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
        ...options.headers,
      };
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        ...options,
        headers,
      });
      if (!res.ok) {
        const text = await res.text();
        // If table does not exist in user's Supabase instance yet (PGRST205 or 404), silently return null to trigger graceful fallback
        if (res.status !== 404 && !text.includes("PGRST205") && !text.includes("schema cache")) {
          console.warn(`Supabase REST [${endpoint}]:`, res.status, text);
        }
        return null;
      }
      return await res.json();
    } catch (e) {
      return null;
    }
  };

  // Helper to load saved session from Supabase or local cache
  const getSavedSession = async () => {
    // 1. Try reading from Supabase telegram_auth or bot_settings first if configured
    if (isSupabaseConfigured) {
      try {
        const sbData = await supabaseFetch("telegram_auth?is_active=eq.true&order=updated_at.desc&limit=1");
        if (sbData && Array.isArray(sbData) && sbData.length > 0) {
          const row = sbData[0];
          const sessionObj = {
            apiId: row.api_id,
            apiHash: row.api_hash,
            phone: row.phone,
            sessionString: row.session_string,
            user: {
              id: row.user_id,
              phone: row.phone,
              username: row.username,
              firstName: row.first_name,
            },
            channels: [],
            connectedAt: row.updated_at,
          };
          // Hydrate local cache
          try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionObj, null, 2), "utf-8"); } catch (e) {}
          return sessionObj;
        }

        // Check if stored in bot_settings
        const sbSettings = await supabaseFetch("bot_settings?id=eq.main_config&limit=1");
        if (sbSettings && Array.isArray(sbSettings) && sbSettings.length > 0) {
          const row = sbSettings[0];
          if (row.telegram_session || (row.telegram_api_id && row.telegram_phone)) {
            const sessionObj = {
              apiId: row.telegram_api_id,
              apiHash: row.telegram_api_hash,
              phone: row.telegram_phone,
              sessionString: row.telegram_session || "",
              user: row.telegram_user || { phone: row.telegram_phone },
              channels: [],
              connectedAt: row.updated_at,
            };
            try { fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionObj, null, 2), "utf-8"); } catch (e) {}
            return sessionObj;
          }
        }
      } catch (err) {
        console.warn("Supabase session retrieval error:", err);
      }
    }

    // 2. Fallback to local session file
    const parsed = safeReadJsonFile(SESSION_FILE, null);
    if (parsed && typeof parsed === "object" && (parsed.sessionString || parsed.apiId)) {
      return parsed;
    }
    return null;
  };

  // Helper to save session to Supabase & local file
  const persistSession = async (data: any) => {
    // 1. Save to Supabase telegram_auth table if configured
    if (isSupabaseConfigured && data.sessionString) {
      try {
        await supabaseFetch("telegram_auth?on_conflict=user_id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            user_id: data.user?.id || data.phone || "user_" + Date.now(),
            phone: data.phone,
            username: data.user?.username || null,
            first_name: data.user?.firstName || "Telegram User",
            session_string: data.sessionString,
            api_id: String(data.apiId),
            api_hash: data.apiHash,
            is_active: true,
            updated_at: new Date().toISOString(),
          }),
        });

        // Also update bot_settings with complete session snapshot
        await supabaseFetch("bot_settings?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            id: "main_config",
            telegram_api_id: String(data.apiId),
            telegram_api_hash: data.apiHash,
            telegram_phone: data.phone,
            telegram_session: data.sessionString,
            telegram_user: data.user,
            telegram_connected: true,
            updated_at: new Date().toISOString(),
          }),
        });
      } catch (err) {
        console.error("Error syncing session to Supabase:", err);
      }
    }

    // 2. Save to local file
    return safeWriteJsonFile(SESSION_FILE, data);
  };

  // 1. GET /api/config -> Retrieve complete app configuration (Telegram, IQ Option, Risk) from DB or local
  app.get("/api/config", async (req, res) => {
    let storedConfig: any = {
      telegram: { apiId: "", apiHash: "", phone: "", isConnected: false },
      iqOption: { email: "", password: "", accountMode: "PRACTICE", isConnected: false },
      settings: {
        isEnabled: true,
        accountMode: "PRACTICE",
        baseStake: 100,
        minPayout: 80,
        martingaleMultiplier: 2.2,
        maxGaleSteps: 1,
        dailyStopLoss: 500,
        dailyTakeProfit: 1000,
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
      },
      selectedChannels: [],
    };

    // 1. First, load existing local config file if it exists
    const parsed = safeReadJsonFile(CONFIG_FILE, null);
    if (parsed && typeof parsed === "object") {
      storedConfig = {
        ...storedConfig,
        ...parsed,
        telegram: { ...storedConfig.telegram, ...(parsed.telegram || {}) },
        iqOption: { ...storedConfig.iqOption, ...(parsed.iqOption || {}) },
        settings: {
          ...storedConfig.settings,
          ...(parsed.settings || {}),
          managementLevels: {
            ...storedConfig.settings.managementLevels,
            ...(parsed.settings?.managementLevels || {}),
          },
        },
        selectedChannels: Array.isArray(parsed.selectedChannels) ? parsed.selectedChannels : storedConfig.selectedChannels,
      };
    }

    // 2. Overlay from Supabase if configured and tables exist
    if (isSupabaseConfigured) {
      try {
        const sbSettings = await supabaseFetch("bot_settings?id=eq.main_config&limit=1");
        if (sbSettings && Array.isArray(sbSettings) && sbSettings.length > 0) {
          const row = sbSettings[0];
          storedConfig.settings = {
            ...storedConfig.settings,
            isEnabled: Boolean(row.bot_enabled),
            accountMode: row.account_mode || storedConfig.settings.accountMode || "PRACTICE",
            baseStake: Number(row.base_stake) || storedConfig.settings.baseStake || 100,
            minPayout: Number(row.min_payout) || storedConfig.settings.minPayout || 80,
            martingaleMultiplier: Number(row.martingale_multiplier) || storedConfig.settings.martingaleMultiplier || 2.2,
            maxGaleSteps: Number(row.max_gale_steps) !== undefined ? Number(row.max_gale_steps) : storedConfig.settings.maxGaleSteps,
            dailyStopLoss: Number(row.daily_stop_loss) || storedConfig.settings.dailyStopLoss || 500,
            dailyTakeProfit: Number(row.daily_take_profit) || storedConfig.settings.dailyTakeProfit || 1000,
          };
          storedConfig.iqOption = {
            email: row.iq_email || storedConfig.iqOption.email || "",
            password: row.iq_password || storedConfig.iqOption.password || "",
            accountMode: row.iq_account_mode || row.account_mode || storedConfig.iqOption.accountMode || "PRACTICE",
            isConnected: Boolean(row.iq_connected),
            balance: (row.iq_account_mode || row.account_mode) === "REAL" ? 1250.0 : 10000.0,
          };
          storedConfig.telegram = {
            apiId: row.telegram_api_id || storedConfig.telegram.apiId || "",
            apiHash: row.telegram_api_hash || storedConfig.telegram.apiHash || "",
            phone: row.telegram_phone || storedConfig.telegram.phone || "",
            isConnected: storedConfig.telegram.isConnected,
            sessionString: storedConfig.telegram.sessionString,
          };
          if (Array.isArray(row.selected_channels) && row.selected_channels.length > 0) {
            storedConfig.selectedChannels = row.selected_channels;
          }
        }

        // Check telegram auth
        const sbTg = await supabaseFetch("telegram_auth?is_active=eq.true&order=updated_at.desc&limit=1");
        if (sbTg && Array.isArray(sbTg) && sbTg.length > 0) {
          storedConfig.telegram.isConnected = true;
          storedConfig.telegram.apiId = storedConfig.telegram.apiId || sbTg[0].api_id;
          storedConfig.telegram.apiHash = storedConfig.telegram.apiHash || sbTg[0].api_hash;
          storedConfig.telegram.phone = storedConfig.telegram.phone || sbTg[0].phone;
          storedConfig.telegram.sessionString = sbTg[0].session_string;
        }
      } catch (err) {}
    }

    // Check local session file if Telegram is connected locally
    const rawSess = safeReadJsonFile(SESSION_FILE, null);
    if (rawSess && rawSess.sessionString) {
      storedConfig.telegram.isConnected = true;
      storedConfig.telegram.apiId = storedConfig.telegram.apiId || rawSess.apiId;
      storedConfig.telegram.apiHash = storedConfig.telegram.apiHash || rawSess.apiHash;
      storedConfig.telegram.phone = storedConfig.telegram.phone || rawSess.phone;
      storedConfig.telegram.sessionString = rawSess.sessionString;
    }

    // Sync live IQ Option status if broker is connected
    const iqStatus = globalIQClient.getStatus();
    if (iqStatus.connected && iqStatus.user) {
      storedConfig.iqOption.isConnected = true;
      storedConfig.iqOption.email = iqStatus.email || storedConfig.iqOption.email;
      storedConfig.iqOption.accountMode = iqStatus.accountMode;
      storedConfig.iqOption.balance = iqStatus.activeBalance;
      storedConfig.iqOption.practiceBalance = iqStatus.balances.PRACTICE;
      storedConfig.iqOption.realBalance = iqStatus.balances.REAL;
      storedConfig.iqOption.currency = iqStatus.balances.currency || "USD";
    }

    res.json({
      success: true,
      config: storedConfig,
      isSupabaseConfigured,
      storageMode: isSupabaseConfigured ? "SUPABASE_POSTGRESQL" : "LOCAL_FILE_STORAGE",
    });
  });

  // 2. POST /api/config -> Save/Update complete app configuration in Supabase & Local Cache
  app.post("/api/config", async (req, res) => {
    const { telegram, iqOption, settings, selectedChannels } = req.body;

    // 1. Sync to Supabase if configured
    if (isSupabaseConfigured) {
      const payload: any = {
        id: "main_config",
        updated_at: new Date().toISOString(),
      };
      if (settings) {
        if (settings.isEnabled !== undefined) payload.bot_enabled = settings.isEnabled;
        if (settings.accountMode !== undefined) payload.account_mode = settings.accountMode;
        if (settings.baseStake !== undefined) payload.base_stake = settings.baseStake;
        if (settings.minPayout !== undefined) payload.min_payout = settings.minPayout;
        if (settings.martingaleMultiplier !== undefined) payload.martingale_multiplier = settings.martingaleMultiplier;
        if (settings.maxGaleSteps !== undefined) payload.max_gale_steps = settings.maxGaleSteps;
        if (settings.dailyStopLoss !== undefined) payload.daily_stop_loss = settings.dailyStopLoss;
        if (settings.dailyTakeProfit !== undefined) payload.daily_take_profit = settings.dailyTakeProfit;
      }
      if (iqOption) {
        if (iqOption.email !== undefined) payload.iq_email = iqOption.email;
        if (iqOption.password !== undefined) payload.iq_password = iqOption.password;
        if (iqOption.accountMode !== undefined) payload.iq_account_mode = iqOption.accountMode;
        if (iqOption.isConnected !== undefined) payload.iq_connected = iqOption.isConnected;
      }
      if (telegram) {
        if (telegram.apiId !== undefined) payload.telegram_api_id = telegram.apiId;
        if (telegram.apiHash !== undefined) payload.telegram_api_hash = telegram.apiHash;
        if (telegram.phone !== undefined) payload.telegram_phone = telegram.phone;
      }
      if (selectedChannels) {
        payload.selected_channels = selectedChannels;
      }

      await supabaseFetch("bot_settings?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload),
      });
    }

    // 2. Also persist to local config file
    const existing: any = safeReadJsonFile(CONFIG_FILE, {});
    const updated = {
      telegram: { ...(existing.telegram || {}), ...(telegram || {}) },
      iqOption: { ...(existing.iqOption || {}), ...(iqOption || {}) },
      settings: { ...(existing.settings || {}), ...(settings || {}) },
      selectedChannels: selectedChannels !== undefined ? selectedChannels : existing.selectedChannels || [],
      updatedAt: new Date().toISOString(),
    };
    if (settings?.timeZone) {
      setActiveTimezone(settings.timeZone);
    }
    if (settings && settings.isEnabled !== undefined) {
      isAutoTradeEnabled = Boolean(settings.isEnabled);
      if (memoryAutoTradeSession) {
        memoryAutoTradeSession.isActive = isAutoTradeEnabled;
        memoryAutoTradeSession.status = isAutoTradeEnabled ? "RUNNING" : "STOPPED";
      }
    }
    safeWriteJsonFile(CONFIG_FILE, updated);

    res.json({
      success: true,
      message: isSupabaseConfigured 
        ? "Configuration saved and synchronized to Supabase database!"
        : "Configuration saved to persistent local storage.",
      storageMode: isSupabaseConfigured ? "SUPABASE_POSTGRESQL" : "LOCAL_FILE_STORAGE",
    });
  });

  // 3. POST /api/iqoption/test-connection -> Test & Verify IQ Option Broker Login with Native Live WebSocket
  app.post("/api/iqoption/test-connection", async (req, res) => {
    const { email, password, accountMode = "PRACTICE", twoFactorCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ success: false, error: "Email and password are required to connect to IQ Option." });
    }

    try {
      const authResult = await globalIQClient.login(email, password, accountMode, twoFactorCode);

      if (authResult.success) {
        const status = globalIQClient.getStatus();
        const activeBal = status.activeBalance;
        const practiceBal = status.balances.PRACTICE;
        const realBal = status.balances.REAL;
        const bonusBal = status.balances.bonus || 0;
        const currency = status.balances.currency || "USD";

        // Persist connected status into Supabase if configured
        if (isSupabaseConfigured) {
          await supabaseFetch("bot_settings?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({
              id: "main_config",
              iq_email: email,
              iq_password: password,
              iq_account_mode: accountMode,
              iq_connected: true,
              updated_at: new Date().toISOString(),
            }),
          }).catch(() => {});
        }

        // Persist to local configuration file
        const existing: any = safeReadJsonFile(CONFIG_FILE, {});
        existing.iqOption = {
          email,
          password,
          accountMode,
          isConnected: true,
          balance: activeBal,
          practiceBalance: practiceBal,
          realBalance: realBal,
          bonusBalance: bonusBal,
          currency,
        };
        safeWriteJsonFile(CONFIG_FILE, existing);

        return res.json({
          success: true,
          message: `Successfully connected to IQ Option Live Gateway (${accountMode} Account).`,
          balance: activeBal,
          practiceBalance: practiceBal,
          realBalance: realBal,
          bonusBalance: bonusBal,
          currency,
          accountMode,
          payoutRate: 87,
          user: status.user,
          library: "IQ Option Live WebSocket Client",
        });
      } else {
        return res.json({
          success: false,
          error: authResult.error || "Failed to authenticate with IQ Option broker.",
          requires2FA: Boolean(authResult.requires2FA),
          twoFactorToken: authResult.twoFactorToken,
        });
      }
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to connect to IQ Option broker.",
      });
    }
  });

  // GET /api/iqoption/status -> Retrieve live WebSocket connection & balance status
  app.get("/api/iqoption/status", (req, res) => {
    const status = globalIQClient.getStatus();
    res.json({
      success: true,
      status,
    });
  });

  // POST /api/iqoption/sync-balance -> Force live balance refresh from broker
  app.post("/api/iqoption/sync-balance", async (req, res) => {
    try {
      if (globalIQClient.isClientConnected() || globalIQClient.hasSession()) {
        await globalIQClient.fetchProfileAndBalancesRest();
      }
      const status = globalIQClient.getStatus();
      res.json({
        success: true,
        status,
        activeBalance: status.activeBalance,
        practiceBalance: status.balances.PRACTICE,
        realBalance: status.balances.REAL,
        bonusBalance: status.balances.bonus || 0,
        currency: status.balances.currency || "USD",
        accountMode: status.accountMode,
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || String(e) });
    }
  });

  // POST /api/iqoption/change-account-mode -> Switch between PRACTICE and REAL accounts
  app.post("/api/iqoption/change-account-mode", (req, res) => {
    const { accountMode } = req.body;
    if (accountMode === "PRACTICE" || accountMode === "REAL") {
      globalIQClient.setAccountMode(accountMode);
      return res.json({
        success: true,
        accountMode,
        activeBalance: globalIQClient.getActiveBalanceAmount(),
        status: globalIQClient.getStatus(),
      });
    }
    return res.status(400).json({ success: false, error: "Invalid account mode. Must be PRACTICE or REAL." });
  });

  // POST /api/iqoption/execute -> Execute order via Live WebSocket Client
  app.post("/api/iqoption/execute", async (req, res) => {
    const { email, password, accountMode = "PRACTICE", signal, baseStake = 10 } = req.body;
    if (!signal) {
      return res.status(400).json({ success: false, error: "Signal is required for execution." });
    }

    try {
      const status = globalIQClient.getStatus();
      if (!status.connected && email && password) {
        await globalIQClient.login(email, password, accountMode);
      }
      globalIQClient.setAccountMode(accountMode);

      const asset = signal.asset || "EURUSD";
      const action = signal.action || "CALL";
      const stake = parseFloat(baseStake) || 10;
      const duration = parseInt(String(signal.timeframe || signal.durationMinutes || "1").replace(/\D/g, ""), 10) || 1;

      const result = await globalIQClient.placeOrder({
        asset,
        action,
        stake,
        durationMinutes: duration,
        accountMode,
      });

      return res.json(result);
    } catch (e: any) {
      return res.status(500).json({ success: false, error: e.message || String(e) });
    }
  });

  // 4. GET /api/supabase/status -> Checks Supabase Connection status
  app.get("/api/supabase/status", async (req, res) => {
    let tablesOk = false;
    let details: any = {};
    if (isSupabaseConfigured) {
      try {
        const testSettings = await supabaseFetch("bot_settings?limit=1");
        const testAuth = await supabaseFetch("telegram_auth?limit=1");
        tablesOk = Boolean(testSettings !== null || testAuth !== null);
        details = {
          hasBotSettings: testSettings !== null,
          hasTelegramAuth: testAuth !== null,
        };
      } catch (e) {
        tablesOk = false;
      }
    }
    res.json({
      isConfigured: isSupabaseConfigured,
      url: SUPABASE_URL ? SUPABASE_URL.replace(/(https?:\/\/)([^.]+)(\..*)/, "$1$2$3") : "Not configured",
      tablesOk,
      details,
    });
  });

  // Check persistent session status with cross-device IP change & re-activation detection
  app.get("/api/telegram/session-status", async (req, res) => {
    const saved = await getSavedSession();
    if (!saved) {
      return res.json({
        connected: false,
        reActivationRequired: false,
        message: "No Telegram credentials or session found in database or local storage."
      });
    }

    if (!saved.sessionString) {
      // Credentials exist (API ID, Hash, Phone), but no active session string yet
      return res.json({
        connected: false,
        reActivationRequired: Boolean(saved.apiId && saved.phone),
        reason: "Credentials retrieved from database. Enter verification OTP to activate session on this device.",
        apiId: saved.apiId,
        apiHash: saved.apiHash,
        phone: saved.phone,
        user: saved.user,
      });
    }

    // Validate using GramJS
    const sessionCheck = await validateTelegramSession(
      saved.apiId,
      saved.apiHash,
      saved.sessionString
    );

    if (sessionCheck.authenticated) {
      return res.json({
        connected: true,
        reActivationRequired: false,
        user: sessionCheck.user || saved.user,
        channels: sessionCheck.channels && sessionCheck.channels.length > 0 ? sessionCheck.channels : (saved.channels || []),
        sessionString: saved.sessionString,
        apiId: saved.apiId,
        apiHash: saved.apiHash,
        phone: saved.phone,
        connectedAt: saved.connectedAt,
      });
    } else {
      // Session verification failed (IP changed, DC migration, session revoked, or expired)
      const errorMsg = sessionCheck.error || "Telegram session requires re-authentication on this device or IP address.";
      const isRevokedOrExpired = errorMsg.includes("expired") || errorMsg.includes("revoked") || errorMsg.includes("AUTH_KEY") || errorMsg.includes("401");
      
      return res.json({
        connected: false,
        reActivationRequired: true,
        reason: isRevokedOrExpired
          ? "Session invalidated or IP address changed. Click 'Re-activate' to send a new OTP code to your phone."
          : `Notice: ${errorMsg}. Re-activation available.`,
        apiId: saved.apiId,
        apiHash: saved.apiHash,
        phone: saved.phone,
        user: saved.user,
        notice: sessionCheck.error,
      });
    }
  });

  // Re-activation helper: Send OTP code directly for saved credentials from database
  app.post("/api/telegram/reactivate", async (req, res) => {
    const saved = await getSavedSession();
    const apiId = req.body.apiId || (saved && saved.apiId);
    const apiHash = req.body.apiHash || (saved && saved.apiHash);
    const phone = req.body.phone || (saved && saved.phone);

    if (!apiId || !apiHash || !phone) {
      return res.status(400).json({
        success: false,
        error: "Saved Telegram credentials incomplete. Please verify API ID, API Hash, and phone number in Settings."
      });
    }

    const result = await sendTelegramCode(apiId, apiHash, phone);
    res.json({
      ...result,
      apiId,
      apiHash,
      phone,
    });
  });

  // Step 1: Connect & Validate Gateway using API ID and API Hash
  app.post("/api/telegram/validate-gateway", async (req, res) => {
    const { apiId, apiHash } = req.body;
    if (!apiId || !apiHash) {
      return res.status(400).json({ success: false, error: "API ID and API Hash are required." });
    }

    const result = await validateGateway(apiId, apiHash);
    res.json(result);
  });

  // Step 2: Send OTP verification code to Telegram phone
  app.post("/api/telegram/send-code", async (req, res) => {
    const { apiId, apiHash, phone } = req.body;
    if (!apiId || !apiHash || !phone) {
      return res.status(400).json({ success: false, error: "API ID, API Hash, and Phone number are required." });
    }

    const result = await sendTelegramCode(apiId, apiHash, phone);
    res.json(result);
  });

  // Step 3: Verify OTP code and save persistent StringSession
  app.post("/api/telegram/verify-code", async (req, res) => {
    const { apiId, apiHash, phone, code, phoneCodeHash, password, tempSession } = req.body;
    if (!apiId || !apiHash || !phone || !code) {
      return res.status(400).json({ success: false, error: "Missing required verification fields (phone and OTP code)." });
    }

    const result = await verifyTelegramCode(apiId, apiHash, phone, code, phoneCodeHash, password, tempSession);

    if (result.success && result.sessionString) {
      const sessionData = {
        apiId,
        apiHash,
        phone,
        sessionString: result.sessionString,
        user: result.user,
        channels: result.channels || [],
        connectedAt: new Date().toISOString()
      };
      persistSession(sessionData);

      // Persist to Supabase if configured
      if (isSupabaseConfigured) {
        await supabaseFetch("bot_settings?on_conflict=id", {
          method: "POST",
          headers: { Prefer: "resolution=merge-duplicates,return=representation" },
          body: JSON.stringify({
            id: "main_config",
            telegram_api_id: String(apiId),
            telegram_api_hash: apiHash,
            telegram_phone: phone,
            telegram_session: result.sessionString,
            telegram_user: result.user,
            telegram_connected: true,
            updated_at: new Date().toISOString(),
          }),
        });
      }

      // Activate live real-time MTProto listener
      ensureLiveTelegramListener().catch(() => {});
    }

    res.json(result);
  });

  // Save or import session string directly
  app.post("/api/telegram/save-session", (req, res) => {
    const { apiId, apiHash, phone, sessionString, user, channels } = req.body;
    if (!sessionString) {
      return res.status(400).json({ success: false, error: "Session string is required" });
    }

    const sessionData = {
      apiId: apiId || "12345678",
      apiHash: apiHash || "abcdef0123456789",
      phone: phone || "+1234567890",
      sessionString,
      user: user || { username: "telegram_user", phone },
      channels: channels || [],
      connectedAt: new Date().toISOString()
    };

    persistSession(sessionData);
    ensureLiveTelegramListener().catch(() => {});
    res.json({ success: true, message: "Session saved permanently." });
  });

  // Disconnect Telegram session
  app.post("/api/telegram/disconnect", (req, res) => {
    try {
      stopLiveTelegramListener();
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
      }
      res.json({ success: true, message: "Telegram session disconnected." });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Telegram Live MTProto Listener Status
  app.get("/api/telegram/listener-status", async (req, res) => {
    const status = getTelegramListenerStatus();
    const saved = await getSavedSession();
    res.json({
      success: true,
      hasSavedSession: Boolean(saved && saved.sessionString),
      active: status.active,
      connected: status.connected,
      lastMessageReceivedAt: status.lastMessageReceivedAt ? new Date(status.lastMessageReceivedAt).toISOString() : null,
      totalMessagesReceived: status.totalMessagesReceived,
    });
  });

  // Restart Telegram Live MTProto Listener on demand
  app.post("/api/telegram/restart-listener", async (req, res) => {
    try {
      stopLiveTelegramListener();
      const saved = await getSavedSession();
      if (!saved || !saved.sessionString) {
        return res.status(400).json({ success: false, error: "No saved Telegram session found to restart listener." });
      }
      const result = await startLiveTelegramListener(saved.apiId, saved.apiHash, saved.sessionString, handleLiveTelegramMessage);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // Manual / Automated Catchup Backfill: Scans all channels for missed messages during connection interruptions
  app.post("/api/telegram/backfill", async (req, res) => {
    try {
      const { sinceEpochMs, channelIds } = req.body;
      const saved = await getSavedSession();
      if (!saved || !saved.sessionString) {
        return res.status(400).json({ success: false, error: "No active Telegram session found to run catchup backfill." });
      }

      const defaultSince = memoryAutoTradeSession && memoryAutoTradeSession.isActive
        ? memoryAutoTradeSession.startTime
        : Date.now() - 3600000; // 1 hour ago
      const effectiveSince = sinceEpochMs || defaultSince;

      const result = await backfillMissedMessages(
        saved.apiId,
        saved.apiHash,
        saved.sessionString,
        effectiveSince,
        handleLiveTelegramMessage,
        channelIds
      );

      res.json({
        ...result,
        sinceEpochMs: effectiveSince,
        sinceFormatted: formatTimeInTz(effectiveSince, getActiveTimezone()),
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || String(e) });
    }
  });

  // API status
  app.get("/api/health", (req, res) => {
    res.json({
      status: "online",
      serverTime: new Date().toISOString(),
      pythonEngineAvailable: true,
      iqOptionConnected: false,
      telegramListenerReady: true,
      supportedAssets: ["EURUSD", "GBPUSD", "USDJPY", "AUDCAD", "EURUSD-OTC", "BTCUSD"]
    });
  });

  // Real Python Signal Parser Execution via child_process
  app.post("/api/python/parse", (req, res) => {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: "Text parameter is required" });
    }

    const startTime = Date.now();
    const scriptPath = path.join(process.cwd(), "backend", "signal_parser.py");

    execFile("python3", [scriptPath, text], { timeout: 5000 }, (error, stdout, stderr) => {
      const executionTimeMs = Date.now() - startTime;
      if (error) {
        return res.json({
          success: false,
          error: stderr || error.message,
          executionTimeMs
        });
      }

      try {
        const parsedJson = JSON.parse(stdout.trim());
        return res.json({
          success: true,
          engine: "Python 3.10 TradingSignalParser",
          executionTimeMs,
          data: parsedJson
        });
      } catch (err) {
        return res.json({
          success: true,
          engine: "Python 3.10 TradingSignalParser (Raw)",
          executionTimeMs,
          rawStdout: stdout.trim()
        });
      }
    });
  });

  // Get Python backend files for viewing & copying
  app.get("/api/python/files", (req, res) => {
    const backendDir = path.join(process.cwd(), "backend");
    try {
      const files = ["main.py", "signal_parser.py", "iq_trader.py", "telegram_listener.py", "requirements.txt", ".env.example", "README.md"];
      const fileContents: Record<string, string> = {};

      for (const f of files) {
        const fullPath = path.join(backendDir, f);
        if (fs.existsSync(fullPath)) {
          fileContents[f] = fs.readFileSync(fullPath, "utf-8");
        }
      }

      res.json({
        success: true,
        files: fileContents
      });
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // ----------------------------------------------------
  // Persistent Auto-Trade Timer & Monitoring Channel APIs
  // ----------------------------------------------------
  interface StoredAutoTradeSession {
    isActive: boolean;
    startTime: number;
    durationHours: number;
    endTime: number;
    label: string;
    status: "RUNNING" | "STOPPED" | "COMPLETED" | "RECOVERED";
  }

  let memoryAutoTradeSession: StoredAutoTradeSession = {
    isActive: true,
    startTime: Date.now(),
    durationHours: 87600,
    endTime: Date.now() + 86400000 * 3650,
    label: "Always-On 24/7",
    status: "RUNNING",
  };

  // Persistent storage file for channel messages feed
  const MESSAGES_FILE = path.join(process.cwd(), "channel_messages.json");

  // Helper to determine if an epoch timestamp matches the current calendar day in the active timezone
  function isSameCurrentCalendarDay(epochMs: number, tz: string = getActiveTimezone()): boolean {
    const todayStr = formatDateInTz(Date.now(), tz);
    const targetStr = formatDateInTz(epochMs, tz);
    return todayStr === targetStr;
  }

  // Load persistent messages from disk and filter strictly to current day
  function loadPersistentChannelMessages(): any[] {
    const tz = getActiveTimezone();
    const rawList: any[] = safeReadJsonFile(MESSAGES_FILE, []);
    if (!Array.isArray(rawList)) return [];

    const seenIds = new Set<string>();
    const validTodayList: any[] = [];

    for (const m of rawList) {
      if (!m || typeof m !== "object") continue;
      const epochMs = m.epochMs || (m.timestamp ? new Date(m.timestamp).getTime() : Date.now());
      // Retain only messages from the current day
      if (!isSameCurrentCalendarDay(epochMs, tz)) {
        continue;
      }
      const id = String(m.id || "");
      if (id && seenIds.has(id)) {
        continue;
      }
      if (id) seenIds.add(id);
      validTodayList.push(m);
    }

    return validTodayList;
  }

  function savePersistentChannelMessages(messages: any[]) {
    const tz = getActiveTimezone();
    // Filter only current-day messages before saving
    const filtered = messages.filter((m) => isSameCurrentCalendarDay(m.epochMs || Date.now(), tz));
    safeWriteJsonFile(MESSAGES_FILE, filtered);
  }

  let channelMessagesHistory: any[] = loadPersistentChannelMessages();

  // Active SSE client connections for instant sub-millisecond push to frontend
  const sseClients = new Set<express.Response>();

  function broadcastMessageToSSE(messageObj: any) {
    if (!messageObj) return;
    const payload = `data: ${JSON.stringify({ type: "NEW_MESSAGE", message: messageObj })}\n\n`;
    for (const client of Array.from(sseClients)) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  function broadcastTradeUpdateToSSE(trade: TradeRecord) {
    if (!trade) return;
    const payload = `data: ${JSON.stringify({ type: "TRADE_UPDATE", trade })}\n\n`;
    for (const client of Array.from(sseClients)) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  // Initialize Precision Trade Execution Engine (Complies with all 31 trade execution specifications)
  const executionEngine = new TradeExecutionEngine({
    getIQCredentials: () => {
      const cfg: any = safeReadJsonFile(CONFIG_FILE, {});
      return {
        email: cfg.iqOption?.email || "",
        password: cfg.iqOption?.password || "",
        accountMode: (cfg.iqOption?.accountMode || cfg.settings?.accountMode || "PRACTICE") as "PRACTICE" | "REAL",
        isConnected: Boolean(cfg.iqOption?.isConnected),
      };
    },
    getBaseStake: () => {
      const cfg: any = safeReadJsonFile(CONFIG_FILE, {});
      return Number(cfg.settings?.baseStake) || 100;
    },
    getAccountMode: () => {
      const cfg: any = safeReadJsonFile(CONFIG_FILE, {});
      return (cfg.settings?.accountMode || cfg.iqOption?.accountMode || "PRACTICE") as "PRACTICE" | "REAL";
    },
    getBotSettings: () => {
      const cfg: any = safeReadJsonFile(CONFIG_FILE, {});
      return cfg.settings || {
        isEnabled: true,
        accountMode: "PRACTICE",
        baseStake: 100,
        minPayout: 80,
        martingaleMultiplier: 2.2,
        maxGaleSteps: 1,
        dailyStopLoss: 500,
        dailyTakeProfit: 1000,
        ignoreTelegramMartingale: true,
        waitForActualResult: true,
      };
    },
    getTimeZone: () => getActiveTimezone(),
    isAutoTradeActive: () => {
      const cfg: any = safeReadJsonFile(CONFIG_FILE, {});
      if (cfg.settings?.isEnabled === false) return false;
      if (cfg.autoTradeSession?.isActive === false) return false;
      return isAutoTradeEnabled && Boolean(memoryAutoTradeSession?.isActive ?? true);
    },
    onTradeUpdate: async (trade: TradeRecord) => {
      console.log(`[Trade State Change] ${trade.id} -> ${trade.state} (Outcome: ${trade.outcome || "N/A"})`);

      // Update in-memory and persistent channel messages history
      const matchingMsg = channelMessagesHistory.find((m) => 
        m.tradeRecord?.id === trade.id ||
        m.tradeRecord?.signalId === trade.signalId ||
        m.id === trade.signalId ||
        m.id === `sig-${trade.id}` ||
        (m.tradeRecord?.deterministicKey && m.tradeRecord.deterministicKey === trade.deterministicKey)
      );

      if (matchingMsg) {
        matchingMsg.tradeRecord = { ...trade };
        matchingMsg.status = trade.state;
        savePersistentChannelMessages(channelMessagesHistory);
      }

      // Broadcast instant live update to all connected frontend clients via SSE
      broadcastTradeUpdateToSSE(trade);

      // Sync to Supabase trades table if available
      if (isSupabaseConfigured) {
        try {
          await supabaseFetch("trades?on_conflict=id", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=representation" },
            body: JSON.stringify({
              id: trade.id,
              asset: trade.asset,
              action: trade.action,
              stake: trade.stake,
              duration: trade.durationMinutes,
              account_mode: trade.accountMode,
              entry_time: trade.scheduledEntryTime,
              actual_entry_time: trade.actualExecutionTime || null,
              execution_delay_ms: trade.executionDelayMs || null,
              expiry_time: trade.expectedExpirationTime || null,
              status: trade.state,
              outcome: trade.outcome || null,
              profit_loss: trade.profit || 0.0,
              order_id: trade.orderId || null,
              updated_at: new Date().toISOString(),
            }),
          });
        } catch (e) {}
      }
    },
  });

  let lastProcessedTelegramTimestamp = 0;

  // Handler for real-time live and catchup/backfill incoming messages from Telegram MTProto listener
  const handleLiveTelegramMessage = (msg: IngestedTelegramMessage) => {
    const currentTz = getActiveTimezone();
    const epochMs = msg.date || Date.now();

    // Auto-prune messages from prior days in memory
    channelMessagesHistory = channelMessagesHistory.filter((m) => isSameCurrentCalendarDay(m.epochMs || Date.now(), currentTz));

    // If message is from a prior calendar day, do not execute signal or log to today's active feed
    if (!isSameCurrentCalendarDay(epochMs, currentTz)) {
      console.log(`[Telegram Feed] Skipping historical message from past calendar day (${msg.timestamp})`);
      return;
    }

    const cleanText = (msg.rawText || "").replace(/\s+/g, " ").trim();
    const normChannel = String(msg.channelId || msg.channelTitle || "").replace(/^-100/, "").trim().toLowerCase();
    const cleanTitle = (msg.channelTitle || "").replace(/\s+/g, "").toLowerCase();

    // Stable deterministic ID to guarantee absolute uniqueness across catchup and live events
    const deterministicId = msg.msgId && Number(msg.msgId) > 0
      ? `tg-${normChannel}-${msg.msgId}`
      : `tg-${normChannel}-${Math.floor(epochMs / 8000)}-${Buffer.from(cleanText.slice(0, 30)).toString("hex").slice(0, 20)}`;

    // Strict deduplication check against existing messages in history
    const isDuplicate = channelMessagesHistory.some((m) => {
      if (m.id === deterministicId) return true;
      if (msg.msgId && Number(msg.msgId) > 0 && m.telegramMsgId === String(msg.msgId) && m.normChannel === normChannel) return true;
      if (
        (m.channelTitle === msg.channelTitle || (m.channelTitle || "").toLowerCase().replace(/\s+/g, "") === cleanTitle) &&
        m.rawText && m.rawText.trim() === msg.rawText.trim() &&
        Math.abs((m.epochMs || 0) - epochMs) < 8000
      ) {
        return true;
      }
      return false;
    });

    if (isDuplicate) {
      console.log(`[Telegram Deduplication] ⏭️ Skipped duplicate message from "${msg.channelTitle}" (${deterministicId})`);
      return;
    }

    lastProcessedTelegramTimestamp = Math.max(lastProcessedTelegramTimestamp, epochMs);
    const parsed = parseTradingSignal(msg.rawText);
    const isSignal = parsed.success;

    const keywords: string[] = [];
    if (/trade\s*:/i.test(msg.rawText)) keywords.push("Trade:");
    if (/timer\s*:/i.test(msg.rawText)) keywords.push("Timer:");
    if (/expiry\s*:/i.test(msg.rawText)) keywords.push("Expiry:");
    if (/entry\s*(?:time)?\s*:/i.test(msg.rawText)) keywords.push("Entry / Entry Time:");
    if (/direction\s*:/i.test(msg.rawText)) keywords.push("Direction:");
    if (/martingale\s*(?:levels?)?\s*:/i.test(msg.rawText)) keywords.push("Martingale Levels:");
    if (/\b(buy|call|compra|🟩|🟢)\b/i.test(msg.rawText)) keywords.push("BUY / CALL 🟩");
    if (/\b(sell|put|venda|🟥|🔴)\b/i.test(msg.rawText)) keywords.push("SELL / PUT 🟥");

    let tradeRecord: TradeRecord | undefined = undefined;

    // Dispatches signal to Precision Execution Engine if valid
    if (isSignal && parsed.asset && parsed.action) {
      const execResult = executionEngine.processIncomingSignal({
        signalId: `sig-${deterministicId}`,
        sourceChannel: msg.channelTitle,
        rawText: msg.rawText,
        asset: parsed.asset,
        action: parsed.action,
        durationMinutes: parsed.durationMinutes || 1,
        timeframe: parsed.timeframe,
        scheduledTimeStr: parsed.scheduledTime,
        telegramSentTimeEpochMs: epochMs,
      });
      tradeRecord = execResult.trade;
    }

    const messageObj = {
      id: deterministicId,
      telegramMsgId: msg.msgId ? String(msg.msgId) : undefined,
      normChannel,
      epochMs,
      channelId: msg.channelId,
      channelTitle: msg.channelTitle,
      timestamp: msg.timestamp,
      rawText: msg.rawText,
      isSignal,
      isBackfill: Boolean(msg.isBackfill),
      matchedKeywords: keywords,
      parsedSignal: isSignal ? parsed : undefined,
      status: tradeRecord?.state || (isSignal ? "IDENTIFIED" : "NON_SIGNAL"),
      tradeRecord,
    };

    channelMessagesHistory.unshift(messageObj);
    if (channelMessagesHistory.length > 300) channelMessagesHistory.pop();

    savePersistentChannelMessages(channelMessagesHistory);

    // INSTANT LIVE PUSH: Broadcast immediately to all active browser sessions via SSE
    broadcastMessageToSSE(messageObj);

    console.log(`[Real-Time Telegram] ${msg.isBackfill ? "🔄 [CATCHUP BACKFILL]" : "⚡ [LIVE INSTANT]"} Message received at ${msg.timestamp} from "${msg.channelTitle}" -> ${isSignal ? `🎯 SIGNAL DETECTED (${tradeRecord?.state || "PROCESSED"})` : "Regular message logged"}`);
  };

  let lastCatchupEpochMs = Date.now();
  let isAutoTradeEnabled = true;

  const ensureLiveTelegramListener = async (forceBackfill = false) => {
    try {
      const saved = await getSavedSession();
      if (saved && saved.sessionString && saved.apiId && saved.apiHash) {
        const status = getTelegramListenerStatus();

        let catchupSinceEpochMs: number | undefined = undefined;
        if (lastProcessedTelegramTimestamp > 0) {
          catchupSinceEpochMs = lastProcessedTelegramTimestamp - 30000;
        } else if (memoryAutoTradeSession?.startTime) {
          catchupSinceEpochMs = memoryAutoTradeSession.startTime;
        } else {
          catchupSinceEpochMs = Date.now() - 3600000;
        }

        if (!status.active || !status.connected) {
          console.log(`[Telegram Watchdog] Initializing/recovering Telegram Live MTProto Listener (Catchup from: ${catchupSinceEpochMs ? new Date(catchupSinceEpochMs).toISOString() : "LIVE"})...`);
          await startLiveTelegramListener(saved.apiId, saved.apiHash, saved.sessionString, handleLiveTelegramMessage, catchupSinceEpochMs);
        } else if (forceBackfill && catchupSinceEpochMs) {
          console.log(`[Telegram Catchup Sync] Checking missed messages across channels since ${new Date(catchupSinceEpochMs).toISOString()}...`);
          await backfillMissedMessages(saved.apiId, saved.apiHash, saved.sessionString, catchupSinceEpochMs, handleLiveTelegramMessage);
          lastCatchupEpochMs = Date.now();
        }
      }
    } catch (err) {
      console.warn("Notice: Live Telegram listener init:", err);
    }
  };

  // Start live listener immediately on boot
  setTimeout(() => {
    ensureLiveTelegramListener(true);
  }, 1000);

  // Background Telegram Watchdog: Keeps listener alive and reconnects if dropped
  setInterval(() => {
    ensureLiveTelegramListener().catch(() => {});
  }, 6000);

  // Background Health & Periodic Catchup Engine:
  // Runs periodically to guarantee no message was missed if a socket hiccup occurred
  setInterval(async () => {
    try {
      const saved = await getSavedSession();
      if (saved && saved.sessionString && saved.apiId && saved.apiHash) {
        const status = getTelegramListenerStatus();
        if (status.active && status.connected) {
          const sinceEpoch = lastProcessedTelegramTimestamp > 0
            ? lastProcessedTelegramTimestamp - 15000
            : Date.now() - 60000;
          await backfillMissedMessages(saved.apiId, saved.apiHash, saved.sessionString, sinceEpoch, handleLiveTelegramMessage);
          lastCatchupEpochMs = Date.now();
        }
      }
    } catch (e) {}
  }, 25000);

  // Helper to load session from disk/DB on startup
  const initCfg: any = safeReadJsonFile(CONFIG_FILE, {});
  if (initCfg.settings?.isEnabled !== undefined) {
    isAutoTradeEnabled = Boolean(initCfg.settings.isEnabled);
  }

  // 1. POST /api/autotrade/start -> Kept for backward compatibility or toggling
  app.post("/api/autotrade/start", async (req, res) => {
    const { durationHours = 24, label = "Always-On 24/7" } = req.body;
    isAutoTradeEnabled = true;

    memoryAutoTradeSession = {
      isActive: true,
      startTime: Date.now(),
      durationHours: Number(durationHours),
      endTime: Date.now() + 86400000 * 365,
      label: "Always-On 24/7",
      status: "RUNNING",
    };

    const existing: any = safeReadJsonFile(CONFIG_FILE, {});
    existing.autoTradeSession = memoryAutoTradeSession;
    if (existing.settings) existing.settings.isEnabled = true;
    safeWriteJsonFile(CONFIG_FILE, existing);

    ensureLiveTelegramListener(true).catch(() => {});

    res.json({
      success: true,
      session: memoryAutoTradeSession,
      isAlwaysOn: true,
      message: "Always-On Auto-Trade & 8-second continuous catchup active.",
    });
  });

  // 2. POST /api/autotrade/stop -> Pauses/Stops Auto-Trade execution
  app.post("/api/autotrade/stop", async (req, res) => {
    isAutoTradeEnabled = false;
    if (memoryAutoTradeSession) {
      memoryAutoTradeSession.isActive = false;
      memoryAutoTradeSession.status = "STOPPED";
    }

    const existing: any = safeReadJsonFile(CONFIG_FILE, {});
    if (existing.settings) existing.settings.isEnabled = false;
    safeWriteJsonFile(CONFIG_FILE, existing);

    res.json({
      success: true,
      message: "Auto-trade execution paused.",
    });
  });

  // 2B. POST /api/autotrade/toggle -> Toggles Auto-Trade execution state
  app.post("/api/autotrade/toggle", (req, res) => {
    isAutoTradeEnabled = !isAutoTradeEnabled;
    if (memoryAutoTradeSession) {
      memoryAutoTradeSession.isActive = isAutoTradeEnabled;
      memoryAutoTradeSession.status = isAutoTradeEnabled ? "RUNNING" : "STOPPED";
    }
    const existing: any = safeReadJsonFile(CONFIG_FILE, {});
    if (!existing.settings) existing.settings = {};
    existing.settings.isEnabled = isAutoTradeEnabled;
    safeWriteJsonFile(CONFIG_FILE, existing);

    res.json({
      success: true,
      isEnabled: isAutoTradeEnabled,
      message: isAutoTradeEnabled ? "Auto-Trade active & executing" : "Auto-Trade paused",
    });
  });

  // 3. GET /api/autotrade/status -> Returns Always-On state & 8-second catchup sync info
  app.get("/api/autotrade/status", (req, res) => {
    const tgStatus = getTelegramListenerStatus();
    res.json({
      isActive: isAutoTradeEnabled,
      isAlwaysOn: true,
      catchupIntervalSeconds: 8,
      lastCatchupTimestamp: lastCatchupEpochMs,
      lastProcessedTelegramTimestamp,
      telegramListener: tgStatus,
      session: {
        isActive: isAutoTradeEnabled,
        label: "Always-On 24/7",
        status: isAutoTradeEnabled ? "RUNNING" : "PAUSED",
      },
    });
  });

  // 3B. POST /api/telegram/catchup -> Dedicated endpoint to trigger instant 8-second catchup backfill
  app.post("/api/telegram/catchup", async (req, res) => {
    try {
      const saved = await getSavedSession();
      if (saved && saved.sessionString && saved.apiId && saved.apiHash) {
        const sinceEpoch = lastProcessedTelegramTimestamp > 0
          ? lastProcessedTelegramTimestamp - 30000
          : (req.body?.sinceEpochMs || Date.now() - 3600000);

        const result = await backfillMissedMessages(
          saved.apiId,
          saved.apiHash,
          saved.sessionString,
          sinceEpoch,
          handleLiveTelegramMessage
        );
        lastCatchupEpochMs = Date.now();
        return res.json({
          success: true,
          messagesRetrieved: result.messagesRetrieved,
          lastCatchupTimestamp: lastCatchupEpochMs,
        });
      }
      res.json({ success: false, error: "Telegram credentials not saved." });
    } catch (err: any) {
      res.json({ success: false, error: err.message || String(err) });
    }
  });

  // 4. GET /api/channel-messages -> Returns real-time monitored channel messages for current calendar day
  app.get("/api/channel-messages", (req, res) => {
    const currentTz = getActiveTimezone();
    // Prune any messages not belonging to current calendar day
    channelMessagesHistory = channelMessagesHistory.filter((m) => isSameCurrentCalendarDay(m.epochMs || Date.now(), currentTz));
    savePersistentChannelMessages(channelMessagesHistory);
    res.json({
      success: true,
      messages: channelMessagesHistory.slice(0, 150),
    });
  });

  // 4B. GET /api/channel-messages/stream -> Real-Time Server-Sent Events (SSE) stream for instant sub-millisecond push
  app.get("/api/channel-messages/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: "CONNECTED", timestamp: Date.now() })}\n\n`);

    sseClients.add(res);

    // Keep connection alive with periodic comment pings
    const pingInterval = setInterval(() => {
      try {
        res.write(": keepalive\n\n");
      } catch {
        clearInterval(pingInterval);
        sseClients.delete(res);
      }
    }, 15000);

    req.on("close", () => {
      clearInterval(pingInterval);
      sseClients.delete(res);
    });
  });

  // 4C. POST /api/channel-messages/clear -> Clears messages while preserving current-day messages unless forceAll requested
  app.post("/api/channel-messages/clear", (req, res) => {
    const currentTz = getActiveTimezone();
    const forceAll = req.query.all === "true" || req.body?.all === true;

    if (forceAll) {
      channelMessagesHistory.length = 0;
      savePersistentChannelMessages([]);
      return res.json({ success: true, messages: [], message: "All channel message history wiped." });
    }

    // Retention Rule: Only non-current day messages are cleared
    const initialCount = channelMessagesHistory.length;
    channelMessagesHistory = channelMessagesHistory.filter((m) => isSameCurrentCalendarDay(m.epochMs || Date.now(), currentTz));
    savePersistentChannelMessages(channelMessagesHistory);

    const clearedCount = initialCount - channelMessagesHistory.length;
    res.json({
      success: true,
      messages: channelMessagesHistory,
      message: clearedCount > 0
        ? `Cleared ${clearedCount} previous-day messages. Kept ${channelMessagesHistory.length} active messages from today.`
        : `Current day messages preserved (${channelMessagesHistory.length} active today). Previous day messages are cleared.`,
    });
  });

  // 5. POST /api/channel-messages/simulate -> Processes incoming message, prevents duplicates, and saves to persistent store
  app.post("/api/channel-messages/simulate", (req, res) => {
    const { text, channel = "VIP Signal Channel" } = req.body;
    if (!text) {
      return res.status(400).json({ success: false, error: "Text is required" });
    }

    const currentTz = getActiveTimezone();
    const nowMs = Date.now();
    const cleanText = text.replace(/\s+/g, " ").trim();
    const normChannel = channel.replace(/^-100/, "").replace(/\s+/g, "").toLowerCase();
    const deterministicSimId = `msg-sim-${Math.floor(nowMs / 2000)}-${Buffer.from(cleanText.slice(0, 24)).toString("hex").slice(0, 16)}`;

    // Auto-prune previous days
    channelMessagesHistory = channelMessagesHistory.filter((m) => isSameCurrentCalendarDay(m.epochMs || Date.now(), currentTz));

    // Deduplication check
    const isDuplicate = channelMessagesHistory.some((m) => {
      if (m.id === deterministicSimId) return true;
      if (m.channelTitle === channel && m.rawText && m.rawText.trim() === cleanText && Math.abs((m.epochMs || 0) - nowMs) < 4000) {
        return true;
      }
      return false;
    });

    if (isDuplicate) {
      const existing = channelMessagesHistory.find((m) => m.id === deterministicSimId || m.rawText?.trim() === cleanText);
      return res.json({
        success: true,
        message: existing || channelMessagesHistory[0],
        identified: Boolean(existing?.isSignal),
        isDuplicate: true,
      });
    }

    const parsed = parseTradingSignal(text);
    const isSignal = parsed.success;

    // Detect signal keywords
    const keywords: string[] = [];
    if (/trade\s*:/i.test(text)) keywords.push("Trade:");
    if (/timer\s*:/i.test(text)) keywords.push("Timer:");
    if (/expiry\s*:/i.test(text)) keywords.push("Expiry:");
    if (/entry\s*(?:time)?\s*:/i.test(text)) keywords.push("Entry / Entry Time:");
    if (/direction\s*:/i.test(text)) keywords.push("Direction:");
    if (/martingale\s*(?:levels?)?\s*:/i.test(text)) keywords.push("Martingale Levels:");
    if (/\b(buy|call|compra|alta|sube|verde|🟩|🟢|🔼|⬆️)\b/i.test(text)) keywords.push("BUY / CALL 🟩");
    if (/\b(sell|put|venda|baixa|baja|rojo|🟥|🔴|🔽|⬇️)\b/i.test(text)) keywords.push("SELL / PUT 🟥");

    let tradeRecord: TradeRecord | undefined = undefined;

    if (isSignal && parsed.asset && parsed.action) {
      const execResult = executionEngine.processIncomingSignal({
        signalId: `sig-${deterministicSimId}`,
        sourceChannel: channel,
        rawText: text,
        asset: parsed.asset,
        action: parsed.action,
        durationMinutes: parsed.durationMinutes || 1,
        timeframe: parsed.timeframe,
        scheduledTimeStr: parsed.scheduledTime,
        telegramSentTimeEpochMs: nowMs,
      });
      tradeRecord = execResult.trade;
    }

    const timeFormatted = formatTimeInTz(nowMs, currentTz);

    const messageObj = {
      id: deterministicSimId,
      normChannel,
      epochMs: nowMs,
      channelId: channel,
      channelTitle: channel,
      timestamp: timeFormatted,
      rawText: text,
      isSignal,
      matchedKeywords: keywords,
      parsedSignal: isSignal ? parsed : undefined,
      status: tradeRecord?.state || (isSignal ? "IDENTIFIED" : "NON_SIGNAL"),
      tradeRecord,
    };

    channelMessagesHistory.unshift(messageObj);
    if (channelMessagesHistory.length > 300) channelMessagesHistory.pop();

    savePersistentChannelMessages(channelMessagesHistory);
    broadcastMessageToSSE(messageObj);

    res.json({
      success: true,
      message: messageObj,
      identified: isSignal,
      trade: tradeRecord,
    });
  });

  // 6. GET /api/trades -> Returns all trades managed by the Precision Trade Execution Engine
  app.get("/api/trades", (req, res) => {
    const trades = executionEngine.getAllTrades();
    res.json({
      success: true,
      count: trades.length,
      trades,
    });
  });

  // 7. GET /api/trades/:id -> Returns single trade with step-by-step logs and metrics
  app.get("/api/trades/:id", (req, res) => {
    const trade = executionEngine.getTradeById(req.params.id);
    if (!trade) {
      return res.status(404).json({ success: false, error: "Trade not found" });
    }
    res.json({
      success: true,
      trade,
    });
  });

  // 7B. POST /api/trades/clear -> Wipes in-memory and channel message trades
  app.post("/api/trades/clear", (req, res) => {
    executionEngine.clearAllTrades();
    channelMessagesHistory.forEach((m) => {
      if (m.tradeRecord) {
        delete m.tradeRecord;
      }
    });
    savePersistentChannelMessages(channelMessagesHistory);
    res.json({ success: true, message: "All trade records reset." });
  });

  // Signal Parser Endpoint
  app.post("/api/parse-signal", (req, res) => {
    const { text } = req.body as SignalParseRequest;
    const result = parseTradingSignal(text);
    res.json(result);
  });

  // Real Order Execution Endpoint
  app.post("/api/execute-trade", async (req, res) => {
    const {
      asset,
      action,
      timeframe,
      durationMinutes = 5,
      stake = 10,
      accountType = "PRACTICE", // PRACTICE or REAL
    } = req.body;

    if (!asset || !action) {
      return res.status(400).json({ success: false, error: "Asset and action are required." });
    }

    try {
      const mode = (accountType === "REAL" ? "REAL" : "PRACTICE") as "PRACTICE" | "REAL";
      const result = await globalIQClient.placeOrder({
        asset,
        action: action.toUpperCase() as "CALL" | "PUT",
        stake: Number(stake) || 10,
        durationMinutes: Number(durationMinutes) || 5,
        accountMode: mode,
      });

      if (result.success) {
        res.json({
          success: true,
          orderId: result.orderId,
          accountType: mode,
          asset,
          action,
          timeframe,
          durationMinutes,
          stake,
          payoutRate: result.payout || 87,
          timestamp: new Date().toISOString(),
          status: "EXECUTED_SUCCESSFULLY",
          brokerResponse: {
            msg: "Option opened successfully on IQ Option broker",
            code: "success",
            id: result.orderId,
            exp_time: result.expirationEpochSec,
          },
        });
      } else {
        res.status(400).json({
          success: false,
          error: result.error || "IQ Option broker rejected the order.",
        });
      }
    } catch (e: any) {
      res.status(500).json({ success: false, error: e.message || String(e) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Telegram to IQ Option Bot Server running on http://localhost:${PORT}`);

    // Auto-connect to IQ Option broker if saved credentials exist
    try {
      const initConfig: any = safeReadJsonFile(CONFIG_FILE, null);
      if (initConfig?.iqOption?.email && initConfig?.iqOption?.password) {
        const iqEmail = initConfig.iqOption.email;
        const iqPass = initConfig.iqOption.password;
        const iqMode = initConfig.iqOption.accountMode || initConfig.settings?.accountMode || "PRACTICE";
        console.log(`[Auto-Init] Connecting to IQ Option broker for ${iqEmail} (${iqMode} Mode)...`);
        globalIQClient.login(iqEmail, iqPass, iqMode).then((res) => {
          if (res.success) {
            console.log(`✅ [Auto-Init] Connected to IQ Option broker successfully! Profile #${res.profile?.id}`);
          } else {
            console.warn(`⚠️ [Auto-Init] IQ Option login notice:`, res.error);
          }
        }).catch((e) => {
          console.warn(`⚠️ [Auto-Init] IQ Option connection error:`, e.message);
        });
      }
    } catch (err) {}
  });
}

startServer();
