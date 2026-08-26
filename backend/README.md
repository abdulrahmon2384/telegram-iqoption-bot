# Python Telegram -> IQ Option Trading Bot Backend

A complete, asynchronous Python backend worker designed to read VIP Telegram signal channels/bots and execute binary and digital options orders on IQ Option automatically with sub-50ms latency.

---

## 📁 Architecture Overview

- **`main.py`**: Central orchestrator connecting Telegram and IQ Option.
- **`signal_parser.py`**: Regex and NLP engine parsing multi-lingual Telegram signals (English, Portuguese, Spanish, Hindi, Russian), OTC assets, expiration times, scheduled entry clocks, and Martingale steps.
- **`iq_trader.py`**: IQ Option WebSocket manager with automated Martingale recovery (Gale 1/2), daily stop-loss and take-profit killswitches, and minimum payout verification.
- **`telegram_listener.py`**: Asynchronous Telethon MTProto client (can read **any private VIP channel you joined** without needing bot admin permissions) or Bot API.
- **`requirements.txt`**: Standard Python dependencies (`telethon`, `iqoptionapi`, `python-dotenv`).

---

## 🚀 Quick Start & Installation

### 1. Install Python 3.10+ and Dependencies
```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` and fill in your details:
```bash
cp .env.example .env
```

```env
# Telegram MTProto Credentials (from https://my.telegram.org)
TELEGRAM_API_ID=12345678
TELEGRAM_API_HASH=your_telegram_api_hash
TELEGRAM_PHONE=+1234567890

# Optional: If using a Telegram Bot instead of a User account
TELEGRAM_BOT_TOKEN=

# IQ Option Credentials
IQ_OPTION_EMAIL=your_iq_email@gmail.com
IQ_OPTION_PASSWORD=your_iq_password
IQ_OPTION_ACCOUNT_MODE=PRACTICE  # Change to REAL for real trading

# Risk Management
BASE_STAKE=10.0
MIN_PAYOUT=80.0
MARTINGALE_MULTIPLIER=2.2
DAILY_STOP_LOSS=100.0
DAILY_TAKE_PROFIT=200.0
```

### 3. Run the Bot
```bash
python3 main.py
```

On first run, Telethon will ask you for a 5-digit Telegram confirmation code sent to your Telegram app. Once entered, a session file is saved locally so you don't need to log in again.

---

## 🧪 Testing Signal Parsing Standalone
You can test any signal directly from the command line:
```bash
python3 signal_parser.py "⚡ VIP FOREX ⚡ EUR/USD CALL M5 ENTRY 14:30 GALE 2"
```
Output:
```json
{
  "valid": true,
  "asset": "EURUSD",
  "action": "CALL",
  "timeframe": 5,
  "timeframeLabel": "M5",
  "entryTime": "14:30",
  "martingaleSteps": 2,
  "isOTC": false,
  "confidenceScore": 0.99
}
```
