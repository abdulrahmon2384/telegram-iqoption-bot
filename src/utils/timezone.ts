/**
 * Unified Timezone & Clock Synchronization Utility
 * Ensures trades time, signal parsing, server execution, and dashboard UI
 * always use the exact same timezone without mismatch.
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
 * Normalizes user-specified or signal timezone into a valid IANA timeZone string
 */
export function normalizeTimeZone(tz?: string): string {
  if (!tz || !tz.trim()) return "Africa/Lagos";
  const clean = tz.trim();
  
  if (clean.toUpperCase() === "UTC" || clean.toUpperCase() === "GMT") {
    return "UTC";
  }

  // Handle UTC+X / UTC-X / GMT+X / GMT-X patterns
  const offsetMatch = clean.match(/^(?:UTC|GMT)\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$/i);
  if (offsetMatch) {
    const sign = offsetMatch[1];
    const hours = parseInt(offsetMatch[2], 10);
    // In POSIX Etc/GMT zone naming, sign is inverted (Etc/GMT-3 is UTC+3)
    const invSign = sign === "+" ? "-" : "+";
    return `Etc/GMT${invSign}${hours}`;
  }

  try {
    // Validate with Intl.DateTimeFormat
    new Intl.DateTimeFormat("en-US", { timeZone: clean });
    return clean;
  } catch (e) {
    return "Africa/Lagos";
  }
}

/**
 * Returns detected browser/system timezone
 */
export function getDetectedBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Lagos";
  } catch {
    return "Africa/Lagos";
  }
}

/**
 * Formats an epoch timestamp in the configured project timezone as HH:mm:ss
 */
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

/**
 * Formats an epoch timestamp in the configured project timezone as YYYY-MM-DD
 */
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

/**
 * Returns breakdown of Date parts (year, month, day, hour, minute, second) in the given timezone
 */
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
      month: parseInt(map.month, 10) - 1, // 0-indexed month
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

/**
 * Accurately parses a time string (e.g. "14:30", "11:35 PM", "12:57:00 AM") in the context of the
 * configured project timezone and calculates the exact epoch ms.
 */
export function parseEntryTimeToEpochInTz(
  timeStr: string | undefined,
  baseDateEpochMs: number = Date.now(),
  timeZone: string = "Africa/Lagos",
  signalRawText?: string
): { scheduledEpochMs: number; formattedTimeStr: string; isExplicit: boolean; effectiveTimeZone: string } {
  // Check if signal text contains explicit timezone e.g. "UTC-3", "UTC+3", "GMT", "UTC+1"
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

  // Iterative exact epoch calculation in target timezone
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

  // If parsed time is earlier by more than 12 hours than base, it might be scheduled for next day
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
