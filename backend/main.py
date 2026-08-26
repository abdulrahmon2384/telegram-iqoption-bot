#!/usr/bin/env python3
"""
Master Python Telegram -> IQ Option Auto-Trader
Uses Telethon StringSession for persistent authentication (never repeats login once connected)
and syncs seamlessly with Supabase database.
"""

import os
import sys
import json
import time
import asyncio
import logging
from datetime import datetime
from dotenv import load_dotenv

from signal_parser import TradingSignalParser
from iq_trader import IQOptionTrader
from supabase_sync import SupabaseManager

# Load environment variables
load_dotenv()

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("AutoTraderApp")

class TelegramIQOptionBot:
    def __init__(self):
        self.parser = TradingSignalParser()
        self.supabase = SupabaseManager()

        # Telethon credentials
        self.api_id = os.getenv("TELEGRAM_API_ID", "")
        self.api_hash = os.getenv("TELEGRAM_API_HASH", "")
        self.phone = os.getenv("TELEGRAM_PHONE", "")
        self.session_string = os.getenv("TELEGRAM_SESSION_STRING", "")

        # Check saved session in Supabase if not in env
        if not self.session_string and self.supabase.is_configured:
            saved = self.supabase.get_saved_session()
            if saved and saved.get("session_string"):
                self.session_string = saved["session_string"]
                self.api_id = self.api_id or saved.get("api_id")
                self.api_hash = self.api_hash or saved.get("api_hash")
                logger.info(f"🔑 Loaded persistent Telegram StringSession for user @{saved.get('username') or saved.get('phone')} from Supabase.")

        # IQ Option credentials & risk parameters
        self.iq_email = os.getenv("IQ_OPTION_EMAIL", "")
        self.iq_password = os.getenv("IQ_OPTION_PASSWORD", "")
        self.account_mode = os.getenv("IQ_OPTION_ACCOUNT_MODE", "PRACTICE")
        
        self.trader = IQOptionTrader(self.iq_email, self.iq_password, self.account_mode)
        self.trader.base_stake = float(os.getenv("BASE_STAKE", "10.0"))
        self.trader.min_payout = float(os.getenv("MIN_PAYOUT", "80.0"))
        self.trader.martingale_multiplier = float(os.getenv("MARTINGALE_MULTIPLIER", "2.2"))
        self.trader.stop_loss = float(os.getenv("DAILY_STOP_LOSS", "100.0"))
        self.trader.take_profit = float(os.getenv("DAILY_TAKE_PROFIT", "200.0"))

    async def start_telegram_listener(self):
        """Connects via Telethon using the persistent StringSession."""
        logger.info("Initializing Telethon Client...")

        try:
            from telethon import TelegramClient, events
            from telethon.sessions import StringSession

            if not self.session_string:
                logger.warning("⚠️ No StringSession found. Please authenticate via the UI or run login once.")
                session = StringSession()
            else:
                session = StringSession(self.session_string)

            client = TelegramClient(session, int(self.api_id), self.api_hash)
            await client.start(phone=self.phone)

            # Check and save session string
            new_session = client.session.save()
            me = await client.get_me()
            logger.info(f"✅ Telegram Connected as: {me.first_name} (@{me.username}) - Phone: {me.phone}")

            # Save session to Supabase so it's remembered forever
            if self.supabase.is_configured:
                self.supabase.save_telegram_session(
                    user_id=str(me.id),
                    phone=me.phone or self.phone,
                    username=me.username or "",
                    first_name=me.first_name or "",
                    session_string=new_session,
                    api_id=str(self.api_id),
                    api_hash=self.api_hash
                )

            @client.on(events.NewMessage)
            async def incoming_message_handler(event):
                chat = await event.get_chat()
                chat_title = getattr(chat, 'title', getattr(chat, 'username', 'Direct Message'))
                text = event.raw_text

                logger.info(f"📩 [Telegram Message Received from '{chat_title}']:\n{text}")

                # Parse signal with Python regex engine
                parsed = self.parser.parse(text)
                if not parsed.get("valid"):
                    return

                logger.info(f"🎯 VALID SIGNAL DETECTED: {parsed['asset']} | {parsed['action']} | {parsed['timeframeLabel']} | Gales: {parsed['martingaleSteps']}")

                # Log to Supabase
                if self.supabase.is_configured:
                    self.supabase.log_signal(chat_title, text, parsed, status="PROCESSING")

                # Execute trade on IQ Option
                trade_result = self.trader.execute_signal(parsed)

                # Record trade ledger in Supabase
                if self.supabase.is_configured:
                    self.supabase.record_trade(
                        asset=parsed["asset"],
                        action=parsed["action"],
                        stake=self.trader.base_stake,
                        outcome="WIN" if trade_result.get("win") else "LOSS",
                        profit_loss=trade_result.get("profit", 0.0),
                        gale_level=trade_result.get("finalGale", 0),
                        account_mode=self.account_mode
                    )

            logger.info("🚀 Listening for incoming VIP Telegram signals... Press Ctrl+C to stop.")
            await client.run_until_disconnected()

        except ImportError:
            logger.warning("Telethon package not installed in environment. Running in SIMULATED event mode.")
            while True:
                await asyncio.sleep(20)

    def run(self):
        logger.info("==================================================")
        logger.info("🤖 Starting Telegram -> IQ Option Python Auto-Bot")
        logger.info(f"🔹 Account Mode: {self.account_mode}")
        logger.info(f"🔹 Supabase Sync: {'ENABLED' if self.supabase.is_configured else 'LOCAL STORAGE'}")
        logger.info("==================================================")

        # Connect to IQ Option
        self.trader.connect()

        # Start Telethon loop
        try:
            asyncio.run(self.start_telegram_listener())
        except KeyboardInterrupt:
            logger.info("Bot stopped.")

if __name__ == "__main__":
    bot = TelegramIQOptionBot()
    bot.run()
