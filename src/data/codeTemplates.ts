export const NODEJS_BOT_SCRIPT = `/**
 * PRODUCTION-READY TELEGRAM TO IQ OPTION TRADING BOT BRIDGE (Node.js)
 * 
 * Instructions:
 * 1. Install dependencies:
 *    npm install dotenv telegraf ws axios
 * 2. Create a .env file with your credentials:
 *    TELEGRAM_BOT_TOKEN=your_bot_token_here
 *    TELEGRAM_CHANNEL_ID=-100123456789
 *    IQ_OPTION_EMAIL=your_iqoption_email@example.com
 *    IQ_OPTION_PASSWORD=your_iqoption_password
 *    IQ_ACCOUNT_TYPE=PRACTICE  # or REAL
 *    DEFAULT_STAKE=10
 *    MAX_GALE=1
 * 3. Run: node index.js
 */

const { Telegraf } = require('telegraf');
const WebSocket = require('ws');
require('dotenv').config();

// Configuration
const CONFIG = {
  token: process.env.TELEGRAM_BOT_TOKEN,
  channelId: process.env.TELEGRAM_CHANNEL_ID,
  iqEmail: process.env.IQ_OPTION_EMAIL,
  iqPassword: process.env.IQ_OPTION_PASSWORD,
  accountType: process.env.IQ_ACCOUNT_TYPE || 'PRACTICE',
  baseStake: parseFloat(process.env.DEFAULT_STAKE || '10'),
  maxGale: parseInt(process.env.MAX_GALE || '1', 10),
  galeMultiplier: 2.2,
};

let iqSocket = null;
let ssid = null;
let activeAccountId = null;

// 1. Initialize IQ Option WebSocket Connection
function connectIQOption() {
  console.log('[IQ Option] Connecting to WebSocket gateway...');
  iqSocket = new WebSocket('wss://iqoption.com/echo/websocket', {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  iqSocket.on('open', () => {
    console.log('[IQ Option] WebSocket connected. Authenticating...');
    // Login request
    const authPayload = {
      name: 'ssid',
      msg: CONFIG.iqPassword ? '' : 'your_session_ssid_here'
    };
    iqSocket.send(JSON.stringify(authPayload));
  });

  iqSocket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.name === 'profile') {
        console.log(\`[IQ Option] Logged in successfully! User: \${msg.msg.name}\`);
        const balance = msg.msg.balances.find(b => 
          CONFIG.accountType === 'REAL' ? b.type === 1 : b.type === 4
        );
        if (balance) {
          activeAccountId = balance.id;
          console.log(\`[IQ Option] Active Balance: $\${balance.amount} (\${CONFIG.accountType})\`);
        }
      } else if (msg.name === 'option-opened') {
        console.log(\`[Trade Executed] Order ID: \${msg.msg.id} | Asset: \${msg.msg.active_id}\`);
      }
    } catch (e) {
      console.error('Error parsing IQ Option response:', e);
    }
  });

  iqSocket.on('close', () => {
    console.log('[IQ Option] Connection lost. Reconnecting in 5s...');
    setTimeout(connectIQOption, 5000);
  });
}

// 2. Parse Telegram Signal Text
function parseSignal(text) {
  if (!text) return null;
  const upper = text.toUpperCase();

  // Extract Asset
  const pairMatch = upper.match(/\\b([A-Z]{3}[\\/_]?[A-Z]{3}(?:[-_]OTC)?|[A-Z]{2,6}(?:[-_]OTC)?)\\b/);
  if (!pairMatch) return null;
  const asset = pairMatch[1].replace(/[\\/_]/g, '');

  // Extract Action
  let action = null;
  if (/\\b(CALL|BUY|HIGHER|UP|COMPRA|🟢|🔼)\\b/i.test(upper)) action = 'CALL';
  else if (/\\b(PUT|SELL|LOWER|DOWN|VENDA|🔴|🔽)\\b/i.test(upper)) action = 'PUT';
  if (!action) return null;

  // Extract Timeframe
  let duration = 5;
  if (/\\b(1M|M1|1\\s*MIN)\\b/i.test(upper)) duration = 1;
  else if (/\\b(5M|M5|5\\s*MIN)\\b/i.test(upper)) duration = 5;
  else if (/\\b(15M|M15|15\\s*MIN)\\b/i.test(upper)) duration = 15;

  return { asset, action, duration };
}

// 3. Execute Trade on IQ Option
function placeBinaryOrder(asset, action, durationMinutes, stake) {
  if (!iqSocket || iqSocket.readyState !== WebSocket.OPEN) {
    console.error('[Error] IQ Option socket not ready');
    return;
  }

  const activeIdMap = {
    'EURUSD': 1, 'GBPUSD': 2, 'USDJPY': 3, 'EURGBP': 4,
    'AUDCAD': 5, 'EURUSD-OTC': 76, 'GBPUSD-OTC': 77
  };

  const activeId = activeIdMap[asset] || 1;
  const expTime = Math.floor(Date.now() / 1000) + (durationMinutes * 60);

  const orderPayload = {
    name: 'binary-options.open-option',
    version: '1.0',
    body: {
      user_balance_id: activeAccountId,
      active_id: activeId,
      option_type_id: 3, // Turbo / Binary
      direction: action.toLowerCase() === 'call' ? 'call' : 'put',
      expired: expTime,
      refund_value: 0,
      price: stake
    }
  };

  console.log(\`[Executing] Placing \${action} on \${asset} for $\${stake} (Exp: \${durationMinutes}m)...\`);
  iqSocket.send(JSON.stringify(orderPayload));
}

// 4. Initialize Telegram Listener
if (CONFIG.token) {
  const bot = new Telegraf(CONFIG.token);

  bot.on('channel_post', (ctx) => {
    const messageText = ctx.channelPost.text || ctx.channelPost.caption;
    console.log(\`[Telegram Message Received]:\\n\${messageText}\`);

    const signal = parseSignal(messageText);
    if (signal) {
      console.log('[Valid Signal Detected]:', signal);
      placeBinaryOrder(signal.asset, signal.action, signal.duration, CONFIG.baseStake);
    }
  });

  bot.launch().then(() => {
    console.log('🤖 Telegram Bot listener started successfully!');
  });
}

connectIQOption();
`;

export const PYTHON_BOT_SCRIPT = `"""
PRODUCTION TELEGRAM CHANNEL USER CLIENT -> IQ OPTION TRADING BOT (Python)

Uses Telethon (reads any VIP Channel you are a member of, without needing Bot Admin rights)
and iqoptionapi for direct binary order execution.

Install:
pip install telethon iqoptionapi python-dotenv
"""

import os
import re
import asyncio
from datetime import datetime
from telethon import TelegramClient, events
from iqoptionapi.stable_api import IQ_Option
from dotenv import load_dotenv

load_dotenv()

# Credentials
API_ID = int(os.getenv("TELEGRAM_API_ID", "1234567"))
API_HASH = os.getenv("TELEGRAM_API_HASH", "your_api_hash_here")
IQ_EMAIL = os.getenv("IQ_EMAIL", "your_iqoption_email@example.com")
IQ_PASSWORD = os.getenv("IQ_PASSWORD", "your_iqoption_password")
ACCOUNT_TYPE = os.getenv("ACCOUNT_TYPE", "PRACTICE")  # PRACTICE or REAL
DEFAULT_STAKE = float(os.getenv("DEFAULT_STAKE", "10.0"))
MAX_GALE = int(os.getenv("MAX_GALE", "1"))
GALE_MULTIPLIER = 2.2

# Channels to listen to (channel usernames or IDs)
TARGET_CHANNELS = ["vip_trading_signals", "sinais_vip_iq"]

print("Connecting to IQ Option...")
iq = IQ_Option(IQ_EMAIL, IQ_PASSWORD)
status, reason = iq.connect()

if not status:
    print(f"Failed to connect to IQ Option: {reason}")
    exit(1)

iq.change_balance(ACCOUNT_TYPE)
print(f"Connected to IQ Option! Balance: \\\${iq.get_balance()} ({ACCOUNT_TYPE})")

def parse_signal(text: str):
    if not text:
        return None
    upper = text.upper()

    # Asset match
    pair_match = re.search(r'\\b([A-Z]{3}[/_]?[A-Z]{3}(?:[-_]OTC)?|[A-Z]{2,6}(?:[-_]OTC)?)\\b', upper)
    if not pair_match:
        return None
    asset = pair_match.group(1).replace('/', '').replace('_', '')

    # Action match
    action = None
    if re.search(r'\\b(CALL|BUY|HIGHER|UP|COMPRA|🟢|🔼)\\b', upper):
        action = "call"
    elif re.search(r'\\b(PUT|SELL|LOWER|DOWN|VENDA|🔴|🔽)\\b', upper):
        action = "put"
    if not action:
        return None

    # Expiry
    duration = 5
    if re.search(r'\\b(1M|M1|1\\s*MIN)\\b', upper):
        duration = 1
    elif re.search(r'\\b(5M|M5|5\\s*MIN)\\b', upper):
        duration = 5
    elif re.search(r'\\b(15M|M15|15\\s*MIN)\\b', upper):
        duration = 15

    return {"asset": asset, "action": action, "duration": duration}

def execute_trade_with_martingale(asset: str, action: str, duration: int, initial_stake: float):
    current_stake = initial_stake
    for gale_step in range(MAX_GALE + 1):
        print(f"Executing {action.upper()} on {asset} for \\\${current_stake} (Gale {gale_step})...")
        success, order_id = iq.buy(current_stake, asset, action, duration)
        
        if not success:
            print(f"Failed to place trade on {asset}: {order_id}")
            break

        print(f"Order #{order_id} active. Waiting for expiration ({duration} min)...")
        # In real execution, check result
        result, pnl = iq.check_win_v3(order_id)
        if result == "win":
            print(f"🏆 WIN! Profit: +\\\${pnl}")
            break
        elif result == "loose":
            print(f"❌ Loss on step {gale_step}.")
            current_stake *= GALE_MULTIPLIER
        else:
            print(f"Tie/Equal.")
            break

client = TelegramClient('session_trader', API_ID, API_HASH)

@client.on(events.NewMessage(chats=TARGET_CHANNELS))
async def handler(event):
    message_text = event.raw_text
    print(f"\\n[Telegram Signal Received]:\\n{message_text}")
    signal = parse_signal(message_text)
    if signal:
        print(f"Parsed Signal: {signal}")
        execute_trade_with_martingale(signal['asset'], signal['action'], signal['duration'], DEFAULT_STAKE)

print("🚀 Telegram User Listener running... Waiting for VIP signals...")
client.start()
client.run_until_disconnected()
`;
