import React, { useState, useEffect } from "react";
import { 
  Activity, Zap, Clock, ArrowUpRight, ArrowDownRight, 
  CheckCircle2, XCircle, RefreshCw, AlertTriangle, ShieldCheck,
  DollarSign, Sparkles, ChevronRight, Layers, FileText
} from "lucide-react";
import { TradeRecord, ParsedSignal } from "../types";

interface LiveTradePlayCardProps {
  trade: TradeRecord;
  parsedSignal?: ParsedSignal;
  rawText?: string;
  sourceChannel?: string;
  timestamp?: string;
  onToggleAudit?: () => void;
  isExpanded?: boolean;
}

export const LiveTradePlayCard: React.FC<LiveTradePlayCardProps> = ({
  trade,
  parsedSignal,
  rawText,
  sourceChannel,
  timestamp,
  onToggleAudit,
  isExpanded = false,
}) => {
  const [nowMs, setNowMs] = useState(Date.now());

  // Continuous monotonic ticker for live countdowns and progress bars
  useEffect(() => {
    const isLive = trade.state === "SCHEDULED" || trade.state === "WAITING_FOR_ENTRY" || trade.state === "PREPARING" || trade.state === "EXECUTING" || trade.state === "OPEN";
    if (!isLive) return;

    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 250);

    return () => clearInterval(timer);
  }, [trade.state]);

  // Calculate live countdowns
  const scheduledEpoch = trade.scheduledEntryEpochMs || 0;
  const expectedExpiryEpoch = trade.expectedExpirationEpochMs || (trade.actualExecutionEpochMs ? trade.actualExecutionEpochMs + (trade.durationMinutes * 60000) : 0);
  const executionEpoch = trade.actualExecutionEpochMs || 0;

  const secondsUntilEntry = Math.max(0, Math.ceil((scheduledEpoch - nowMs) / 1000));
  const totalDurationMs = trade.durationMinutes * 60 * 1000;
  
  let remainingExpirySeconds = 0;
  let progressPercent = 0;

  if (trade.state === "OPEN" && expectedExpiryEpoch > 0) {
    remainingExpirySeconds = Math.max(0, Math.ceil((expectedExpiryEpoch - nowMs) / 1000));
    const elapsedMs = Math.max(0, nowMs - (executionEpoch || (expectedExpiryEpoch - totalDurationMs)));
    progressPercent = Math.min(100, Math.max(0, (elapsedMs / (totalDurationMs || 60000)) * 100));
  }

  const isCall = trade.action === "CALL";
  const levelBadge = trade.managementLevel <= 1
    ? "Level 1 (Signal Entry)"
    : trade.managementLevel === 2
    ? "Level 2 (Checkpoint 2)"
    : "Level 3 (Full Close)";

  return (
    <div className={`p-4 rounded-2xl border transition-all space-y-3 ${
      trade.state === "OPEN"
        ? "bg-slate-950/95 border-emerald-500/60 ring-1 ring-emerald-500/30 shadow-lg"
        : trade.state === "WIN"
        ? "bg-emerald-950/25 border-emerald-500/40 shadow-sm"
        : trade.state === "LOSS"
        ? "bg-rose-950/25 border-rose-500/40 shadow-sm"
        : trade.state === "SCHEDULED" || trade.state === "WAITING_FOR_ENTRY"
        ? "bg-slate-950 border-purple-500/40 shadow-sm"
        : "bg-slate-950 border-slate-800"
    }`}>
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Asset Badge */}
          <span className="text-xs font-bold font-mono text-white bg-slate-900 border border-slate-800 px-2.5 py-1 rounded-lg">
            {trade.asset}
          </span>

          {/* Action Direction Badge */}
          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold font-mono flex items-center gap-1 ${
            isCall
              ? "bg-emerald-500/25 text-emerald-300 border border-emerald-500/50"
              : "bg-rose-500/25 text-rose-300 border border-rose-500/50"
          }`}>
            {isCall ? (
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

          {/* Management Level Badge */}
          <span className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-bold border ${
            trade.managementLevel <= 1
              ? "bg-slate-900 text-slate-300 border-slate-800"
              : "bg-sky-500/20 text-sky-300 border-sky-500/40"
          }`}>
            {levelBadge}
          </span>
        </div>

        {/* Status / Outcome Badge */}
        <div className="flex items-center gap-2">
          {sourceChannel && (
            <span className="hidden sm:inline text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 truncate max-w-[140px]">
              {sourceChannel}
            </span>
          )}

          {trade.state === "OPEN" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/25 text-emerald-300 border border-emerald-500/50 flex items-center gap-1.5 animate-pulse shadow-sm">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>LIVE ON BROKER ({remainingExpirySeconds}s left)</span>
            </span>
          ) : trade.state === "SCHEDULED" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
              <span>
                SCHEDULED {secondsUntilEntry > 0 ? `(in ${secondsUntilEntry}s)` : `(${trade.scheduledEntryTime})`}
              </span>
            </span>
          ) : trade.state === "PREPARING" || trade.state === "WAITING_FOR_ENTRY" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1.5 animate-pulse">
              <RefreshCw className="w-3.5 h-3.5 text-cyan-400 animate-spin" />
              <span>ENTERING NOW... ({secondsUntilEntry}s)</span>
            </span>
          ) : trade.state === "EXECUTING" || trade.state === "PRE_TRADE_CHECK" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1.5 animate-pulse">
              <Zap className="w-3.5 h-3.5 text-blue-400" />
              <span>PLACING BROKER ORDER</span>
            </span>
          ) : trade.state === "WIN" || trade.outcome === "WIN" ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-emerald-500/30 text-emerald-200 border border-emerald-400 flex items-center gap-1.5 shadow-sm">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                WIN (+${(trade.profit || (trade.stake * 0.87)).toFixed(2)}) 🟢
                {trade.earlyClosedAt && trade.earlyClosedAt !== "EXPIRATION" ? ` • Closed at ${trade.earlyClosedAt.replace("_", " ")}` : ""}
              </span>
            </span>
          ) : trade.state === "LOSS" || trade.outcome === "LOSS" ? (
            <span className="px-3 py-1 rounded-full text-xs font-bold font-mono bg-rose-500/30 text-rose-200 border border-rose-400 flex items-center gap-1.5 shadow-sm">
              <XCircle className="w-4 h-4 text-rose-400" />
              <span>LOSS (-${trade.stake.toFixed(2)}) 🔴</span>
            </span>
          ) : trade.state === "DRAW" || trade.outcome === "DRAW" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1.5">
              <span>DRAW (Refunded) ⚪</span>
            </span>
          ) : trade.state === "SKIPPED" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              <span>{trade.skipReason?.includes("MARKET_CLOSED") || trade.skipReason?.includes("ASSET") ? "SKIPPED (Market Closed)" : "SKIPPED"}</span>
            </span>
          ) : trade.state === "FAILED" ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-bold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>FAILED</span>
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-slate-800 text-slate-300 border border-slate-700">
              {trade.state}
            </span>
          )}
        </div>
      </div>

      {/* 🔴 LIVE REAL-TIME ACTIVE TRADE PROGRESS BAR WHEN OPEN */}
      {trade.state === "OPEN" && (
        <div className="bg-slate-900/90 border border-emerald-500/40 rounded-xl p-3 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold">
              <Activity className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
              <span>TRADE IN PROGRESS (IQ OPTION {trade.accountMode})</span>
            </div>
            <div className="text-white font-bold">
              <span>{remainingExpirySeconds}s / {trade.durationMinutes * 60}s remaining</span>
            </div>
          </div>

          {/* Animated Duration Progress Bar */}
          <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-sky-400 transition-all duration-300 rounded-full shadow-sm"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-0.5">
            <span>Entered At: <strong className="text-white">{trade.actualExecutionTime || trade.scheduledEntryTime}</strong></span>
            <span>Target Expiry: <strong className="text-white">{trade.expectedExpirationTime || "Calculating..."}</strong></span>
          </div>
        </div>
      )}

      {/* Parameter Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
          <span className="text-[10px] text-slate-500 block uppercase">Timer / Expiry</span>
          <span className="text-white font-bold">
            {trade.timeframe} ({trade.durationMinutes} min)
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
          <span className="text-[10px] text-slate-500 block uppercase">Scheduled Entry</span>
          <span className="text-amber-300 font-bold">
            {trade.scheduledEntryTime}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
          <span className="text-[10px] text-slate-500 block uppercase">Stake & Mode</span>
          <span className="text-emerald-300 font-bold">
            ${trade.stake.toFixed(2)} &bull; {trade.accountMode}
          </span>
        </div>

        <div className="bg-slate-900/90 border border-slate-800 p-2 rounded-xl">
          <span className="text-[10px] text-slate-500 block uppercase">Broker Order</span>
          <span className="text-sky-300 font-bold truncate block">
            {trade.orderId ? `#${trade.orderId}` : trade.state === "SCHEDULED" ? "Awaiting Entry" : "Processing"}
          </span>
        </div>
      </div>

      {/* Expiration Target & Broker Settlement Info */}
      <div className="bg-slate-900/80 border border-slate-800/80 rounded-xl p-2.5 text-xs font-mono space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-bold text-slate-300 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>Target Expiration Strategy (Direct Expiry &bull; 100% Stake + Payout on Win)</span>
          </span>
          {trade.outcome && (
            <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
              trade.outcome === "WIN"
                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                : trade.outcome === "LOSS"
                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                : "bg-slate-800 text-slate-300 border-slate-700"
            }`}>
              🎯 Settled ({trade.outcome})
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
          <div className="p-1.5 rounded-lg border bg-slate-950/60 border-slate-800 text-slate-300 text-center">
            <div className="text-[9px] uppercase text-slate-500">Entry Time</div>
            <div className="text-white font-bold">{trade.scheduledEntryTime || "--"}</div>
            <div className="text-[9px] text-slate-500">Signal Start</div>
          </div>

          <div className="p-1.5 rounded-lg border bg-slate-950/60 border-slate-800 text-slate-300 text-center">
            <div className="text-[9px] uppercase text-slate-500">Timer Duration</div>
            <div className="text-emerald-300 font-bold">{trade.durationMinutes} min ({trade.timeframe})</div>
            <div className="text-[9px] text-slate-500">{trade.level1Time ? `Target: ${trade.level1Time}` : "Direct Expiry"}</div>
          </div>

          <div className="p-1.5 rounded-lg border bg-slate-950/60 border-slate-800 text-slate-300 text-center col-span-2 sm:col-span-1">
            <div className="text-[9px] uppercase text-slate-500">Contract Expiration</div>
            <div className="text-sky-300 font-bold">{trade.expectedExpirationTime || "--"}</div>
            <div className="text-[9px] text-slate-500">Broker Settlement</div>
          </div>
        </div>
      </div>

      {/* Execution Timing & Delays */}
      {(trade.actualExecutionTime || trade.skipReason || trade.failReason) && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-2.5 text-xs font-mono space-y-1">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
            {trade.actualExecutionTime && (
              <span className="text-slate-300">
                Executed At: <strong className="text-white">{trade.actualExecutionTime}</strong> {trade.executionDelayMs !== undefined ? `(${trade.executionDelayMs >= 0 ? `+${trade.executionDelayMs}` : trade.executionDelayMs}ms delay)` : ""}
              </span>
            )}
            {trade.actualSettlementTime && (
              <span className="text-slate-300">
                Settled At: <strong className="text-white">{trade.actualSettlementTime}</strong>
              </span>
            )}
            {trade.skipReason && (
              <span className="text-amber-400 font-semibold">
                Reason: {trade.skipReason}
              </span>
            )}
            {trade.failReason && (
              <span className="text-rose-400 font-semibold">
                Reason: {trade.failReason}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Raw Signal Text */}
      {rawText && (
        <div className="text-xs font-mono text-slate-300 whitespace-pre-wrap break-words bg-slate-950/90 p-2.5 rounded-xl border border-slate-800/70 leading-relaxed">
          {rawText}
        </div>
      )}

      {/* Execution Audit Trail Logs Toggle */}
      {trade.logs && trade.logs.length > 0 && onToggleAudit && (
        <div className="pt-0.5">
          <button
            type="button"
            onClick={onToggleAudit}
            className="text-[11px] font-mono text-slate-400 hover:text-emerald-400 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Execution Audit Trail ({trade.logs.length} events)</span>
            <ChevronRight className={`w-3.5 h-3.5 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
          </button>

          {isExpanded && (
            <div className="mt-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-[10px] font-mono space-y-1 max-h-36 overflow-y-auto">
              {trade.logs.map((lg, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <span className="text-slate-500 shrink-0">[{lg.timestamp}]</span>
                  <span className={
                    lg.type === "success"
                      ? "text-emerald-400"
                      : lg.type === "error"
                      ? "text-rose-400"
                      : lg.type === "warn"
                      ? "text-amber-400"
                      : "text-slate-300"
                  }>
                    {lg.message}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
