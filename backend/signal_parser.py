#!/usr/bin/env python3
"""
Python Trading Signal Parser for Telegram -> IQ Option
Supports multi-language signal patterns, VIP flag-emoji formats,
OTC assets, expiration intervals (M1, M2, M5, etc.), 12-hour AM/PM and 24-hour scheduled times,
and Martingale level extraction.
"""

import re
import json
import sys
from datetime import datetime, timezone
from typing import Dict, Any, List, Optional

VALID_BASE_CURRENCIES = {"EUR", "USD", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD", "BTC", "ETH", "LTC", "XRP", "USDT"}

class TradingSignalParser:
    def __init__(self):
        # Direction patterns
        self.call_patterns = [
            r'\b(CALL|BUY|HIGHER|UP|COMPRA|ALTA|SUBE|ARRIBA|VERDE|COMPRAR|BUYING)\b',
            r'[🟢🟩🔼⬆️📈🔺➕🐂]'
        ]
        self.put_patterns = [
            r'\b(PUT|SELL|LOWER|DOWN|VENDA|BAIXA|BAJA|ABAJO|ROJO|VENDER|SELLING)\b',
            r'[🔴🟥🔽⬇️📉🔻➖🐻]'
        ]
        
        # Keywords detection
        self.signal_keywords = [
            ("Trade:", r'\btrade\s*:' ),
            ("Timer:", r'\btimer\s*:' ),
            ("Expiry:", r'\bexpiry\s*:' ),
            ("Entry:", r'\bentry\s*:' ),
            ("Entry Time:", r'\bentry\s*time\s*:' ),
            ("Direction:", r'\bdirection\s*:' ),
            ("Martingale Levels:", r'\bmartingale\s*(?:levels?)?\s*:' ),
            ("BUY/CALL", r'\b(buy|call|compra|🟩|🟢)\b' ),
            ("SELL/PUT", r'\b(sell|put|venda|🟥|🔴)\b' ),
        ]

    def detect_keywords(self, text: str) -> List[str]:
        matched = []
        for label, pattern in self.signal_keywords:
            if re.search(pattern, text, re.IGNORECASE):
                matched.append(label)
        return matched

    def parse(self, text: str) -> Dict[str, Any]:
        """Parses raw telegram text into structured signal payload."""
        if not text or not text.strip():
            return {
                "valid": False,
                "error": "Empty message string",
                "raw": text
            }

        cleaned = text.strip()
        upper = cleaned.upper()
        matched_keywords = self.detect_keywords(cleaned)
        is_otc = "(OTC)" in upper or "-OTC" in upper or "_OTC" in upper or bool(re.search(r'\bOTC\b', upper))

        # 1. Detect Asset
        asset = None
        # Check structured Trade header e.g. "Trade: 🇪🇺 EUR/USD 🇺🇸 (OTC)" or "📉🇦🇺 AUD/JPY 🇯🇵 (OTC)"
        trade_line_match = re.search(r'(?:Trade|Par|Asset|Pair)\s*:\s*([^\n\r]+)', cleaned, re.IGNORECASE)
        if trade_line_match:
            pair_in_line = re.search(r'([A-Z]{3})[\/_]?([A-Z]{3})', trade_line_match.group(1).upper())
            if pair_in_line:
                base = pair_in_line.group(1)
                quote = pair_in_line.group(2)
                asset = f"{base}{quote}-OTC" if is_otc else f"{base}{quote}"

        if not asset:
            # Look for emoji-pair lines or any standard pair
            pair_match = re.search(r'([A-Z]{3})[\/_]?([A-Z]{3})', upper)
            if pair_match:
                base = pair_match.group(1)
                quote = pair_match.group(2)
                asset = f"{base}{quote}-OTC" if is_otc else f"{base}{quote}"

        if not asset:
            return {
                "valid": False,
                "error": "Could not identify a valid currency or crypto asset pair (e.g. EURUSD, AUDJPY-OTC)",
                "raw": text,
                "matchedKeywords": matched_keywords
            }

        # 2. Detect Action (Direction: BUY 🟩, Direction: SELL 🟥, CALL, PUT)
        action = None
        dir_line_match = re.search(r'Direction\s*:\s*([^\n\r]+)', cleaned, re.IGNORECASE)
        if dir_line_match:
            dir_text = dir_line_match.group(1).upper()
            if "BUY" in dir_text or "CALL" in dir_text or "🟩" in dir_text or "🟢" in dir_text:
                action = "CALL"
            elif "SELL" in dir_text or "PUT" in dir_text or "🟥" in dir_text or "🔴" in dir_text:
                action = "PUT"

        if not action:
            for pattern in self.call_patterns:
                if re.search(pattern, cleaned, re.IGNORECASE):
                    action = "CALL"
                    break
        
        if not action:
            for pattern in self.put_patterns:
                if re.search(pattern, cleaned, re.IGNORECASE):
                    action = "PUT"
                    break

        if not action:
            return {
                "valid": False,
                "error": "Could not identify trading direction (CALL/BUY vs PUT/SELL)",
                "asset": asset,
                "raw": text,
                "matchedKeywords": matched_keywords
            }

        # 3. Detect Timeframe / Expiry (Timer: 1 minutes, Expiry: 2 minutes, M5)
        timeframe = 5
        tf_label = "M5"
        timer_line = re.search(r'(?:Timer|Expiry|Timeframe|TF|Exp)\s*:\s*(\d+)\s*(?:minutes?|mins?|m)?', cleaned, re.IGNORECASE)
        if timer_line:
            mins = int(timer_line.group(1))
            timeframe = mins
            tf_label = f"M{mins}" if mins < 60 else "H1"
        else:
            tf_match = re.search(r'\b(M1|M2|M5|M15|M30|H1|1M|2M|5M|15M|30M|1\s*MIN(?:UTE)?S?|2\s*MIN(?:UTE)?S?|5\s*MIN(?:UTE)?S?)\b', upper)
            if tf_match:
                tf_str = tf_match.group(1).replace(" ", "")
                if "1M" in tf_str or "M1" in tf_str or "1MIN" in tf_str:
                    timeframe = 1
                    tf_label = "M1"
                elif "2M" in tf_str or "M2" in tf_str or "2MIN" in tf_str:
                    timeframe = 2
                    tf_label = "M2"
                elif "5M" in tf_str or "M5" in tf_str or "5MIN" in tf_str:
                    timeframe = 5
                    tf_label = "M5"
                elif "15M" in tf_str or "M15" in tf_str or "15MIN" in tf_str:
                    timeframe = 15
                    tf_label = "M15"
                elif "30M" in tf_str or "M30" in tf_str or "30MIN" in tf_str:
                    timeframe = 30
                    tf_label = "M30"
                elif "H1" in tf_str or "60M" in tf_str:
                    timeframe = 60
                    tf_label = "H1"

        # 4. Detect Scheduled Entry Time (e.g. "Entry: 11:35 PM", "Entry Time: 12:57 AM", "14:30")
        entry_time = None
        entry_line = re.search(r'(?:Entry|Entry Time|Entrada|Hora)\s*:\s*([0-2]?[0-9]:[0-5][0-9](?:\s*(?:AM|PM|am|pm))?)', cleaned, re.IGNORECASE)
        if entry_line:
            entry_time = entry_line.group(1).strip()
        else:
            time_match = re.search(r'\b([0-2]?[0-9]:[0-5][0-9](?:\s*(?:AM|PM))?)\b', upper)
            if time_match and "EXPIRY" not in upper and "EXP" not in upper:
                entry_time = time_match.group(1).strip()

        # 5. Detect Martingale Levels (e.g. Level 1 → 11:36 PM, Level 2 → 11:37 PM, Level 3 → 11:38 PM)
        martingale_levels = []
        level_matches = re.finditer(r'Level\s*([1-3])\s*(?:→|->|:|-)\s*([0-2]?[0-9]:[0-5][0-9](?:\s*(?:AM|PM|am|pm))?)', cleaned, re.IGNORECASE)
        for m in level_matches:
            martingale_levels.append({
                "level": int(m.group(1)),
                "time": m.group(2).strip()
            })

        martingale_steps = len(martingale_levels) if martingale_levels else 1
        if not martingale_levels:
            gale_match = re.search(r'\b(?:MARTINGALE|GALE|GALES|PROTEÇÃO|MG)?[:\s-]*(G[0-3]|0|1|2|3|\b1\s*GALE\b|\b2\s*GALES?\b|\bSEM\s*GALE\b|\bNO\s*GALE\b)\b', upper)
            if gale_match:
                g_str = gale_match.group(1)
                if "0" in g_str or "SEM" in g_str or "NO" in g_str:
                    martingale_steps = 0
                elif "1" in g_str or "G1" in g_str:
                    martingale_steps = 1
                elif "2" in g_str or "G2" in g_str:
                    martingale_steps = 2
                elif "3" in g_str or "G3" in g_str:
                    martingale_steps = 3

        return {
            "valid": True,
            "asset": asset,
            "action": action,
            "timeframe": timeframe,
            "timeframeLabel": tf_label,
            "entryTime": entry_time if entry_time else "NOW / IMMEDIATE",
            "martingaleSteps": martingale_steps,
            "martingaleLevels": martingale_levels,
            "isOTC": is_otc,
            "matchedKeywords": matched_keywords,
            "confidenceScore": 0.99 if len(matched_keywords) >= 3 else 0.92,
            "parsedAt": datetime.now(timezone.utc).isoformat(),
            "raw": text
        }

if __name__ == "__main__":
    parser = TradingSignalParser()
    if len(sys.argv) > 1:
        raw_input = " ".join(sys.argv[1:])
        result = parser.parse(raw_input)
        print(json.dumps(result, indent=2))
    else:
        test_samples = [
            "🔔 NEW SIGNAL!\n🎫 Trade: 🇪🇺 EUR/USD 🇺🇸 (OTC)\n⏳ Timer: 1 minutes\n➡️ Entry: 11:35 PM\n📈 Direction: BUY 🟩\n↪️ Martingale Levels:\nLevel 1 → 11:36 PM\nLevel 2 → 11:37 PM\nLevel 3 → 11:38 PM",
            "🚨TRADE NOW!!\n📉🇦🇺 AUD/JPY 🇯🇵 (OTC)\n⏰ Expiry: 2 minutes\n📍 Entry Time: 12:57 AM\n📈 Direction: SELL 🟥\n🎯 Martingale Levels:\n🔁 Level 1 → 9:41 PM\n🔁 Level 2 → 9:43 PM\n🔁 Level 3 → 9:45 PM"
        ]
        print("Running TradingSignalParser Tests on Provided Formats:")
        for idx, sample in enumerate(test_samples, 1):
            res = parser.parse(sample)
            print(f"\n--- Sample {idx} ---")
            print(json.dumps(res, indent=2))
