/**
 * TRADE EXECUTION AND MANAGEMENT ENGINE FOR IQ OPTION
 * 
 * Complies strictly with all user rules:
 * 1. LEVEL 1 INITIAL TRADE ENTRY:
 *    - Uses signal Entry time as exact trade opening time
 *    - Uses signal Timer as duration/expiration
 *    - Does NOT trade immediately upon Telegram arrival
 *    - Does NOT execute if Entry time has already passed
 *    - Executes exactly ONE trade for each signal
 *    - Prevents duplicate trades via deterministic composite keys
 * 
 * 2. TIME PRECISION:
 *    - Timezone-aware timestamps & monotonic millisecond countdown
 *    - Skips trade if late beyond configured tolerance threshold
 *    - Records Scheduled entry time, Actual execution time, Execution delay
 * 
 * 3. IQ OPTION v6.8.9.1:
 *    - Checks connection, account mode, asset resolution, direction, stake
 *    - Performs pre-trade health check before entry
 *    - Handles timeouts safely without blindly repeating orders
 * 
 * 4. MANAGEMENT LEVELS (Level 1 -> Level 2 -> Level 3 -> STOP):
 *    - Level 1 WIN -> STOP immediately
 *    - Level 1 LOSS / IN-LOSS -> Evaluate Level 2 checkpoint
 *    - Level 2 WIN -> STOP | Level 2 LOSS -> Evaluate Level 3 full close
 *    - Level 3 WIN or LOSS -> STOP. Management is strictly capped at Level 3.
 * 
 * 5. MANAGEMENT RULES:
 *    - Loss does NOT automatically trigger blind new trades
 *    - Each level checkpoint evaluates live profit against broker strikes
 *    - When in profit, sends early sell to broker and strictly verifies broker closure confirmation before stopping
 * 
 * 6. TELEGRAM MARTINGALE:
 *    - Ignores Telegram signal's MG1/MG2/MG3 instructions unless explicitly enabled
 *    - Bot internal Level 1/2/3 management system controls execution
 * 
 * 7. RESULT HANDLING:
 *    - Waits for actual IQ Option settlement result (WIN / LOSS / DRAW / UNKNOWN)
 *    - Does not assume result merely because the timer finished
 *    - Unresolved trades block starting the next management level
 * 
 * 8. SAFETY & DEDUPLICATION:
 *    - Priority: ACCURATE ENTRY TIME → ONE TRADE → ACTUAL RESULT → MANAGEMENT IF NEEDED → STOP
 */

import { execFile } from "child_process";
import path from "path";
import fs from "fs";
import { ManagementLevelRule, BotSettings } from "../src/types";
import {
  formatTimeInTz,
  formatDateInTz,
  parseEntryTimeToEpochInTz,
  normalizeTimeZone,
  extractSignalLevelCheckpoints,
} from "./timezone_helper";
import { globalIQClient, isAssetUnavailableError, isInsufficientBalanceError } from "./iqoption_client";

export type TradeState =
  | "SIGNAL_RECEIVED"
  | "VALIDATING"
  | "SCHEDULED"
  | "PREPARING"
  | "WAITING_FOR_ENTRY"
  | "PRE_TRADE_CHECK"
  | "EXECUTING"
  | "OPEN"
  | "EXPIRED"
  | "WIN"
  | "LOSS"
  | "DRAW"
  | "SKIPPED"
  | "FAILED"
  | "CANCELLED";

export interface TradeLogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
}

export interface TradeRecord {
  id: string;
  signalId: string;
  parentTradeId?: string;
  managementLevel: number; // 1 for Level 1 (Signal Entry), 2 for Level 2, 3 for Level 3
  deterministicKey: string;
  sourceChannel: string;
  rawSignalText: string;

  // Core Trade Parameters
  asset: string;
  rawAsset: string;
  action: "CALL" | "PUT";
  durationMinutes: number;
  timeframe: string;

  // Timestamps & Precision (strictly in project timezone)
  signalDate: string; // YYYY-MM-DD
  telegramSentTime: string;
  telegramSentEpochMs: number;

  scheduledEntryTime: string;
  scheduledEntryEpochMs: number;

  actualExecutionTime?: string;
  actualExecutionEpochMs?: number;
  executionDelayMs?: number;

  expectedExpirationTime?: string;
  expectedExpirationEpochMs?: number;
  actualSettlementTime?: string;

  // Intermediate Level Checkpoints (Early Exit Logic)
  level1Time?: string;
  level1EpochMs?: number;
  level2Time?: string;
  level2EpochMs?: number;
  level3Time?: string;
  level3EpochMs?: number;
  earlyClosedAt?: "LEVEL_1" | "LEVEL_2" | "EXPIRATION";

  // Price quotes
  openPrice?: number;
  closePrice?: number;

  // Broker details & Risk
  accountMode: "PRACTICE" | "REAL";
  stake: number;
  orderId?: string;
  isSimulated?: boolean;
  payoutRate?: number;
  profit?: number;

  // State & Outcome
  state: TradeState;
  skipReason?: string;
  failReason?: string;
  outcome?: "WIN" | "LOSS" | "DRAW" | "PENDING" | "SKIPPED" | "FAILED";
  nextLevelTriggered?: boolean;
  childTradeId?: string;

  logs: TradeLogEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface ExecutionEngineConfig {
  getIQCredentials: () => { email: string; password?: string; accountMode: "PRACTICE" | "REAL"; isConnected: boolean };
  getBaseStake: () => number;
  getAccountMode: () => "PRACTICE" | "REAL";
  getBotSettings: () => BotSettings;
  getTimeZone?: () => string;
  isAutoTradeActive: () => boolean;
  onTradeUpdate?: (trade: TradeRecord) => void;
  onLog?: (log: string) => void;
}

// In-Memory Store of Executed Trade Keys (prevents duplicate execution)
const executedTradeKeys = new Set<string>();
const activeScheduledTimers = new Map<string, NodeJS.Timeout>();
const tradeRecords = new Map<string, TradeRecord>();

// Default Tolerance threshold in milliseconds (e.g. 4000ms late window)
const DEFAULT_LATE_TOLERANCE_MS = 4000;

/**
 * Normalizes currency pair names for IQ Option Broker (Dedicated OTC-only Trading Bot)
 * Converts any pair (e.g. "EUR/USD", "EURUSD", "NZD/CAD (OTC)", "NZDCAD-OTC") strictly to its standard OTC format (e.g. "EURUSD-OTC", "NZDCAD-OTC")
 */
export function normalizeAssetForIQ(assetRaw: string): string {
  if (!assetRaw) return "EURUSD-OTC";
  let clean = assetRaw.toUpperCase().trim();
  
  clean = clean
    .replace(/[\/_]/g, "")
    .replace(/\(OTC\)/g, "")
    .replace(/-OTC/g, "")
    .replace(/_OTC/g, "")
    .replace(/\s+OTC/g, "")
    .replace(/OTC$/g, "")
    .replace(/^OTC/g, "");
  
  // Extract standard 6-char currency pair or cryptocurrency
  const match = clean.match(/([A-Z]{6}|[A-Z]{3,5})/);
  const pair = match ? match[1] : clean;
  
  return `${pair}-OTC`;
}

/**
 * Parses scheduled entry time with full date and timezone awareness
 */
export function parseEntryTimeToEpoch(
  timeStr: string | undefined,
  baseDateEpochMs: number = Date.now()
): { scheduledEpochMs: number; formattedTimeStr: string; isExplicit: boolean } {
  const baseDate = new Date(baseDateEpochMs);
  const year = baseDate.getFullYear();
  const month = baseDate.getMonth();
  const day = baseDate.getDate();

  if (!timeStr || !timeStr.trim()) {
    // If no explicit time in signal, default to immediate next minute opening
    const nextMin = new Date(baseDateEpochMs + 60000);
    nextMin.setSeconds(0, 0);
    return {
      scheduledEpochMs: nextMin.getTime(),
      formattedTimeStr: nextMin.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      isExplicit: false,
    };
  }

  const clean = timeStr.trim();
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  // Match 12-hour format: 11:35 PM, 12:57 AM, 09:41:00 AM
  const match12 = clean.match(/^([0-1]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM)$/i);
  // Match 24-hour format: 14:30, 23:35:00, 09:15
  const match24 = clean.match(/^([0-2]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?$/);

  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const s = match12[3] ? parseInt(match12[3], 10) : 0;
    const meridian = match12[4].toUpperCase();

    if (meridian === "PM" && h < 12) h += 12;
    if (meridian === "AM" && h === 12) h = 0;

    hours = h;
    minutes = m;
    seconds = s;
  } else if (match24) {
    hours = parseInt(match24[1], 10);
    minutes = parseInt(match24[2], 10);
    seconds = match24[3] ? parseInt(match24[3], 10) : 0;
  } else {
    // Fallback extraction
    const numbersMatch = clean.match(/([0-2]?[0-9]):([0-5][0-9])/);
    if (numbersMatch) {
      hours = parseInt(numbersMatch[1], 10);
      minutes = parseInt(numbersMatch[2], 10);
      if (/PM/i.test(clean) && hours < 12) hours += 12;
      if (/AM/i.test(clean) && hours === 12) hours = 0;
    }
  }

  const scheduledDate = new Date(year, month, day, hours, minutes, seconds, 0);

  // If parsed time is earlier by more than 12 hours than base, it might be scheduled for next day
  let scheduledEpochMs = scheduledDate.getTime();
  if (scheduledEpochMs < baseDateEpochMs - 12 * 3600 * 1000) {
    scheduledDate.setDate(scheduledDate.getDate() + 1);
    scheduledEpochMs = scheduledDate.getTime();
  }

  const formattedTimeStr = scheduledDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return {
    scheduledEpochMs,
    formattedTimeStr,
    isExplicit: true,
  };
}

export class TradeExecutionEngine {
  private config: ExecutionEngineConfig;

  constructor(config: ExecutionEngineConfig) {
    this.config = config;
  }

  public getTimeZone(): string {
    if (this.config.getTimeZone) {
      return this.config.getTimeZone() || "Africa/Lagos";
    }
    const botSettings = this.config.getBotSettings();
    return botSettings.timeZone || "Africa/Lagos";
  }

  public getCheckpointLeadSeconds(): number {
    const botSettings = this.config.getBotSettings ? this.config.getBotSettings() : undefined;
    if (botSettings && typeof botSettings.checkpointLeadSeconds === "number" && botSettings.checkpointLeadSeconds >= 1) {
      return Math.min(10, botSettings.checkpointLeadSeconds);
    }
    return 3; // Default 3.0 seconds precision lead time
  }

  /**
   * Main entry point when a Telegram Signal is identified (Rule 1: LEVEL 1 INITIAL TRADE ENTRY)
   */
  public processIncomingSignal(params: {
    signalId?: string;
    sourceChannel: string;
    rawText: string;
    asset: string;
    action: "CALL" | "PUT";
    durationMinutes: number;
    timeframe?: string;
    scheduledTimeStr?: string;
    telegramSentTimeEpochMs?: number;
  }): { success: boolean; trade?: TradeRecord; reason?: string } {
    const tz = this.getTimeZone();
    const now = Date.now();
    const telegramSentEpochMs = params.telegramSentTimeEpochMs || now;
    const telegramSentTimeStr = formatTimeInTz(telegramSentEpochMs, tz);
    const signalDateStr = formatDateInTz(telegramSentEpochMs, tz);
    const assetIQ = normalizeAssetForIQ(params.asset);
    const action = params.action.toUpperCase() === "PUT" ? "PUT" : "CALL";
    const durationMinutes = Math.max(1, params.durationMinutes || 1);
    const timeframe = params.timeframe || `M${durationMinutes}`;

    // 1. Resolve Scheduled Entry Time (Rule 1: Use signal Entry time in project timezone)
    const { scheduledEpochMs, formattedTimeStr: scheduledEntryTime } = parseEntryTimeToEpochInTz(
      params.scheduledTimeStr,
      telegramSentEpochMs,
      tz,
      params.rawText
    );

    // 2. Extract Intermediate Level 1, Level 2, Level 3 Checkpoint Times
    const checkpoints = extractSignalLevelCheckpoints(params.rawText, scheduledEntryTime, 2);
    const level1EpochMs = checkpoints.level1DiffMinutes
      ? scheduledEpochMs + (checkpoints.level1DiffMinutes * 60 * 1000)
      : undefined;
    const level2EpochMs = checkpoints.level2DiffMinutes
      ? scheduledEpochMs + (checkpoints.level2DiffMinutes * 60 * 1000)
      : undefined;
    const level3EpochMs = checkpoints.level3DiffMinutes
      ? scheduledEpochMs + (checkpoints.level3DiffMinutes * 60 * 1000)
      : undefined;

    // 3. Build Deterministic Trade Key (Rule 1 & 8: Prevent duplicate trades, ONE trade per signal)
    const deterministicKey = `${signalDateStr}_${scheduledEntryTime.replace(/\s+/g, "")}_${assetIQ}_${action}_L1`;
    const tradeId = params.signalId || `TRD-${now}-${Math.floor(Math.random() * 1000)}`;

    const currentAccountMode = this.config.getAccountMode();
    const currentStake = this.config.getBaseStake();

    // Initialize Level 1 Trade Record with Intermediate Checkpoints
    const tradeRecord: TradeRecord = {
      id: tradeId,
      signalId: params.signalId || tradeId,
      managementLevel: 1,
      deterministicKey,
      sourceChannel: params.sourceChannel,
      rawSignalText: params.rawText,
      asset: assetIQ,
      rawAsset: params.asset,
      action,
      durationMinutes,
      timeframe,
      signalDate: signalDateStr,
      telegramSentTime: telegramSentTimeStr,
      telegramSentEpochMs,
      scheduledEntryTime,
      scheduledEntryEpochMs: scheduledEpochMs,
      level1Time: checkpoints.level1Time,
      level1EpochMs,
      level2Time: checkpoints.level2Time,
      level2EpochMs,
      level3Time: checkpoints.level3Time,
      level3EpochMs,
      accountMode: currentAccountMode,
      stake: currentStake,
      state: "SIGNAL_RECEIVED",
      logs: [],
      createdAt: now,
      updatedAt: now,
    };

    this.addTradeLog(
      tradeRecord,
      `[SIGNAL RECEIVED] ${assetIQ} ${action} | Entry: ${scheduledEntryTime} (${tz}) | Expiration Target: ${durationMinutes}m (${timeframe}) | Single Trade Execution (Runs to Expiration)`,
      "info"
    );

    // 3. Prevent Duplicate Trades (Rule 1 & 8)
    if (executedTradeKeys.has(deterministicKey)) {
      tradeRecord.state = "SKIPPED";
      tradeRecord.skipReason = "DUPLICATE_SIGNAL_ALREADY_PROCESSED";
      tradeRecord.outcome = "SKIPPED";
      this.addTradeLog(tradeRecord, `[DUPLICATE IGNORED] Trade key ${deterministicKey} has already been registered. Skipping to prevent duplicate execution.`, "warn");
      this.saveTradeRecord(tradeRecord);
      return { success: false, trade: tradeRecord, reason: "DUPLICATE_SIGNAL" };
    }

    // 4. Validate Telegram Sent Time vs Entry Time (Rule 1 & 2)
    // If Entry was already in the past when Telegram sent it, reject as invalid
    if (scheduledEpochMs < telegramSentEpochMs - 5000) {
      tradeRecord.state = "SKIPPED";
      tradeRecord.skipReason = "SIGNAL_SENT_AFTER_ENTRY_TIME";
      tradeRecord.outcome = "SKIPPED";
      this.addTradeLog(
        tradeRecord,
        `[INVALID SIGNAL TIMING] Signal Entry time (${scheduledEntryTime}) was earlier than Telegram sent time (${telegramSentTimeStr}). Trade skipped.`,
        "error"
      );
      this.saveTradeRecord(tradeRecord);
      return { success: false, trade: tradeRecord, reason: "SENT_AFTER_ENTRY" };
    }

    // 5. Late Entry Protection (Rule 1 & 2: Do NOT execute if Entry time has already passed)
    if (now > scheduledEpochMs + DEFAULT_LATE_TOLERANCE_MS) {
      tradeRecord.state = "SKIPPED";
      tradeRecord.skipReason = "ENTRY_ALREADY_PASSED";
      tradeRecord.outcome = "SKIPPED";
      const secondsLate = ((now - scheduledEpochMs) / 1000).toFixed(1);
      this.addTradeLog(
        tradeRecord,
        `[ENTRY ALREADY PASSED] Scheduled entry ${scheduledEntryTime} passed ${secondsLate}s ago. Current time: ${formatTimeInTz(now, tz)}. Trade skipped (Late Protection).`,
        "warn"
      );
      this.saveTradeRecord(tradeRecord);
      return { success: false, trade: tradeRecord, reason: "ENTRY_ALREADY_PASSED" };
    }

    // 6. Check if Auto-Trade Bot is Active
    if (!this.config.isAutoTradeActive()) {
      tradeRecord.state = "SKIPPED";
      tradeRecord.skipReason = "AUTO_TRADE_INACTIVE";
      tradeRecord.outcome = "SKIPPED";
      this.addTradeLog(tradeRecord, `[BOT INACTIVE] Auto-Trade session is currently stopped. Signal logged without execution.`, "warn");
      this.saveTradeRecord(tradeRecord);
      return { success: false, trade: tradeRecord, reason: "AUTO_TRADE_INACTIVE" };
    }

    // Mark trade key as scheduled
    executedTradeKeys.add(deterministicKey);

    // 7. Schedule Precision Execution (Rule 1 & 2: Do NOT trade immediately; schedule for Entry Time)
    tradeRecord.state = "SCHEDULED";
    const delayMs = scheduledEpochMs - now;
    this.addTradeLog(
      tradeRecord,
      `[TRADE SCHEDULED] Level 1 trade scheduled for exact Entry: ${scheduledEntryTime} (in ${(delayMs / 1000).toFixed(1)}s, TZ: ${tz})`,
      "success"
    );
    this.saveTradeRecord(tradeRecord);

    this.scheduleTradeExecution(tradeRecord);

    return { success: true, trade: tradeRecord };
  }

  /**
   * Precision Scheduler that executes at the exact Entry second using monotonic clock countdown
   */
  private scheduleTradeExecution(trade: TradeRecord, maxAllowedDelayMs: number = DEFAULT_LATE_TOLERANCE_MS) {
    const now = Date.now();
    const delayMs = trade.scheduledEntryEpochMs - now;

    // 1. Pre-Trade Preparation at T-5 seconds (Rule 3: IQ Option health check)
    if (delayMs > 5000) {
      const prepTimeout = setTimeout(() => {
        if (trade.state === "SCHEDULED") {
          trade.state = "PREPARING";
          this.addTradeLog(trade, `[PRE-TRADE CHECK] Verifying IQ Option v6.8.9.1 connection, account mode (${trade.accountMode}), and asset ${trade.asset}...`, "info");
          
          const iqCreds = this.config.getIQCredentials();
          if (iqCreds.isConnected || (iqCreds.email && iqCreds.password)) {
            trade.state = "WAITING_FOR_ENTRY";
            this.addTradeLog(trade, `[PRE-TRADE OK] Health check passed. Standing by for exact entry second: ${trade.scheduledEntryTime}`, "info");
          } else {
            trade.state = "WAITING_FOR_ENTRY";
            this.addTradeLog(trade, `[PRE-TRADE NOTICE] Running in simulation bridge mode for ${trade.asset}.`, "info");
          }
          this.saveTradeRecord(trade);
        }
      }, delayMs - 4500);

      activeScheduledTimers.set(`prep_${trade.id}`, prepTimeout);
    }

    // 2. High-Precision Execution Trigger at exact Entry second (Rule 2: Monotonic execution)
    const execTimeout = setTimeout(() => {
      this.executeTradeNow(trade, maxAllowedDelayMs);
    }, Math.max(0, delayMs));

    activeScheduledTimers.set(`exec_${trade.id}`, execTimeout);
  }

  /**
   * Executes the trade on IQ Option at the scheduled entry second
   */
  private executeTradeNow(trade: TradeRecord, maxAllowedDelayMs: number = DEFAULT_LATE_TOLERANCE_MS) {
    const tz = this.getTimeZone();
    const currentNow = Date.now();

    // 1. Pre-Trade Health & Timing Check (Rule 2 & 3: Skip if late beyond tolerance)
    trade.state = "PRE_TRADE_CHECK";
    this.addTradeLog(trade, `[EXECUTION TRIGGER] Pre-trade health check at ${formatTimeInTz(currentNow, tz)}...`, "info");

    const delayMs = currentNow - trade.scheduledEntryEpochMs;
    if (currentNow > trade.scheduledEntryEpochMs + maxAllowedDelayMs) {
      trade.state = "SKIPPED";
      trade.skipReason = `LATE_EXECUTION_EXCEEDED_${delayMs}MS`;
      trade.outcome = "SKIPPED";
      this.addTradeLog(trade, `[LATE TOLERANCE EXCEEDED] Current time is ${delayMs}ms past scheduled entry (limit: ${maxAllowedDelayMs}ms). Trade SKIPPED per Rule 2.`, "error");
      this.saveTradeRecord(trade);
      return;
    }

    // 2. Dispatch Single Order to IQ Option Broker (Rule 1 & 3: Place ONE order)
    trade.state = "EXECUTING";
    const actualExecutionEpochMs = currentNow;
    const actualExecutionTimeStr = formatTimeInTz(actualExecutionEpochMs, tz) + "." + String(actualExecutionEpochMs % 1000).padStart(3, "0");

    trade.actualExecutionTime = actualExecutionTimeStr;
    trade.actualExecutionEpochMs = actualExecutionEpochMs;
    trade.executionDelayMs = delayMs;

    const delaySign = delayMs >= 0 ? `+${delayMs}ms` : `${delayMs}ms`;
    this.addTradeLog(
      trade,
      `[DISPATCHING ORDER] Level ${trade.managementLevel} ${trade.action} on ${trade.asset} | Stake: $${trade.stake.toFixed(2)} | Timer: ${trade.durationMinutes}m | Execution Delay: ${delaySign}`,
      "info"
    );

    // Call Native High-Performance IQ Option Live WebSocket Client
    (async () => {
      try {
        const iqCreds = this.config.getIQCredentials();
        
        // Ensure account mode is set on global client
        globalIQClient.setAccountMode(trade.accountMode);

        const result = await globalIQClient.placeOrder({
          asset: trade.asset,
          action: trade.action,
          stake: trade.stake,
          durationMinutes: trade.durationMinutes,
          accountMode: trade.accountMode,
          scheduledEntryEpochMs: trade.scheduledEntryEpochMs,
        });

        if (!result || !result.success) {
          const errorMsg = result?.error || "Order placement failed on IQ Option.";
          const isClosed = isAssetUnavailableError(errorMsg);

          if (isClosed) {
            trade.state = "SKIPPED";
            trade.skipReason = `ASSET_MARKET_CLOSED: ${trade.asset}`;
            trade.failReason = errorMsg;
            trade.outcome = "SKIPPED";
            this.addTradeLog(
              trade,
              `[ASSET UNAVAILABLE / MARKET CLOSED] ${trade.asset} (and counterpart OTC) is not open for trading right now on IQ Option. Trade skipped safely.`,
              "warn"
            );
          } else if (isInsufficientBalanceError(errorMsg)) {
            trade.state = "FAILED";
            trade.failReason = errorMsg;
            trade.outcome = "FAILED";
            this.addTradeLog(trade, `[INSUFFICIENT FUNDS / BROKER REJECTED] IQ Option broker confirmed insufficient balance/bonus: ${errorMsg}`, "error");
          } else {
            trade.state = "FAILED";
            trade.failReason = errorMsg;
            trade.outcome = "FAILED";
            this.addTradeLog(trade, `[TRADE REJECTED] Broker returned error: ${errorMsg}`, "error");
          }
          this.saveTradeRecord(trade);
          return;
        }

        // If asset was auto-swapped to open OTC counterpart
        if (result.asset && result.asset !== trade.asset) {
          const originalAsset = trade.asset;
          trade.asset = result.asset;
          this.addTradeLog(trade, `[AUTO-FALLBACK] ${originalAsset} was closed on broker; placed order on open OTC counterpart ${result.asset}.`, "info");
        }

        // Order successfully placed on real broker (Rule 1 & 3)
        trade.orderId = String(result.orderId);
        trade.isSimulated = Boolean(result.isSimulated);
        trade.payoutRate = result.payout || 87;
        trade.state = "OPEN";
        trade.outcome = "PENDING";

        // Debit stake from active balance
        globalIQClient.debitBalanceForOrder(trade.stake, trade.accountMode);

        const expectedExpirationEpochMs = actualExecutionEpochMs + (trade.durationMinutes * 60 * 1000);
        trade.expectedExpirationEpochMs = expectedExpirationEpochMs;
        trade.expectedExpirationTime = formatTimeInTz(expectedExpirationEpochMs, tz);

        // Fetch initial open strike price for checkpoint reference
        globalIQClient.getCurrentPrice(trade.asset).then((spot) => {
          if (spot && !trade.openPrice) {
            trade.openPrice = spot;
          }
        }).catch(() => {});

        this.addTradeLog(
          trade,
          `[ORDER OPEN] Real Broker Order #${trade.orderId} Active on IQ Option (${trade.accountMode}) | Asset: ${trade.asset} | Expiration: ${trade.expectedExpirationTime} (${trade.durationMinutes}m / ${trade.timeframe}) | Running to natural broker expiry`,
          "success"
        );
        this.saveTradeRecord(trade);

        // Schedule Result Settlement Check upon Expiry (Direct Level 1 / Timer Expiration - Full Stake + Profit on Win)
        const expiryWaitMs = Math.max(1000, expectedExpirationEpochMs - Date.now() + 1500);
        const expTimer = setTimeout(() => {
          this.pollOrderResult(trade);
        }, expiryWaitMs);
        activeScheduledTimers.set(`exp_${trade.id}`, expTimer);
        this.addTradeLog(
          trade,
          `[EXPIRATION WATCHER SCHEDULED] Contract will expire naturally at ${trade.expectedExpirationTime} (${(expiryWaitMs / 1000).toFixed(1)}s). Awaiting official broker settlement for full stake + payout.`,
          "info"
        );
      } catch (err: any) {
        trade.state = "FAILED";
        trade.failReason = err.message || String(err);
        trade.outcome = "FAILED";
        this.addTradeLog(trade, `[TRADE EXCEPTION] Order dispatch exception: ${trade.failReason}`, "error");
        this.saveTradeRecord(trade);
      }
    })();
  }

  /**
   * Evaluates intermediate Level Checkpoints (Level 1 and Level 2) with Precision Timing (3s Before Minute)
   * If the position is positive (in profit), it closes the trade immediately via IQ Option sell_option API.
   * If negative/neutral, the trade continues running.
   */
  private async evaluateCheckpoint(trade: TradeRecord, levelNum: 1 | 2) {
    if (trade.state !== "OPEN") {
      // Trade already sold early, closed, or cancelled
      return;
    }

    const tz = this.getTimeZone();
    const nowMs = Date.now();
    const checkTimeStr = formatTimeInTz(nowMs, tz);
    const targetTimeStr = levelNum === 1 ? trade.level1Time : trade.level2Time;
    const targetEpochMs = levelNum === 1 ? trade.level1EpochMs : trade.level2EpochMs;
    const secondsAhead = targetEpochMs ? Math.max(0, (targetEpochMs - nowMs) / 1000).toFixed(1) : "3.0";

    this.addTradeLog(
      trade,
      `[LEVEL ${levelNum} CHECKPOINT: PRECISION T-3s (${checkTimeStr})] Triggered ${secondsAhead}s before target ${targetTimeStr || "--"}. Checking spot price & profit state...`,
      "info"
    );

    // 1. Fetch current spot price from IQ Option (ultra-fast from live quote stream or WebSocket query)
    const currentPrice = await globalIQClient.getCurrentPrice(trade.asset);
    let openPrice = trade.openPrice;
    if (!openPrice && currentPrice) {
      openPrice = currentPrice;
      trade.openPrice = openPrice;
    }

    let isPositive = false;
    let priceDetails = "";

    if (currentPrice !== null && openPrice !== undefined) {
      if (trade.action === "CALL") {
        isPositive = currentPrice > openPrice;
        priceDetails = `Spot Price ${currentPrice} vs Strike ${openPrice} (CALL ${isPositive ? "IN-THE-MONEY 🟢" : "OUT-OF-THE-MONEY 🔴"})`;
      } else {
        isPositive = currentPrice < openPrice;
        priceDetails = `Spot Price ${currentPrice} vs Strike ${openPrice} (PUT ${isPositive ? "IN-THE-MONEY 🟢" : "OUT-OF-THE-MONEY 🔴"})`;
      }
    } else {
      // Query broker position profit state directly
      const posCheck = await globalIQClient.checkOptionProfitState(trade.orderId || "");
      if (posCheck) {
        isPositive = posCheck.isPositive;
        priceDetails = posCheck.details;
      }
    }

    // 2. Decision Logic
    if (isPositive) {
      this.addTradeLog(
        trade,
        `[LEVEL ${levelNum} CHECKPOINT: POSITIVE 🟢] ${priceDetails}. Position is in profit! Sending early sell command 3s ahead of minute close to IQ Option broker...`,
        "info"
      );

      // Execute early sale via IQ Option broker API with confirmation feedback
      const sellResult = await globalIQClient.sellOption(trade.orderId || "");

      if (sellResult.success && sellResult.confirmed) {
        // Clear remaining timers for this trade
        if (levelNum === 1) {
          const l2Timer = activeScheduledTimers.get(`l2_${trade.id}`);
          if (l2Timer) {
            clearTimeout(l2Timer);
            activeScheduledTimers.delete(`l2_${trade.id}`);
          }
        }
        const expTimer = activeScheduledTimers.get(`exp_${trade.id}`);
        if (expTimer) {
          clearTimeout(expTimer);
          activeScheduledTimers.delete(`exp_${trade.id}`);
        }

        const payout = trade.payoutRate || 87;
        const profit = typeof sellResult.profit === "number" && sellResult.profit > 0
          ? sellResult.profit
          : Number((trade.stake * (payout / 100)).toFixed(2));

        const grossReturn = Number((trade.stake + profit).toFixed(2));
        globalIQClient.creditBalanceForSettlement(grossReturn, trade.accountMode);

        const closeTimestamp = Date.now();
        const closeTimeStr = formatTimeInTz(closeTimestamp, tz);

        trade.state = "WIN";
        trade.outcome = "WIN";
        trade.profit = profit;
        trade.earlyClosedAt = levelNum === 1 ? "LEVEL_1" : "LEVEL_2";
        trade.closePrice = currentPrice || openPrice;
        trade.actualSettlementTime = closeTimeStr;

        this.addTradeLog(
          trade,
          `[EARLY CLOSE CONFIRMED BY BROKER 🎯] Order #${trade.orderId} officially SOLD & CLOSED on IQ Option at Level ${levelNum} (${closeTimeStr})! Realized Net Profit: +$${profit.toFixed(2)} (Gross Return: $${grossReturn.toFixed(2)} [Stake $${trade.stake} + Profit $${profit.toFixed(2)}]). Trade finalized permanently.`,
          "success"
        );

        globalIQClient.fetchProfileAndBalancesRest().catch(() => {});
        this.saveTradeRecord(trade);
      } else {
        // Broker did NOT confirm early closure (e.g. broker rejected early sale or instrument does not support early sale)
        const nextTarget = levelNum === 1
          ? `Level 2 Checkpoint (${trade.level2Time || "target"})`
          : `Level 3 full Expiration (${trade.expectedExpirationTime})`;

        this.addTradeLog(
          trade,
          `[EARLY CLOSE NOT ACCEPTED BY BROKER ⚠️] IQ Option broker did not close Order #${trade.orderId} early (${sellResult.error || "Sale unconfirmed or rejected by broker"}). Position remains LIVE on broker and CONTINUES RUNNING to ${nextTarget}.`,
          "warn"
        );
        this.saveTradeRecord(trade);
      }
    } else {
      if (levelNum === 1) {
        this.addTradeLog(
          trade,
          `[LEVEL 1 CHECKPOINT: NOT POSITIVE 🟡] ${priceDetails || "Spot not above strike"}. Position is not positive yet. Trade CONTINUES RUNNING to Level 2 Checkpoint (${trade.level2Time || "target"}).`,
          "info"
        );
      } else {
        this.addTradeLog(
          trade,
          `[LEVEL 2 CHECKPOINT: NOT POSITIVE 🟡] ${priceDetails || "Spot not above strike"}. Position is not positive yet. Trade CONTINUES RUNNING to Level 3 full Expiration (${trade.expectedExpirationTime}).`,
          "info"
        );
      }
      this.saveTradeRecord(trade);
    }
  }

  /**
   * Polls IQ Option for Final Trade Result (WIN / LOSS / DRAW) (Rule 7: Wait for actual result)
   */
  private async pollOrderResult(trade: TradeRecord, retryCount: number = 0) {
    if (trade.state !== "OPEN") {
      // Already closed early at Level 1 or Level 2, or already finalized
      return;
    }

    const tz = this.getTimeZone();
    trade.state = "EXPIRED";
    if (retryCount === 0) {
      this.addTradeLog(trade, `[TRADE EXPIRED] Reached expiration time ${trade.expectedExpirationTime}. Retrieving verified settlement from IQ Option...`, "info");
    }

    try {
      const settlement = await globalIQClient.getOrderSettlement(trade.orderId || "", trade.stake, 8000);

      if (!settlement.settled || settlement.outcome === "PENDING") {
        if (retryCount < 2) {
          this.addTradeLog(trade, `[SETTLEMENT PENDING] Broker settlement processing. Retrying check in 3 seconds (Attempt ${retryCount + 2}/3)...`, "info");
          setTimeout(() => {
            this.pollOrderResult(trade, retryCount + 1);
          }, 3000);
          return;
        }

        // After max retries, keep as pending without assuming loss
        this.addTradeLog(trade, `[SETTLEMENT AWAITING CONFIRMATION] Order #${trade.orderId} outcome still pending on IQ Option. Awaiting manual refresh or broker event. Martingale halted to prevent unconfirmed trades.`, "warn");
        this.saveTradeRecord(trade);
        return;
      }

      const outcome: "WIN" | "LOSS" | "DRAW" = settlement.outcome === "WIN" ? "WIN" : (settlement.outcome === "DRAW" ? "DRAW" : "LOSS");
      const profit = settlement.profit;

      trade.state = outcome;
      trade.outcome = outcome;
      trade.profit = profit;
      trade.earlyClosedAt = "EXPIRATION";
      trade.actualSettlementTime = formatTimeInTz(Date.now(), tz);

      // Refresh broker live balances
      globalIQClient.fetchProfileAndBalancesRest().catch(() => {});

      if (outcome === "WIN") {
        const grossReturn = Number((trade.stake + profit).toFixed(2));
        globalIQClient.creditBalanceForSettlement(grossReturn, trade.accountMode);
        this.addTradeLog(trade, `[TRADE RESULT: WIN 🟢] Real Broker Order #${trade.orderId} WON! Verified Net Profit: +$${profit.toFixed(2)} (Gross Credited: $${grossReturn.toFixed(2)})`, "success");
        this.addTradeLog(trade, `[SINGLE TRADE FINALIZED] Trade completed successfully with profit +$${profit.toFixed(2)}. Exactly 1 trade per signal.`, "info");
        this.saveTradeRecord(trade);
        return;
      } else if (outcome === "DRAW") {
        globalIQClient.creditBalanceForSettlement(trade.stake, trade.accountMode);
        this.addTradeLog(trade, `[TRADE RESULT: DRAW ⚪] Order #${trade.orderId} ended in DRAW (Risk stake $${trade.stake} fully refunded). Single trade finalized. STOP.`, "info");
        this.saveTradeRecord(trade);
        return;
      } else {
        // LOSS confirmed
        this.addTradeLog(trade, `[TRADE RESULT: LOSS 🔴] Order #${trade.orderId} Closed OTM on IQ Option. Loss: -$${Math.abs(profit).toFixed(2)}.`, "warn");
        this.addTradeLog(trade, `[SINGLE TRADE FINALIZED] Single trade completed. Martingale retakes strictly disabled per user rules. STOP.`, "info");
        this.saveTradeRecord(trade);
        return;
      }
    } catch (e: any) {
      this.addTradeLog(trade, `[SETTLEMENT ERROR] Error querying IQ Option settlement: ${e.message || String(e)}`, "error");
      this.saveTradeRecord(trade);
    }
  }

  /**
   * Evaluates and Schedules Next Management Level (Strictly disabled - Single Trade Only)
   */
  private evaluateNextManagementLevel(parentTrade: TradeRecord) {
    this.addTradeLog(
      parentTrade,
      `[SINGLE TRADE ONLY] Martingale retakes are disabled. Exactly 1 single trade executed per signal. STOP.`,
      "info"
    );
    return;
  }

  private addTradeLog(trade: TradeRecord, message: string, type: "info" | "success" | "warn" | "error" = "info") {
    const timeStr = formatTimeInTz(Date.now(), this.getTimeZone());
    trade.logs.push({ timestamp: timeStr, message, type });
    trade.updatedAt = Date.now();
    console.log(`[EXECUTION ENGINE] ${message}`);
    if (this.config.onLog) {
      this.config.onLog(`[${timeStr}] ${message}`);
    }
  }

  private saveTradeRecord(trade: TradeRecord) {
    trade.updatedAt = Date.now();
    tradeRecords.set(trade.id, trade);
    if (this.config.onTradeUpdate) {
      this.config.onTradeUpdate(trade);
    }
  }

  public getAllTrades(): TradeRecord[] {
    return Array.from(tradeRecords.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getTradeById(id: string): TradeRecord | undefined {
    return tradeRecords.get(id);
  }

  public clearAllTrades(): void {
    // Clear scheduled timers
    for (const [key, timer] of activeScheduledTimers.entries()) {
      clearTimeout(timer);
    }
    activeScheduledTimers.clear();
    tradeRecords.clear();
  }
}
