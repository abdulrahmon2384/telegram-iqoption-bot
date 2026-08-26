#!/usr/bin/env python3
"""
Python Supabase Database Client for Telegram SignalBot
Syncs persistent Telegram StringSessions, monitored channels, signal logs, and trade history.
"""

import os
import json
import requests
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv

load_dotenv()

class SupabaseManager:
    def __init__(self, supabase_url: Optional[str] = None, supabase_key: Optional[str] = None):
        self.url = (supabase_url or os.getenv("VITE_SUPABASE_URL", "")).rstrip("/")
        self.key = supabase_key or os.getenv("VITE_SUPABASE_ANON_KEY", os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""))
        self.headers = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation"
        }

    @property
    def is_configured(self) -> bool:
        return bool(self.url and self.key)

    def save_telegram_session(self, user_id: str, phone: str, username: str, first_name: str, session_string: str, api_id: str, api_hash: str) -> Dict[str, Any]:
        """Saves persistent Telegram Telethon StringSession to Supabase."""
        if not self.is_configured:
            return {"success": False, "reason": "SUPABASE_NOT_CONFIGURED"}

        payload = {
            "user_id": user_id,
            "phone": phone,
            "username": username,
            "first_name": first_name,
            "session_string": session_string,
            "api_id": str(api_id),
            "api_hash": api_hash,
            "is_active": True,
            "updated_at": "now()"
        }

        try:
            # Upsert into telegram_auth table
            res = requests.post(
                f"{self.url}/rest/v1/telegram_auth?on_conflict=user_id",
                headers={**self.headers, "Prefer": "resolution=merge-duplicates,return=representation"},
                json=payload,
                timeout=5
            )
            return {"success": res.status_code in [200, 201], "data": res.json() if res.status_code in [200, 201] else res.text}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def get_saved_session(self) -> Optional[Dict[str, Any]]:
        """Retrieves active Telegram session from Supabase."""
        if not self.is_configured:
            return None

        try:
            res = requests.get(
                f"{self.url}/rest/v1/telegram_auth?is_active=eq.true&order=updated_at.desc&limit=1",
                headers=self.headers,
                timeout=5
            )
            if res.status_code == 200 and res.json():
                return res.json()[0]
            return None
        except Exception:
            return None

    def get_bot_settings(self) -> Optional[Dict[str, Any]]:
        """Retrieves bot settings, IQ Option credentials, and risk parameters from Supabase."""
        if not self.is_configured:
            return None

        try:
            res = requests.get(
                f"{self.url}/rest/v1/bot_settings?id=eq.main_config&limit=1",
                headers=self.headers,
                timeout=5
            )
            if res.status_code == 200 and res.json():
                return res.json()[0]
            return None
        except Exception:
            return None

    def save_bot_settings(self, settings_dict: Dict[str, Any]) -> Dict[str, Any]:
        """Saves or updates bot settings in Supabase."""
        if not self.is_configured:
            return {"success": False, "reason": "SUPABASE_NOT_CONFIGURED"}

        payload = {
            "id": "main_config",
            "updated_at": "now()",
            **settings_dict
        }

        try:
            res = requests.post(
                f"{self.url}/rest/v1/bot_settings?on_conflict=id",
                headers={**self.headers, "Prefer": "resolution=merge-duplicates,return=representation"},
                json=payload,
                timeout=5
            )
            return {"success": res.status_code in [200, 201]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def log_signal(self, source_channel: str, raw_message: str, parsed: Dict[str, Any], status: str = "EXECUTED") -> Dict[str, Any]:
        """Logs received signal to Supabase."""
        if not self.is_configured:
            return {"success": False, "reason": "SUPABASE_NOT_CONFIGURED"}

        payload = {
            "source_channel": source_channel,
            "raw_message": raw_message,
            "asset": parsed.get("asset", "UNKNOWN"),
            "action": parsed.get("action", "UNKNOWN"),
            "timeframe": parsed.get("timeframeLabel", "M5"),
            "martingale_steps": parsed.get("martingaleSteps", 1),
            "status": status
        }

        try:
            res = requests.post(
                f"{self.url}/rest/v1/trading_signals",
                headers=self.headers,
                json=payload,
                timeout=5
            )
            return {"success": res.status_code in [200, 201]}
        except Exception as e:
            return {"success": False, "error": str(e)}

    def record_trade(self, asset: str, action: str, stake: float, outcome: str, profit_loss: float, gale_level: int = 0, account_mode: str = "PRACTICE") -> Dict[str, Any]:
        """Records trade execution ledger entry."""
        if not self.is_configured:
            return {"success": False, "reason": "SUPABASE_NOT_CONFIGURED"}

        payload = {
            "asset": asset,
            "action": action,
            "stake": stake,
            "outcome": outcome,
            "profit_loss": profit_loss,
            "gale_level": gale_level,
            "account_mode": account_mode
        }

        try:
            res = requests.post(
                f"{self.url}/rest/v1/trade_executions",
                headers=self.headers,
                json=payload,
                timeout=5
            )
            return {"success": res.status_code in [200, 201]}
        except Exception as e:
            return {"success": False, "error": str(e)}

if __name__ == "__main__":
    client = SupabaseManager()
    print(f"Supabase configured: {client.is_configured}")
