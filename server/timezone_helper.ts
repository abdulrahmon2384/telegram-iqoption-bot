/**
 * Server-side Unified Timezone & Clock Synchronization Utility
 */

export interface TimeZoneOption {
  value: string;
  label: string;
  region: string;
  offset: string;
}

export const POPULAR_TIMEZONES: TimeZoneOption[] = [
  { value: "Africa/Lagos", label: "Lagos / West Africa (WAT)", region: "Africa", offset: "UTC+1" },
  { value: "Africa/Johannesburg", label: "Johannesburg / South Africa (SAST)", region: "Africa", offset: "UTC+2" },
  { value: "Africa/Cairo", label: "Cairo / Egypt (EEST)", region: "Africa", offset: "UTC+3" },
  { value: "Europe/London", label: "London / Dublin (GMT/BST)", region: "Europe", offset: "UTC+0/+1" },
  { value: "Europe/Berlin", label: "Frankfurt / Berlin / Paris (CET)", region: "Europe", offset: "UTC+1/+2" },
  { value: "Europe/Athens", label: "Athens / Helsinki / Kyiv (EET)", region: "Europe", offset: "UTC+2/+3" },
  { value: "Europe/Moscow", label: "Moscow / Istanbul (MSK/TRT)", region: "Europe", offset: "UTC+3" },
  { value: "America/Sao_Paulo", label: "São Paulo / Brazil (BRT)", region: "Americas", offset: "UTC-3" },
  { value: "America/Buenos_Aires", label: "Buenos Aires / Argentina (ART)", region: "Americas", offset: "UTC-3" },
  { value: "America/New_York", label: "New York / Eastern (EST/EDT)", region: "Americas", offset: "UTC-5/-4" },
  { value: "America/Chicago", label: "Chicago / Central (CST/CDT)", region: "Americas", offset: "UTC-6/-5" },
  { value: "America/Denver", label: "Denver / Mountain (MST/MDT)", region: "Americas", offset: "UTC-7/-6" },
  { value: "America/Los_Angeles", label: "Los Angeles / Pacific (PST/PDT)", region: "Americas", offset: "UTC-8/-7" },
  { value: "America/Bogota", label: "Bogota / Colombia / Lima (COT)", region: "Americas", offset: "UTC-5" },
  { value: "America/Mexico_City", label: "Mexico City (CST)", region: "Americas", offset: "UTC-6" },
  { value: "Asia/Dubai", label: "Dubai / UAE / Gulf (GST)", region: "Asia / Middle East", offset: "UTC+4" },
  { value: "Asia/Kolkata", label: "India / Mumbai / Delhi (IST)", region: "Asia / Middle East", offset: "UTC+5:30" },
  { value: "Asia/Dhaka", label: "Dhaka / Bangladesh (BST)", region: "Asia / Middle East", offset: "UTC+6" },
  { value: "Asia/Bangkok", label: "Bangkok / Jakarta / Vietnam (ICT)", region: "Asia", offset: "UTC+7" },
  { value: "Asia/Singapore", label: "Singapore / Malaysia (SGT)", region: "Asia", offset: "UTC+8" },
  { value: "Asia/Hong_Kong", label: "Hong Kong / Beijing (HKT)", region: "Asia", offset: "UTC+8" },
  { value: "Asia/Tokyo", label: "Tokyo / Seoul (JST/KST)", region: "Asia", offset: "UTC+9" },
  { value: "Australia/Sydney", label: "Sydney / Melbourne (AEST)", region: "Oceania", offset: "UTC+10/+11" },
  { value: "UTC", label: "UTC / GMT (Coordinated Universal Time)", region: "Universal", offset: "UTC+0" },
  { value: "Etc/GMT-1", label: "UTC+1 (Fixed Offset)", region: "Offset", offset: "UTC+1" },
  { value: "Etc/GMT-2", label: "UTC+2 (Fixed Offset)", region: "Offset", offset: "UTC+2" },
  { value: "Etc/GMT-3", label: "UTC+3 (Fixed Offset)", region: "Offset", offset: "UTC+3" },
  { value: "Etc/GMT-4", label: "UTC+4 (Fixed Offset)", region: "Offset", offset: "UTC+4" },
  { value: "Etc/GMT+1", label: "UTC-1 (Fixed Offset)", region: "Offset", offset: "UTC-1" },
  { value: "Etc/GMT+2", label: "UTC-2 (Fixed Offset)", region: "Offset", offset: "UTC-2" },
  { value: "Etc/GMT+3", label: "UTC-3 (Fixed Offset)", region: "Offset", offset: "UTC-3" },
  { value: "Etc/GMT+4", label: "UTC-4 (Fixed Offset)", region: "Offset", offset: "UTC-4" },
  { value: "Etc/GMT+5", label: "UTC-5 (Fixed Offset)", region: "Offset", offset: "UTC-5" },
];

/**
 * Supported standard IQ Option turbo/binary expiry durations in minutes
 */
export const VALID_IQ_TIMEFRAMES = [1, 2, 3, 4, 5, 15, 30, 60];

/**
 * Converts 12-hour or 24-hour time string (e.g. "4:24 PM", "16:24", "04:30") to minutes from midnight
 */
export function parseTimeToMinutesOfDay(timeStr?: string): number | null {
  if (!timeStr || typeof timeStr !== "string") return null;
  const clean = timeStr.trim();

  // 12-hour format with AM/PM e.g. "4:24 PM", "04:30 AM"
  const match12 = clean.match(/^([0-1]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = parseInt(match12[2], 10);
    const meridian = match12[4].toUpperCase();
    if (meridian === "PM" && h < 12) h += 12;
    if (meridian === "AM" && h === 12) h = 0;
    return h * 60 + m;
  }

  // 24-hour format e.g. "16:24", "04:30"
  const match24 = clean.match(/^([0-2]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?$/);
  if (match24) {
    const h = parseInt(match24[1], 10);
    const m = parseInt(match24[2], 10);
    return h * 60 + m;
  }

  // Fallback extraction
  const numMatch = clean.match(/([0-2]?[0-9]):([0-5][0-9])/);
  if (numMatch) {
    let h = parseInt(numMatch[1], 10);
    const m = parseInt(numMatch[2], 10);
    if (/PM/i.test(clean) && h < 12) h += 12;
    if (/AM/i.test(clean) && h === 12) h = 0;
    return h * 60 + m;
  }

  return null;
}

/**
 * Calculates difference in minutes between Entry time and Level 3 time
 */
export function calculateMinutesDiff(entryTimeStr: string, targetTimeStr: string): number | null {
  const entryMins = parseTimeToMinutesOfDay(entryTimeStr);
  const targetMins = parseTimeToMinutesOfDay(targetTimeStr);
  if (entryMins === null || targetMins === null) return null;

  let diff = targetMins - entryMins;
  // Handle crossing midnight (e.g. 23:55 to 00:01)
  if (diff < 0) {
    diff += 1440;
  }
  return diff;
}

/**
 * Maps any calculated duration to the nearest valid IQ Option timeframe (1, 2, 3, 4, 5, 15, 30, 60 min)
 * e.g. 6 minutes falls back to 5 minutes (M5)
 */
export function getNearestValidIQTimeframe(calculatedMinutes: number): { durationMinutes: number; timeframe: string } {
  const mins = Math.max(1, Math.round(calculatedMinutes));
  if (VALID_IQ_TIMEFRAMES.includes(mins)) {
    return {
      durationMinutes: mins,
      timeframe: mins === 60 ? "H1" : `M${mins}`,
    };
  }

  // Find the closest valid IQ Option timeframe
  let closest = VALID_IQ_TIMEFRAMES[0];
  let minDiff = Math.abs(mins - closest);
  for (const tf of VALID_IQ_TIMEFRAMES) {
    const diff = Math.abs(mins - tf);
    if (diff < minDiff) {
      minDiff = diff;
      closest = tf;
    }
  }

  return {
    durationMinutes: closest,
    timeframe: closest === 60 ? "H1" : `M${closest}`,
  };
}

/**
 * Calculates the exact single trade timer target (Level 3 time minus Entry time),
 * with automatic fallback to the nearest valid IQ Option timeframe (e.g. 6m -> 5m).
 */
export function calculateLevel3TargetTimer(
  rawClean: string,
  entryTimeStr?: string,
  baseTimerMins: number = 5
): {
  durationMinutes: number;
  timeframe: string;
  calculatedMinutes: number;
  level3TimeStr?: string;
  method: string;
} {
  // 1. Check explicit Level 3 / Gale 3 / MG 3 line e.g. "Level 3 → 4:30 PM", "L3: 16:30", "Gale 3 - 4:30"
  const l3Match = rawClean.match(/(?:Level\s*3|L3|Gale\s*3|G3|MG\s*3|Martingale\s*3)\s*(?:[→\-:>–—]|\bto\b|@)?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  
  if (l3Match && entryTimeStr) {
    const level3Time = l3Match[1].trim();
    const diff = calculateMinutesDiff(entryTimeStr, level3Time);
    if (diff !== null && diff > 0) {
      const nearest = getNearestValidIQTimeframe(diff);
      return {
        durationMinutes: nearest.durationMinutes,
        timeframe: nearest.timeframe,
        calculatedMinutes: diff,
        level3TimeStr: level3Time,
        method: `Level 3 Target (${level3Time} - ${entryTimeStr} = ${diff}m -> Valid IQ: ${nearest.durationMinutes}m / ${nearest.timeframe})`,
      };
    }
  }

  // 2. Check Level 2 and Level 1 if Level 3 not found
  const l1Match = rawClean.match(/(?:Level\s*1|L1|Gale\s*1|G1|MG\s*1|Martingale\s*1)\s*(?:[→\-:>–—]|\bto\b|@)?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (l1Match && entryTimeStr) {
    const l1Time = l1Match[1].trim();
    const stepDiff = calculateMinutesDiff(entryTimeStr, l1Time);
    if (stepDiff !== null && stepDiff > 0) {
      const projectedL3Diff = stepDiff * 3; // 3 steps to Level 3
      const nearest = getNearestValidIQTimeframe(projectedL3Diff);
      return {
        durationMinutes: nearest.durationMinutes,
        timeframe: nearest.timeframe,
        calculatedMinutes: projectedL3Diff,
        method: `Projected Level 3 (Step: ${stepDiff}m x 3 = ${projectedL3Diff}m -> Valid IQ: ${nearest.durationMinutes}m / ${nearest.timeframe})`,
      };
    }
  }

  // 3. Fallback using base timer: 3 steps of timer duration
  if (baseTimerMins > 0) {
    const projectedMins = baseTimerMins * 3;
    const nearest = getNearestValidIQTimeframe(projectedMins);
    return {
      durationMinutes: nearest.durationMinutes,
      timeframe: nearest.timeframe,
      calculatedMinutes: projectedMins,
      method: `Base Timer 3-Step Target (${baseTimerMins}m x 3 = ${projectedMins}m -> Valid IQ: ${nearest.durationMinutes}m / ${nearest.timeframe})`,
    };
  }

  // Default fallback 5 minutes
  const nearest = getNearestValidIQTimeframe(5);
  return {
    durationMinutes: nearest.durationMinutes,
    timeframe: nearest.timeframe,
    calculatedMinutes: 5,
    method: `Default Valid IQ: 5m / M5`,
  };
}

export interface SignalLevelCheckpoints {
  entryTime?: string;
  level1Time?: string;
  level2Time?: string;
  level3Time?: string;
  level1DiffMinutes?: number;
  level2DiffMinutes?: number;
  level3DiffMinutes?: number;
  stepMinutes?: number;
  detectionMethod?: string;
}

/**
 * Adds minutes to a 12-hour or 24-hour time string and returns formatted time string
 * e.g. ("4:24 PM", 2) => "4:26 PM", ("16:24", 5) => "16:29"
 */
export function addMinutesToTimeString(timeStr: string, minutesToAdd: number): string {
  if (!timeStr || !timeStr.trim()) return "";
  const match = timeStr.trim().match(/^([0-2]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?(?:\s*(AM|PM|am|pm))?$/i);
  if (!match) return timeStr;

  let hour = parseInt(match[1], 10);
  let min = parseInt(match[2], 10);
  const is12Hour = Boolean(match[4]);
  const ampm = match[4] ? match[4].toUpperCase() : null;

  if (is12Hour) {
    if (ampm === "PM" && hour < 12) hour += 12;
    if (ampm === "AM" && hour === 12) hour = 0;
  }

  let totalMins = (hour * 60 + min + minutesToAdd) % 1440;
  if (totalMins < 0) totalMins += 1440;

  let newHour = Math.floor(totalMins / 60);
  let newMin = totalMins % 60;

  if (is12Hour) {
    const newAmpm = newHour >= 12 ? "PM" : "AM";
    let h12 = newHour % 12;
    if (h12 === 0) h12 = 12;
    return `${h12}:${String(newMin).padStart(2, "0")} ${newAmpm}`;
  } else {
    return `${String(newHour).padStart(2, "0")}:${String(newMin).padStart(2, "0")}`;
  }
}

/**
 * Extracts Level 1, Level 2, and Level 3 checkpoint times from signal text
 * With multi-format regex matching and automatic intelligent step extrapolation
 */
export function extractSignalLevelCheckpoints(
  rawClean: string,
  entryTimeStr?: string,
  baseTimerMins: number = 2
): SignalLevelCheckpoints {
  const result: SignalLevelCheckpoints = {
    entryTime: entryTimeStr,
  };

  // 1. Explicit Level 1 match
  const l1Match = rawClean.match(/(?:Level\s*1|L1|Gale\s*1|G1|MG\s*1|MG1|1st\s*Gale|1[°º]\s*Gale|Primeiro\s*Gale|Step\s*1)\s*(?:[→\-:>–—=]|\bto\b|@)?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (l1Match) {
    result.level1Time = l1Match[1].trim();
  }

  // 2. Explicit Level 2 match
  const l2Match = rawClean.match(/(?:Level\s*2|L2|Gale\s*2|G2|MG\s*2|MG2|2nd\s*Gale|2[°º]\s*Gale|Segundo\s*Gale|Step\s*2)\s*(?:[→\-:>–—=]|\bto\b|@)?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (l2Match) {
    result.level2Time = l2Match[1].trim();
  }

  // 3. Explicit Level 3 match
  const l3Match = rawClean.match(/(?:Level\s*3|L3|Gale\s*3|G3|MG\s*3|MG3|3rd\s*Gale|3[°º]\s*Gale|Terceiro\s*Gale|Step\s*3)\s*(?:[→\-:>–—=]|\bto\b|@)?\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (l3Match) {
    result.level3Time = l3Match[1].trim();
  }

  if (entryTimeStr) {
    let step = baseTimerMins > 0 ? baseTimerMins : 2;

    // Calculate diffs if explicitly present
    if (result.level1Time) {
      const d1 = calculateMinutesDiff(entryTimeStr, result.level1Time);
      if (d1 !== null && d1 > 0) {
        result.level1DiffMinutes = d1;
        step = d1; // deduce step from L1
      }
    }

    if (result.level2Time) {
      const d2 = calculateMinutesDiff(entryTimeStr, result.level2Time);
      if (d2 !== null && d2 > 0) {
        result.level2DiffMinutes = d2;
        if (!result.level1DiffMinutes) step = Math.max(1, Math.round(d2 / 2));
      }
    }

    if (result.level3Time) {
      const d3 = calculateMinutesDiff(entryTimeStr, result.level3Time);
      if (d3 !== null && d3 > 0) {
        result.level3DiffMinutes = d3;
        if (!result.level1DiffMinutes && !result.level2DiffMinutes) {
          step = Math.max(1, Math.round(d3 / 3));
        }
      }
    }

    result.stepMinutes = step;

    // Fill in missing level 1 if needed
    if (!result.level1DiffMinutes) {
      result.level1DiffMinutes = step;
      if (!result.level1Time) {
        result.level1Time = addMinutesToTimeString(entryTimeStr, step);
      }
    }

    // Fill in missing level 2 if needed
    if (!result.level2DiffMinutes) {
      result.level2DiffMinutes = step * 2;
      if (!result.level2Time) {
        result.level2Time = addMinutesToTimeString(entryTimeStr, step * 2);
      }
    }

    // Fill in missing level 3 if needed
    if (!result.level3DiffMinutes) {
      result.level3DiffMinutes = step * 3;
      if (!result.level3Time) {
        result.level3Time = addMinutesToTimeString(entryTimeStr, step * 3);
      }
    }

    result.detectionMethod = `Checkpoints: L1 (+${result.level1DiffMinutes}m @ ${result.level1Time}) -> L2 (+${result.level2DiffMinutes}m @ ${result.level2Time}) -> Expiry (+${result.level3DiffMinutes}m @ ${result.level3Time})`;
  }

  return result;
}

export function normalizeTimeZone(tz?: string): string {
  if (!tz || !tz.trim()) return "Africa/Lagos";
  const clean = tz.trim();
  
  if (clean.toUpperCase() === "UTC" || clean.toUpperCase() === "GMT") {
    return "UTC";
  }

  const offsetMatch = clean.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    const invSign = sign === "+" ? "-" : "+";
    return `Etc/GMT${invSign}${hours}`;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: clean });
    return clean;
  } catch (e) {
    return "Africa/Lagos";
  }
}

export function formatTimeInTz(
  epochMs: number | Date = Date.now(),
  timeZone: string = "Africa/Lagos",
  options?: { withSeconds?: boolean; hour12?: boolean }
): string {
  const normalizedTz = normalizeTimeZone(timeZone);
  const date = typeof epochMs === "number" ? new Date(epochMs) : epochMs;
  
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTz,
      hour: "2-digit",
      minute: "2-digit",
      second: options?.withSeconds !== false ? "2-digit" : undefined,
      hour12: options?.hour12 ?? false,
      hourCycle: "h23",
    }).format(date);
  } catch {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  }
}

export function formatDateInTz(
  epochMs: number | Date = Date.now(),
  timeZone: string = "Africa/Lagos"
): string {
  const normalizedTz = normalizeTimeZone(timeZone);
  const date = typeof epochMs === "number" ? new Date(epochMs) : epochMs;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;
    return `${map.year}-${map.month}-${map.day}`;
  } catch {
    return date.toISOString().split("T")[0];
  }
}

export function getPartsInTz(
  epochMs: number | Date = Date.now(),
  timeZone: string = "Africa/Lagos"
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const normalizedTz = normalizeTimeZone(timeZone);
  const date = typeof epochMs === "number" ? new Date(epochMs) : epochMs;

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizedTz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    }).formatToParts(date);

    const map: Record<string, string> = {};
    for (const p of parts) map[p.type] = p.value;

    const rawHour = parseInt(map.hour, 10);
    const hour = rawHour === 24 ? 0 : rawHour;

    return {
      year: parseInt(map.year, 10),
      month: parseInt(map.month, 10) - 1,
      day: parseInt(map.day, 10),
      hour,
      minute: parseInt(map.minute, 10),
      second: parseInt(map.second, 10),
    };
  } catch {
    const utcOffsetMs = normalizedTz === "Africa/Lagos" || normalizedTz === "Etc/GMT-1" ? 3600000 : 0;
    const adjDate = new Date(date.getTime() + utcOffsetMs);
    return {
      year: adjDate.getUTCFullYear(),
      month: adjDate.getUTCMonth(),
      day: adjDate.getUTCDate(),
      hour: adjDate.getUTCHours(),
      minute: adjDate.getUTCMinutes(),
      second: adjDate.getUTCSeconds(),
    };
  }
}

export function parseEntryTimeToEpochInTz(
  timeStr: string | undefined,
  baseDateEpochMs: number = Date.now(),
  timeZone: string = "Africa/Lagos",
  signalRawText?: string
): { scheduledEpochMs: number; formattedTimeStr: string; isExplicit: boolean; effectiveTimeZone: string } {
  let effectiveTz = timeZone || "Africa/Lagos";
  if (signalRawText) {
    const explicitTzMatch = signalRawText.match(/\b(UTC\s*[+-]\s*\d{1,2}|GMT\s*[+-]\s*\d{1,2}|UTC|GMT)\b/i);
    if (explicitTzMatch) {
      effectiveTz = explicitTzMatch[1];
    }
  }

  const normalizedTz = normalizeTimeZone(effectiveTz);
  const baseParts = getPartsInTz(baseDateEpochMs, normalizedTz);

  if (
    !timeStr ||
    !timeStr.trim() ||
    /^(?:NOW|AGORA|IMMEDIATE|IMEDIATO|CURRENT)$/i.test(timeStr.trim())
  ) {
    const formatted = formatTimeInTz(baseDateEpochMs, normalizedTz);
    return {
      scheduledEpochMs: baseDateEpochMs,
      formattedTimeStr: formatted,
      isExplicit: false,
      effectiveTimeZone: normalizedTz,
    };
  }

  const clean = timeStr.trim();
  let hours = 0;
  let minutes = 0;
  let seconds = 0;

  const match12 = clean.match(/^([0-1]?[0-9]):([0-5][0-9])(?::([0-5][0-9]))?\s*(AM|PM)$/i);
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
    const numbersMatch = clean.match(/([0-2]?[0-9]):([0-5][0-9])/);
    if (numbersMatch) {
      hours = parseInt(numbersMatch[1], 10);
      minutes = parseInt(numbersMatch[2], 10);
      if (/PM/i.test(clean) && hours < 12) hours += 12;
      if (/AM/i.test(clean) && hours === 12) hours = 0;
    }
  }

  let guessEpoch = Date.UTC(baseParts.year, baseParts.month, baseParts.day, hours, minutes, seconds);

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: normalizedTz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    hourCycle: "h23",
  });

  for (let iter = 0; iter < 4; iter++) {
    const curParts = formatter.formatToParts(new Date(guessEpoch));
    const curMap: Record<string, string> = {};
    for (const p of curParts) curMap[p.type] = p.value;

    const rawH = parseInt(curMap.hour, 10);
    const curH = rawH === 24 ? 0 : rawH;
    const curM = parseInt(curMap.minute, 10);
    const curS = parseInt(curMap.second, 10);
    const curD = parseInt(curMap.day, 10);

    const diffSec = ((curD - baseParts.day) * 86400) + ((curH - hours) * 3600) + ((curM - minutes) * 60) + (curS - seconds);
    guessEpoch -= diffSec * 1000;
    if (diffSec === 0) break;
  }

  let scheduledEpochMs = guessEpoch;

  if (scheduledEpochMs < baseDateEpochMs - 12 * 3600 * 1000) {
    scheduledEpochMs += 24 * 3600 * 1000;
  }

  const formattedTimeStr = formatTimeInTz(scheduledEpochMs, normalizedTz);

  return {
    scheduledEpochMs,
    formattedTimeStr,
    isExplicit: true,
    effectiveTimeZone: normalizedTz,
  };
}

/**
 * Gets a clean human-readable label for a timezone
 */
export function getTimeZoneLabel(tz: string): string {
  const match = POPULAR_TIMEZONES.find((p) => p.value === tz);
  if (match) return match.label;
  return tz;
}

/**
 * Returns short abbreviation code for a timezone (e.g. WAT, GMT, EST, UTC)
 */
export function getTzAbbreviation(tz: string): string {
  if (!tz) return "WAT";
  if (tz === "Africa/Lagos") return "WAT";
  if (tz === "Africa/Johannesburg") return "SAST";
  if (tz === "Africa/Cairo") return "EEST";
  if (tz === "Europe/London") return "GMT";
  if (tz === "America/Sao_Paulo") return "BRT";
  if (tz === "America/New_York") return "EST";
  if (tz === "UTC") return "UTC";

  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: normalizeTimeZone(tz),
      timeZoneName: "short",
    }).formatToParts(new Date());
    const tzPart = parts.find((p) => p.type === "timeZoneName");
    return tzPart ? tzPart.value : "WAT";
  } catch {
    return "WAT";
  }
}

/**
 * Returns formatted offset string (e.g. UTC+1)
 */
export function getTzUtcOffset(tz: string): string {
  const match = POPULAR_TIMEZONES.find((p) => p.value === tz);
  if (match) return match.offset;
  return "UTC+1";
}

let currentActiveTimezone = "Africa/Lagos";

export function setActiveTimezone(tz: string) {
  currentActiveTimezone = normalizeTimeZone(tz);
  console.log(`[Timezone] Server unified active timezone updated to: ${currentActiveTimezone} (${getTzAbbreviation(currentActiveTimezone)})`);
}

export function getActiveTimezone(): string {
  return currentActiveTimezone || "Africa/Lagos";
}


