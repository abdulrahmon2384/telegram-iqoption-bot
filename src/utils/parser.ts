import { ParsedSignal, Timeframe, MartingaleLevelInfo } from "../types";
import { formatTimeInTz } from "./timezone";

export interface SignalKeywordMatch {
  keyword: string;
  found: boolean;
}

export const SIGNAL_KEYWORDS = [
  "Trade:",
  "Timer:",
  "Expiry:",
  "Entry:",
  "Entry Time:",
  "Direction:",
  "Martingale Levels:",
  "CALL / BUY",
  "SELL / PUT",
];

// Helper to strip markdown and telegram HTML formatting
export function cleanRawTelegramText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<[^>]*>/g, " ") // Remove HTML tags like <b>, <code>
    .replace(/[*_`~#]/g, " ") // Remove Markdown markers
    .replace(/\s+/g, " ") // Normalize multiple spaces
    .trim();
}

export function detectSignalKeywords(text: string): string[] {
  if (!text) return [];
  const matches: string[] = [];

  const keywordsToCheck = [
    { label: "Trade:", pattern: /\b(?:trade|par|asset|pair|ativo|currency|moeda|symbol)\s*[:=-]/i },
    { label: "Timer / Expiry:", pattern: /\b(?:timer|expiry|expiration|timeframe|tf|exp|expiração|tempo|duracao)\s*[:=-]/i },
    { label: "Entry Time:", pattern: /\b(?:entry|entry\s*time|time|hora|horário|horario|start|at)\s*[:=-]/i },
    { label: "Direction:", pattern: /\b(?:direction|dir|action|direção|direcao|order|side|tipo)\s*[:=-]/i },
    { label: "Martingale:", pattern: /\b(?:martingale|gale|mg|levels?)\b/i },
    { label: "BUY / CALL 🟩", pattern: /\b(buy|call|compra|alta|sube|arriba|verde|🟩|🟢|🔼|⬆️)\b/i },
    { label: "SELL / PUT 🟥", pattern: /\b(sell|put|venda|baixa|baja|abajo|rojo|🟥|🔴|🔽|⬇️)\b/i },
  ];

  for (const item of keywordsToCheck) {
    if (item.pattern.test(text)) {
      matches.push(item.label);
    }
  }

  return matches;
}

export function parseSignalClient(text: string, timezone: string = "Africa/Lagos"): ParsedSignal | null {
  if (!text || typeof text !== "string" || !text.trim()) {
    return null;
  }

  const rawClean = text.trim();
  const normalizedText = cleanRawTelegramText(text);
  const upper = normalizedText.toUpperCase();
  const notes: string[] = [];
  const matchedKeywords = detectSignalKeywords(rawClean);

  const isOTC = upper.includes("(OTC)") || upper.includes("-OTC") || upper.includes("_OTC") || /\bOTC\b/.test(upper);

  // 1. DETECT ASSET / CURRENCY PAIR
  let asset = "";

  // 1A. Check structured line e.g. "Trade: EUR/USD (OTC)", "Par: GBPUSD", "Asset: AUD/CAD"
  const tradeLineMatch = rawClean.match(/(?:Trade|Par|Asset|Pair|Ativo|Currency|Moeda|Symbol)\s*[:=-]\s*([^\n\r,;]+)/i);
  if (tradeLineMatch) {
    const rawTradeLine = tradeLineMatch[1].toUpperCase();
    const pairInLine = rawTradeLine.match(/([A-Z]{3})[\/_ -]?([A-Z]{3})/);
    if (pairInLine) {
      asset = `${pairInLine[1]}${pairInLine[2]}${isOTC ? "-OTC" : ""}`;
      notes.push(`Asset Identified from Header: ${asset}`);
    } else {
      const cryptoMatch = rawTradeLine.match(/\b(BTC|ETH|LTC|XRP|SOL|DOGE|XAU|GOLD)[\/_ -]?(USD|USDT)?\b/);
      if (cryptoMatch) {
        asset = `${cryptoMatch[1]}${cryptoMatch[2] || "USD"}${isOTC ? "-OTC" : ""}`;
        notes.push(`Crypto/Commodity Asset: ${asset}`);
      }
    }
  }

  // 1B. Fallback: Search anywhere in the message for currency pairs or crypto
  if (!asset) {
    const pairMatch = upper.match(/\b([A-Z]{3})[\/_ -]?([A-Z]{3})(?:[-_ ]?OTC)?\b/);
    if (pairMatch) {
      // Validate common currency letters
      const c1 = pairMatch[1];
      const c2 = pairMatch[2];
      const validCurrencies = ["EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "BRL", "TRY", "ZAR", "MXN", "INR", "NGN", "CNY", "HKD", "SGD"];
      if (validCurrencies.includes(c1) || validCurrencies.includes(c2)) {
        asset = `${c1}${c2}${isOTC ? "-OTC" : ""}`;
        notes.push(`Detected Currency Pair: ${asset}`);
      }
    }
  }

  // 1C. Popular pairs dictionary fallback
  if (!asset) {
    const popularPairs = [
      "EURUSD", "GBPUSD", "USDJPY", "AUDCAD", "AUDJPY", "NZDUSD", "USDCHF", "USDCAD",
      "EURJPY", "GBPJPY", "EURGBP", "AUDUSD", "EURAUD", "EURCAD", "GBPCHF", "GBPAUD",
      "BTCUSD", "ETHUSD", "XAUUSD", "USDBRL", "USDTRY"
    ];
    for (const p of popularPairs) {
      if (upper.replace(/[\/_ -]/g, "").includes(p)) {
        asset = `${p}${isOTC ? "-OTC" : ""}`;
        notes.push(`Found Asset in Feed: ${asset}`);
        break;
      }
    }
  }

  if (!asset) {
    return null;
  }

  // 2. DETECT ACTION (Direction: CALL / PUT)
  let action: "CALL" | "PUT" | "" = "";

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

  if (!action) {
    return null;
  }

  // 3. DETECT TIMEFRAME / DURATION
  let durationMinutes = 5;
  let timeframe: Timeframe = "M5";

  // Check structured Timer / Expiry line
  const timerLineMatch = rawClean.match(/(?:Timer|Expiry|Expiration|Timeframe|TF|Exp|Expiração|Tempo|Duracao)\s*[:=-]\s*(\d+)\s*(?:minutes?|mins?|m)?/i);
  if (timerLineMatch) {
    const mins = parseInt(timerLineMatch[1], 10);
    durationMinutes = mins;
    if (mins === 1) timeframe = "M1";
    else if (mins === 2) timeframe = "M2";
    else if (mins === 5) timeframe = "M5";
    else if (mins === 15) timeframe = "M15";
    else if (mins === 30) timeframe = "M30";
    else if (mins === 60) timeframe = "H1";
    notes.push(`Timeframe from Header: ${timeframe} (${durationMinutes} min)`);
  } else {
    const tfMatch = upper.match(/\b(M1|M2|M5|M15|M30|H1|1M|2M|5M|15M|30M|1\s*MIN(?:UTE)?S?|2\s*MIN(?:UTE)?S?|5\s*MIN(?:UTE)?S?|15\s*MIN(?:UTE)?S?)\b/);
    if (tfMatch) {
      const matched = tfMatch[1].replace(/\s+/g, "");
      if (matched.includes("1M") || matched.includes("M1") || matched.includes("1MIN")) {
        durationMinutes = 1;
        timeframe = "M1";
      } else if (matched.includes("2M") || matched.includes("M2") || matched.includes("2MIN")) {
        durationMinutes = 2;
        timeframe = "M2";
      } else if (matched.includes("5M") || matched.includes("M5") || matched.includes("5MIN")) {
        durationMinutes = 5;
        timeframe = "M5";
      } else if (matched.includes("15M") || matched.includes("M15") || matched.includes("15MIN")) {
        durationMinutes = 15;
        timeframe = "M15";
      } else if (matched.includes("30M") || matched.includes("M30") || matched.includes("30MIN")) {
        durationMinutes = 30;
        timeframe = "M30";
      } else if (matched.includes("H1") || matched.includes("60M")) {
        durationMinutes = 60;
        timeframe = "H1";
      }
      notes.push(`Timeframe: ${timeframe} (${durationMinutes} min)`);
    }
  }

  // 4. DETECT SCHEDULED ENTRY TIME
  let entryType: "NOW" | "SCHEDULED" = "NOW";
  let scheduledTime: string | undefined = undefined;

  const entryLineMatch = rawClean.match(/(?:Entry|Entry\s*Time|Time|Hora|Horário|Horario|Start|At|Início)\s*[:=-]\s*([0-2]?[0-9]:[0-5][0-9](?::[0-5][0-9])?(?:\s*(?:AM|PM|am|pm))?)/i);
  if (entryLineMatch) {
    scheduledTime = entryLineMatch[1].trim();
    entryType = "SCHEDULED";
    notes.push(`Scheduled Entry Time: ${scheduledTime}`);
  } else {
    // Look for standalone time stamp like 14:30 or 11:35 PM (excluding expiry)
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

  // 5. DETECT MARTINGALE LEVELS
  const martingaleLevels: MartingaleLevelInfo[] = [];
  const levelMatches = rawClean.matchAll(/Level\s*([1-3])\s*(?:→|->|:|-)\s*([0-2]?[0-9]:[0-5][0-9](?:\s*(?:AM|PM|am|pm))?)/gi);
  for (const m of levelMatches) {
    martingaleLevels.push({
      level: parseInt(m[1], 10),
      time: m[2].trim(),
    });
  }

  let martingaleSteps = martingaleLevels.length > 0 ? martingaleLevels.length : 1;
  if (martingaleLevels.length > 0) {
    notes.push(`Martingale Schedule: ${martingaleLevels.map((l) => `L${l.level}@${l.time}`).join(", ")}`);
  } else {
    const mgMatch = upper.match(/\b(?:G|GALE|MG|MARTINGALE)[\s:=-]*([0-3])\b/);
    if (mgMatch) {
      martingaleSteps = parseInt(mgMatch[1], 10);
      notes.push(`Martingale: Up to ${martingaleSteps} Gale`);
    } else if (upper.includes("SEM GALE") || upper.includes("NO GALE") || upper.includes("NO MG") || upper.includes("DIRECT")) {
      martingaleSteps = 0;
      notes.push("Martingale: Disabled (Flat Stake / Direct)");
    }
  }

  return {
    id: "sig-" + Date.now(),
    raw: rawClean,
    rawText: rawClean,
    asset,
    action,
    timeframe,
    durationMinutes,
    entryType,
    scheduledTime,
    gale: martingaleSteps,
    martingaleSteps,
    martingaleLevels: martingaleLevels.length > 0 ? martingaleLevels : undefined,
    confidence: matchedKeywords.length >= 3 ? 0.98 : 0.92,
    notes,
    matchedKeywords,
    timestamp: formatTimeInTz(Date.now(), timezone),
  };
}
