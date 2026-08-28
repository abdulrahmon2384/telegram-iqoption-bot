import React, { useState, useMemo } from "react";
import { 
  TrendingUp, TrendingDown, DollarSign, Award, Target, 
  BarChart3, CheckCircle2, XCircle, RefreshCw, Filter, 
  Layers, Zap, Shield, ArrowUpRight, ArrowDownRight,
  PieChart, Activity, Bell, Volume2, VolumeX
} from "lucide-react";
import { TradeRecord } from "../types";

interface TradeStatsDashboardProps {
  trades: TradeRecord[];
  onClearStats?: () => void;
  isNotificationEnabled?: boolean;
  onToggleNotification?: () => void;
  isSoundEnabled?: boolean;
  onToggleSound?: () => void;
}

export const TradeStatsDashboard: React.FC<TradeStatsDashboardProps> = ({
  trades = [],
  onClearStats,
  isNotificationEnabled = false,
  onToggleNotification,
  isSoundEnabled = true,
  onToggleSound,
}) => {
  const [accountFilter, setAccountFilter] = useState<"ALL" | "PRACTICE" | "REAL">("ALL");
  const [timeFilter, setTimeFilter] = useState<"ALL" | "TODAY">("ALL");

  // Filtered list of trades based on active filters
  const filteredTrades = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    return trades.filter((t) => {
      if (accountFilter !== "ALL" && t.accountMode !== accountFilter) return false;
      if (timeFilter === "TODAY") {
        const tradeDate = t.signalDate || (t.createdAt ? new Date(t.createdAt).toISOString().slice(0, 10) : "");
        if (tradeDate && tradeDate !== todayStr) return false;
      }
      return true;
    });
  }, [trades, accountFilter, timeFilter]);

  // Comprehensive statistics calculation
  const stats = useMemo(() => {
    // Only count completed/settled trades for winrate (WIN, LOSS, DRAW)
    const settledTrades = filteredTrades.filter(
      (t) => t.state === "WIN" || t.state === "LOSS" || t.state === "DRAW" || t.outcome === "WIN" || t.outcome === "LOSS" || t.outcome === "DRAW"
    );

    const totalExecuted = settledTrades.length;
    const wins = settledTrades.filter((t) => t.state === "WIN" || t.outcome === "WIN");
    const losses = settledTrades.filter((t) => t.state === "LOSS" || t.outcome === "LOSS");
    const draws = settledTrades.filter((t) => t.state === "DRAW" || t.outcome === "DRAW");

    const winCount = wins.length;
    const lossCount = losses.length;
    const drawCount = draws.length;

    const decisiveTrades = winCount + lossCount;
    const winRate = decisiveTrades > 0 ? (winCount / decisiveTrades) * 100 : 0;

    // Financial Calculation (Profit / Loss)
    let totalProfit = 0;
    let totalLoss = 0;

    wins.forEach((t) => {
      if (t.profit && t.profit > 0) {
        totalProfit += t.profit;
      } else {
        const payout = (t.payoutRate || 87) / 100;
        totalProfit += t.stake * payout;
      }
    });

    losses.forEach((t) => {
      totalLoss += Math.abs(t.stake);
    });

    const netProfit = totalProfit - totalLoss;
    const profitFactor = totalLoss > 0 ? totalProfit / totalLoss : totalProfit > 0 ? 99.9 : 0;

    // Martingale / Management Level Breakdown (Level 1, Level 2, Level 3)
    const levelStats = [1, 2, 3].map((lvl) => {
      const lvlSettled = settledTrades.filter((t) => {
        const tLvl = t.managementLevel ?? 1;
        if (lvl === 1) return tLvl <= 1;
        return tLvl === lvl;
      });
      const lvlWins = lvlSettled.filter((t) => t.state === "WIN" || t.outcome === "WIN").length;
      const lvlLosses = lvlSettled.filter((t) => t.state === "LOSS" || t.outcome === "LOSS").length;
      const lvlDecisive = lvlWins + lvlLosses;
      const lvlWinRate = lvlDecisive > 0 ? (lvlWins / lvlDecisive) * 100 : 0;
      
      let lvlNet = 0;
      lvlSettled.forEach((t) => {
        if (t.state === "WIN" || t.outcome === "WIN") {
          lvlNet += t.profit && t.profit > 0 ? t.profit : t.stake * ((t.payoutRate || 87) / 100);
        } else if (t.state === "LOSS" || t.outcome === "LOSS") {
          lvlNet -= Math.abs(t.stake);
        }
      });

      return {
        level: lvl,
        label: lvl === 1 ? "Level 1 (Signal Entry)" : lvl === 2 ? "Level 2 (Checkpoint 2)" : "Level 3 (Full Close)",
        total: lvlSettled.length,
        wins: lvlWins,
        losses: lvlLosses,
        winRate: lvlWinRate,
        net: lvlNet,
      };
    });

    // Currently Active / Scheduled / Open trades
    const openTrades = filteredTrades.filter(
      (t) => t.state === "OPEN" || t.state === "EXECUTING" || t.state === "WAITING_FOR_ENTRY" || t.state === "PRE_TRADE_CHECK"
    );
    const scheduledTrades = filteredTrades.filter((t) => t.state === "SCHEDULED");

    return {
      totalExecuted,
      winCount,
      lossCount,
      drawCount,
      winRate,
      totalProfit,
      totalLoss,
      netProfit,
      profitFactor,
      levelStats,
      activeCount: openTrades.length,
      scheduledCount: scheduledTrades.length,
    };
  }, [filteredTrades]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xl">
      {/* Header & Global Stats Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-sm">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>Trade Execution Statistics & Performance Ledger</span>
            </h3>
            <p className="text-xs text-slate-400">
              Live automated accounting of all settled VIP trades, wins, losses, winrate & P&L.
            </p>
          </div>
        </div>

        {/* Filters and Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Notification & Sound Toggles */}
          {onToggleNotification && (
            <button
              type="button"
              onClick={onToggleNotification}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                isNotificationEnabled
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
              title="Toggle Browser Exit Push Notifications"
            >
              <Bell className={`w-3.5 h-3.5 ${isNotificationEnabled ? "text-emerald-400" : "text-slate-500"}`} />
              <span>{isNotificationEnabled ? "Alerts: ON" : "Alerts: OFF"}</span>
            </button>
          )}

          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border flex items-center gap-1.5 transition-all cursor-pointer ${
                isSoundEnabled
                  ? "bg-sky-500/20 text-sky-300 border-sky-500/40"
                  : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200"
              }`}
              title="Toggle Audio Win/Loss Chimes"
            >
              {isSoundEnabled ? <Volume2 className="w-3.5 h-3.5 text-sky-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
              <span>{isSoundEnabled ? "Sound: ON" : "Sound: OFF"}</span>
            </button>
          )}

          {/* Account Filter Segment */}
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setAccountFilter("ALL")}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                accountFilter === "ALL" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setAccountFilter("PRACTICE")}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                accountFilter === "PRACTICE" ? "bg-amber-500/25 text-amber-300 font-bold border border-amber-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Demo
            </button>
            <button
              type="button"
              onClick={() => setAccountFilter("REAL")}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                accountFilter === "REAL" ? "bg-emerald-500/25 text-emerald-300 font-bold border border-emerald-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Real
            </button>
          </div>

          {/* Time Filter */}
          <div className="flex items-center gap-0.5 bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs font-mono">
            <button
              type="button"
              onClick={() => setTimeFilter("ALL")}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                timeFilter === "ALL" ? "bg-slate-800 text-white font-bold" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All-Time
            </button>
            <button
              type="button"
              onClick={() => setTimeFilter("TODAY")}
              className={`px-2 py-1 rounded-md transition-colors cursor-pointer ${
                timeFilter === "TODAY" ? "bg-sky-500/25 text-sky-300 font-bold border border-sky-500/30" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-2.5 sm:gap-3.5">
        {/* 1. Total Executed Trades */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Executed Trades</span>
            <Activity className="w-4 h-4 text-slate-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-white">
              {stats.totalExecuted}
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              completed
            </span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-mono text-slate-500 pt-1 border-t border-slate-900">
            <span>{stats.activeCount} currently active</span>
            <span>&bull;</span>
            <span>{stats.scheduledCount} scheduled</span>
          </div>
        </div>

        {/* 2. Win Rate */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Win Rate</span>
            <Award className={`w-4 h-4 ${stats.winRate >= 60 ? "text-emerald-400" : "text-amber-400"}`} />
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${
              stats.winRate >= 70 ? "text-emerald-400" : stats.winRate >= 50 ? "text-amber-400" : "text-slate-300"
            }`}>
              {stats.winRate.toFixed(1)}%
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              accuracy
            </span>
          </div>
          {/* Visual Progress Meter */}
          <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden mt-1">
            <div
              className={`h-full transition-all duration-500 ${
                stats.winRate >= 70 ? "bg-emerald-500" : stats.winRate >= 50 ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{ width: `${Math.min(100, Math.max(0, stats.winRate))}%` }}
            />
          </div>
        </div>

        {/* 3. Wins vs Losses Breakdown */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Wins / Losses</span>
            <div className="flex items-center gap-1 text-[10px]">
              <span className="text-emerald-400 font-bold">W</span>
              <span className="text-slate-600">/</span>
              <span className="text-rose-400 font-bold">L</span>
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400">
              {stats.winCount}
            </span>
            <span className="text-slate-600 font-mono text-xl">/</span>
            <span className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-400">
              {stats.lossCount}
            </span>
            {stats.drawCount > 0 && (
              <span className="text-xs font-mono text-slate-400">
                ({stats.drawCount} Draw)
              </span>
            )}
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-900">
            <span className="text-emerald-400/90 font-semibold">
              +{stats.winCount > 0 ? ((stats.winCount / (stats.totalExecuted || 1)) * 100).toFixed(0) : 0}% Wins
            </span>
            <span className="text-rose-400/90 font-semibold">
              -{stats.lossCount > 0 ? ((stats.lossCount / (stats.totalExecuted || 1)) * 100).toFixed(0) : 0}% Losses
            </span>
          </div>
        </div>

        {/* 4. Net Profit / Loss */}
        <div className="bg-slate-950 border border-slate-800/90 rounded-xl p-3.5 space-y-1.5 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-mono">
            <span className="uppercase tracking-wider">Net P&L ($)</span>
            <DollarSign className={`w-4 h-4 ${stats.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"}`} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-2xl sm:text-3xl font-extrabold font-mono ${
              stats.netProfit >= 0 ? "text-emerald-400" : "text-rose-400"
            }`}>
              {stats.netProfit >= 0 ? `+$${stats.netProfit.toFixed(2)}` : `-$${Math.abs(stats.netProfit).toFixed(2)}`}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-900">
            <span className="text-emerald-400/90">
              Gain: +${stats.totalProfit.toFixed(2)}
            </span>
            <span className="text-rose-400/90">
              Loss: -${stats.totalLoss.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Martingale Management Progression Breakdown Table */}
      <div className="bg-slate-950/80 border border-slate-800/80 rounded-xl p-3.5 space-y-2.5">
        <div className="flex items-center justify-between text-xs font-mono text-slate-300">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-200">
            <Layers className="w-3.5 h-3.5 text-sky-400" />
            <span>Management Level Win Rate Breakdown (Rule 4 & 5)</span>
          </div>
          <span className="text-[11px] text-slate-500">
            Level 0 → Level 1 → Level 2 → Level 3
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs font-mono">
          {stats.levelStats.map((lvl) => (
            <div
              key={lvl.level}
              className="bg-slate-900/90 border border-slate-800/90 rounded-xl p-2.5 space-y-1.5 shadow-sm"
            >
              <div className="flex items-center justify-between">
                <span className="font-bold text-white flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    lvl.level === 0 ? "bg-emerald-400" : lvl.level === 1 ? "bg-sky-400" : lvl.level === 2 ? "bg-amber-400" : "bg-purple-400"
                  }`} />
                  <span>{lvl.label}</span>
                </span>
                <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                  {lvl.total} trade{lvl.total === 1 ? "" : "s"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5">
                  <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    {lvl.wins}W
                  </span>
                  <span className="text-rose-400 font-semibold flex items-center gap-0.5">
                    <XCircle className="w-3 h-3 text-rose-400" />
                    {lvl.losses}L
                  </span>
                </div>
                <span className={`font-bold ${
                  lvl.winRate >= 70 ? "text-emerald-400" : lvl.winRate >= 50 ? "text-amber-400" : lvl.total === 0 ? "text-slate-500" : "text-rose-400"
                }`}>
                  {lvl.total > 0 ? `${lvl.winRate.toFixed(1)}%` : "0.0%"}
                </span>
              </div>

              <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/80 pt-1">
                <span>Net:</span>
                <span className={`font-bold ${lvl.net >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {lvl.net >= 0 ? `+$${lvl.net.toFixed(2)}` : `-$${Math.abs(lvl.net).toFixed(2)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
