import React, { useState } from "react";
import { Clock, Play, X, Shield, RefreshCw, Sparkles, CheckCircle2, Zap, AlertCircle, Globe } from "lucide-react";
import { formatTimeInTz } from "../utils/timezone";

interface AutoTradeTimerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: (durationHours: number, label: string) => void;
  monitoredChannelCount: number;
  isTelegramConnected: boolean;
  isIQConnected: boolean;
  timeZone?: string;
}

export const AutoTradeTimerModal: React.FC<AutoTradeTimerModalProps> = ({
  isOpen,
  onClose,
  onStart,
  monitoredChannelCount,
  isTelegramConnected,
  isIQConnected,
  timeZone = "Africa/Lagos",
}) => {
  const [selectedPreset, setSelectedPreset] = useState<number | "custom">(1);
  const [customHours, setCustomHours] = useState<number>(4);
  const [customMinutes, setCustomMinutes] = useState<number>(0);

  if (!isOpen) return null;

  const getEffectiveHours = (): number => {
    if (selectedPreset === "custom") {
      return customHours + customMinutes / 60;
    }
    return selectedPreset;
  };

  const effectiveHours = getEffectiveHours();
  const calculatedEndTime = new Date(Date.now() + effectiveHours * 3600 * 1000);

  const formatEndTime = (date: Date) => {
    return formatTimeInTz(date.getTime(), timeZone);
  };

  const getPresetLabel = (): string => {
    if (selectedPreset === 1) return "1 Hour (1h)";
    if (selectedPreset === 2) return "2 Hours (2h)";
    if (selectedPreset === 3) return "3 Hours (3h)";
    if (customMinutes > 0) return `${customHours}h ${customMinutes}m`;
    return `${customHours} Hours`;
  };

  const handleStartSession = () => {
    if (effectiveHours <= 0) return;
    onStart(effectiveHours, getPresetLabel());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-4 sm:p-6 shadow-2xl shadow-slate-950 text-slate-100 max-h-[92vh] flex flex-col overflow-hidden">
        {/* Decorative Top Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-sky-500 to-indigo-500" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3.5 sm:mb-4 shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">
                Set Auto-Trade Session Duration
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Choose listening duration for continuous VIP signal monitoring.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto space-y-3.5 sm:space-y-4 pr-1">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Select Preset Duration:
            </label>
            <div className="grid grid-cols-4 gap-1.5 sm:gap-2">
              {[
                { value: 1, label: "1h", subtitle: "Standard" },
                { value: 2, label: "2h", subtitle: "Extended" },
                { value: 3, label: "3h", subtitle: "Long" },
                { value: "custom", label: "Custom", subtitle: "Flexible" },
              ].map((item) => {
                const isSelected = selectedPreset === item.value;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setSelectedPreset(item.value as any)}
                    className={`flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border transition-all text-center ${
                      isSelected
                        ? "bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-md shadow-emerald-950/40 ring-1 ring-emerald-500/50"
                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <span className="text-sm sm:text-base font-bold font-mono">{item.label}</span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400">{item.subtitle}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Duration Inputs (Only if 'custom' is selected) */}
          {selectedPreset === "custom" && (
            <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-2xl space-y-2.5 animate-fade-in">
              <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
                <span>Custom Duration Setting:</span>
                <span className="font-mono text-emerald-400">
                  {customHours}h {customMinutes}m ({((customHours * 60 + customMinutes) / 60).toFixed(1)} hrs)
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Hours (0 - 48)</label>
                  <input
                    type="number"
                    min={0}
                    max={48}
                    value={customHours}
                    onChange={(e) => setCustomHours(Math.max(0, parseInt(e.target.value) || 0))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 block mb-1">Minutes (0 - 59)</label>
                  <input
                    type="number"
                    min={0}
                    max={59}
                    step={5}
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(Math.max(0, Math.min(59, parseInt(e.target.value) || 0)))}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs sm:text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Quick custom shortcuts */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[10px] text-slate-500">Quick Picks:</span>
                {[
                  { h: 0, m: 30, label: "30m" },
                  { h: 4, m: 0, label: "4h" },
                  { h: 6, m: 0, label: "6h" },
                  { h: 8, m: 0, label: "8h" },
                  { h: 12, m: 0, label: "12h" },
                  { h: 24, m: 0, label: "24h" },
                ].map((pick) => (
                  <button
                    key={pick.label}
                    type="button"
                    onClick={() => {
                      setCustomHours(pick.h);
                      setCustomMinutes(pick.m);
                    }}
                    className="px-2 py-0.5 text-[10px] font-mono bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 rounded-lg transition-colors"
                  >
                    {pick.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Session Overview & Resilience Guarantee */}
          <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-2xl space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                Session Run Time:
              </span>
              <span className="font-bold text-white font-mono">{getPresetLabel()}</span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Target End Time:
              </span>
              <span className="font-bold text-emerald-400 font-mono flex items-center gap-1.5">
                <span>{formatEndTime(calculatedEndTime)}</span>
                <span className="text-[10px] text-sky-400 bg-sky-950/80 px-1.5 py-0.5 rounded border border-sky-800/60 font-sans font-normal">
                  {timeZone.includes("Lagos") ? "WAT (Lagos)" : timeZone}
                </span>
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-sky-400" />
                Monitored Channels:
              </span>
              <span className="font-bold text-sky-300 font-mono">
                {monitoredChannelCount} Channel{monitoredChannelCount === 1 ? "" : "s"}
              </span>
            </div>

            <div className="pt-2 border-t border-slate-800/60 flex items-start gap-2 text-[10px] sm:text-[11px] text-slate-400 leading-relaxed">
              <RefreshCw className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                <strong className="text-slate-200">Resilient Awake Mode:</strong> The bot maintains active background listeners. In case of network interruption or server restart, state is retrieved from persistent storage and the session auto-resumes seamlessly.
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-4 pt-3 border-t border-slate-800/80 flex flex-col-reverse sm:flex-row items-stretch sm:items-center sm:justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors text-center"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleStartSession}
            disabled={effectiveHours <= 0}
            className="min-h-[42px] flex items-center justify-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-emerald-950/40 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start {getPresetLabel()} Session</span>
          </button>
        </div>
      </div>
    </div>
  );
};
