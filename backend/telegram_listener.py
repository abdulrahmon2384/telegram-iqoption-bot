#!/usr/bin/env python3
"""
Python Telegram Channel Listener (Telethon MTProto + Bot API)
Allows listening to private VIP channels, groups, or direct messages.
Monitors all incoming messages, detects signal keywords, identifies trading signals,
and logs them as IDENTIFIED without executing live trades yet.
"""

import os
import asyncio
import logging
from typing import Callable, Optional, Dict, Any
from dotenv import load_dotenv
from signal_parser import TradingSignalParser

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("TelegramListener")

class TelegramSignalListener:
    def __init__(self, api_id: Optional[int] = None, api_hash: Optional[str] = None, phone: Optional[str] = None, bot_token: Optional[str] = None):
        self.api_id = api_id or int(os.getenv("TELEGRAM_API_ID", "12345678"))
        self.api_hash = api_hash or os.getenv("TELEGRAM_API_HASH", "abcdef0123456789abcdef0123456789")
        self.phone = phone or os.getenv("TELEGRAM_PHONE", "")
        self.bot_token = bot_token or os.getenv("TELEGRAM_BOT_TOKEN", "")
        self.client = None
        self.message_callback = None
        self.allowed_channels = []
        self.parser = TradingSignalParser()

    def set_callback(self, callback: Callable[[Dict[str, Any]], None]):
        """Sets the handler function called when a new message arrives."""
        self.message_callback = callback

    def add_channel_filter(self, channel_id_or_name: str):
        """Whitelists specific channels to monitor."""
        if channel_id_or_name not in self.allowed_channels:
            self.allowed_channels.append(channel_id_or_name)

    def process_incoming_message(self, text: str, source_title: str) -> Dict[str, Any]:
        """Processes message text, checks for signal indicators, and identifies signals."""
        keywords = self.parser.detect_keywords(text)
        parsed = self.parser.parse(text)
        is_signal = parsed.get("valid", False)

        result = {
            "channel": source_title,
            "rawText": text,
            "isSignal": is_signal,
            "matchedKeywords": keywords,
            "parsed": parsed if is_signal else None,
            "status": "IDENTIFIED" if is_signal else "NON_SIGNAL_MESSAGE"
        }

        if is_signal:
            logger.info(f"🎯 [SIGNAL IDENTIFIED from '{source_title}'] -> Asset: {parsed.get('asset')} | Action: {parsed.get('action')} | Timeframe: {parsed.get('timeframeLabel')} | Entry: {parsed.get('entryTime')}")
            logger.info("ℹ️ Status: IDENTIFIED ONLY (No trade executed as per configuration)")
        else:
            logger.info(f"📨 [Regular Message from '{source_title}']: {text[:80]}...")

        return result

    async def start(self):
        """Starts Telethon asynchronous client loop with auto-reconnect resilience."""
        logger.info("Initializing Telegram Telethon Client...")
        try:
            from telethon import TelegramClient, events
            
            if self.bot_token:
                self.client = TelegramClient('bot_session', self.api_id, self.api_hash)
                await self.client.start(bot_token=self.bot_token)
                logger.info("🤖 Connected to Telegram as BOT.")
            else:
                self.client = TelegramClient('user_session', self.api_id, self.api_hash)
                await self.client.start(phone=self.phone)
                logger.info("👤 Connected to Telegram as USER (Can read all private VIP channels).")

            @self.client.on(events.NewMessage(chats=self.allowed_channels if self.allowed_channels else None))
            async def handler(event):
                sender = await event.get_chat()
                chat_title = getattr(sender, 'title', getattr(sender, 'username', 'Monitored Channel'))
                message_text = event.raw_text
                
                processed = self.process_incoming_message(message_text, chat_title)
                if self.message_callback:
                    self.message_callback(processed)

            logger.info("🚀 Channel Listener active and awake. Listening for incoming messages...")
            await self.client.run_until_disconnected()

        except ImportError:
            logger.warning("Telethon package not installed in current environment. Running in SIMULATED Listener mode.")
            await self._run_simulated_listener()
        except Exception as e:
            logger.error(f"Telegram client error: {str(e)}")

    async def _run_simulated_listener(self):
        """Simulates incoming messages and signals every 18 seconds for testing."""
        import random
        simulated_messages = [
            """🔔 NEW SIGNAL!
🎫 Trade: 🇪🇺 EUR/USD 🇺🇸 (OTC)
⏳ Timer: 1 minutes
➡️ Entry: 11:35 PM
📈 Direction: BUY 🟩
↪️ Martingale Levels:
Level 1 → 11:36 PM
Level 2 → 11:37 PM
Level 3 → 11:38 PM""",
            """🚨TRADE NOW!!
📉🇦🇺 AUD/JPY 🇯🇵 (OTC)
⏰ Expiry: 2 minutes
📍 Entry Time: 12:57 AM
📈 Direction: SELL 🟥
🎯 Martingale Levels:
🔁 Level 1 → 9:41 PM
🔁 Level 2 → 9:43 PM
🔁 Level 3 → 9:45 PM""",
            "Good morning traders! Analyzing market conditions for today's session. Stay tuned.",
            """🔔 NEW SIGNAL!
🎫 Trade: 🇬🇧 GBP/USD 🇺🇸
⏳ Timer: 5 minutes
➡️ Entry: 02:15 PM
📈 Direction: BUY 🟩
↪️ Martingale Levels:
Level 1 → 02:20 PM
Level 2 → 02:25 PM""",
            "Next session starts in 10 minutes. Get your charts ready."
        ]
        while True:
            await asyncio.sleep(18)
            sample = random.choice(simulated_messages)
            channel = "VIP Signal Hub"
            processed = self.process_incoming_message(sample, channel)
            if self.message_callback:
                self.message_callback(processed)

if __name__ == "__main__":
    def on_message(data):
        print(f"\n--- Dispatched Event ---")
        print(f"Channel: {data['channel']} | Status: {data['status']}")
        if data['isSignal']:
            print(f"Asset: {data['parsed']['asset']} | Direction: {data['parsed']['action']} | TF: {data['parsed']['timeframeLabel']}")

    listener = TelegramSignalListener()
    listener.set_callback(on_message)
    asyncio.run(listener.start())
