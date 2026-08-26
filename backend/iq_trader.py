#!/usr/bin/env python3
"""
Python IQ Option Trading Engine - Powered by IQ_Option / stable_api v6.8.9.1
Manages API authentication, balance checking, payout verification,
order execution (Turbo & Binary options), and automated Martingale recovery.
"""

import sys
import os
import time
import json
import logging
from typing import Dict, Any, Optional, Tuple, List

# Ensure local backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from iqoptionapi.stable_api import IQ_Option

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("IQTrader")

class IQOptionTrader:
    def __init__(self, email: str, password: str, account_type: str = "PRACTICE"):
        self.email = email
        self.password = password
        self.account_type = account_type.upper()  # "PRACTICE" or "REAL"
        self.api = None
        self.connected = False
        self.last_error = None
        self.base_stake = 10.0
        self.min_payout = 80.0
        self.martingale_multiplier = 2.2
        self.stop_loss = 100.0
        self.take_profit = 200.0
        self.daily_profit = 0.0
        self.active_trades_count = 0

    def connect(self) -> Tuple[bool, Optional[str]]:
        """Connects to IQ Option WebSocket servers using credentials via stable_api 6.8.9.1."""
        logger.info(f"Connecting to IQ Option (v6.8.9.1) for user: {self.email} (Account Mode: {self.account_type})...")
        try:
            self.api = IQ_Option(self.email, self.password, self.account_type)
            check, reason = self.api.connect()
            
            if check:
                self.connected = True
                self.api.change_balance(self.account_type)
                balance = self.get_balance()
                logger.info(f"✅ Successfully connected to IQ Option! Current {self.account_type} Balance: ${balance:.2f}")
                return True, None
            else:
                self.last_error = reason
                logger.error(f"❌ Failed to connect: {reason}")
                return False, reason
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Connection error: {str(e)}")
            return False, str(e)

    def get_balance(self) -> float:
        """Retrieves active account balance."""
        if not self.connected or not self.api:
            return 0.0
        try:
            return float(self.api.get_balance())
        except Exception:
            return 0.0

    def get_payout(self, asset: str) -> float:
        """Checks current broker payout percentage for the given asset."""
        if not self.connected or not self.api:
            # Simulated realistic payout
            return 87.0
        try:
            all_profits = self.api.get_all_profit()
            asset_clean = asset.upper().replace("-OTC", "")
            if asset_clean in all_profits:
                return float(all_profits[asset_clean]["turbo"] * 100)
            return 85.0
        except Exception:
            return 85.0

    def execute_signal(self, signal: Dict[str, Any]) -> Dict[str, Any]:
        """
        Executes a parsed signal with risk checks and automatic Martingale.
        """
        asset = signal.get("asset")
        action = signal.get("action", "").lower()  # "call" or "put"
        duration = signal.get("timeframe", 5)      # 1, 2, 5, 15 min
        max_gales = signal.get("martingaleSteps", 1)

        # 1. Daily Risk Checks
        if self.daily_profit <= -abs(self.stop_loss):
            logger.warning(f"🛑 STOP LOSS HIT (${self.daily_profit:.2f} <= -${self.stop_loss:.2f}). Trading halted for today.")
            return {"success": False, "reason": "STOP_LOSS_REACHED"}
        
        if self.daily_profit >= abs(self.take_profit):
            logger.info(f"🎯 TAKE PROFIT TARGET REACHED (+${self.daily_profit:.2f}). Trading target completed!")
            return {"success": False, "reason": "TAKE_PROFIT_REACHED"}

        # 2. Payout Verification
        payout = self.get_payout(asset)
        if payout < self.min_payout:
            logger.warning(f"⚠️ Payout for {asset} ({payout}%) is below minimum threshold ({self.min_payout}%). Skipped.")
            return {"success": False, "reason": f"LOW_PAYOUT_{payout}%"}

        # 3. Primary Trade Execution
        current_stake = self.base_stake
        logger.info(f"🚀 [BASE TRADE] Placing {action.upper()} on {asset} | Stake: ${current_stake:.2f} | Expiry: {duration}m | Payout: {payout}%")
        
        trade_result = self._place_order(asset, action, current_stake, duration)
        
        # 4. Martingale Recovery Loop
        gale_step = 0
        while not trade_result.get("win") and gale_step < max_gales:
            gale_step += 1
            current_stake = round(current_stake * self.martingale_multiplier, 2)
            logger.warning(f"🔄 [MARTINGALE G{gale_step}] Base lost. Escalating stake to ${current_stake:.2f} on {asset} {action.upper()}...")
            
            # Short sleep before candle open if needed
            time.sleep(1.0)
            trade_result = self._place_order(asset, action, current_stake, duration)

        # Update Daily Ledger
        net_change = trade_result.get("profit", 0.0)
        self.daily_profit += net_change
        logger.info(f"📊 Trade Cycle Ended | Outcome: {'WIN 🟢' if trade_result.get('win') else 'LOSS 🔴'} | Net: ${net_change:+.2f} | Daily Balance P/L: ${self.daily_profit:+.2f}")

        return {
            "success": True,
            "asset": asset,
            "action": action.upper(),
            "finalGale": gale_step,
            "win": trade_result.get("win", False),
            "profit": trade_result.get("profit", 0.0),
            "dailyProfitTotal": self.daily_profit
        }

    def place_single_order(self, asset: str, action: str, stake: float, duration: int) -> Dict[str, Any]:
        """
        Places exactly ONE order without automatic Martingale escalation.
        Complies strictly with Rule 8, 12, 14, 15, 16.
        """
        asset_clean = asset.upper().replace(" ", "").replace("/", "").replace("_", "")
        # Preserve -OTC if present
        if "OTC" in asset.upper() and not asset_clean.endswith("-OTC"):
            asset_clean = asset_clean.replace("OTC", "") + "-OTC"
        
        act = action.lower()
        if act in ["call", "buy", "up", "higher"]:
            act = "call"
        elif act in ["put", "sell", "down", "lower"]:
            act = "put"
        else:
            act = "call"

        # Check payout if possible
        payout = self.get_payout(asset_clean)

        logger.info(f"⚡ [EXECUTE SINGLE ORDER] {act.upper()} {asset_clean} | Stake: ${stake:.2f} | Duration: {duration}m | Payout: {payout}%")

        if self.api and self.connected:
            try:
                check, order_id = self.api.buy(stake, asset_clean, act, duration)
                if check and order_id:
                    logger.info(f"✅ Order placed successfully on IQ Option! Order ID: {order_id}")
                    return {
                        "success": True,
                        "order_id": str(order_id),
                        "asset": asset_clean,
                        "action": act.upper(),
                        "stake": stake,
                        "duration": duration,
                        "payout": payout,
                        "simulated": False
                    }
                else:
                    logger.error(f"❌ Order placement rejected by IQ Option broker: {order_id}")
                    return {
                        "success": False,
                        "error": str(order_id) or "Order rejected by broker",
                        "order_id": None,
                        "simulated": False
                    }
            except Exception as e:
                logger.error(f"❌ Exception executing order on IQ Option: {str(e)}")
                return {"success": False, "error": str(e), "simulated": False}
        else:
            # Simulated order for offline / testing mode
            sim_id = f"SIM_{int(time.time() * 1000)}"
            logger.info(f"ℹ️ [SIMULATED EXECUTION] IQ Option Broker bridge executed single trade: Order #{sim_id}")
            return {
                "success": True,
                "order_id": sim_id,
                "asset": asset_clean,
                "action": act.upper(),
                "stake": stake,
                "duration": duration,
                "payout": payout,
                "simulated": True
            }

    def check_order_status(self, order_id: str, stake: float) -> Dict[str, Any]:
        """
        Polls IQ Option for final trade settlement result (WIN / LOSS / DRAW).
        """
        if not order_id:
            return {"settled": False, "result": "UNKNOWN", "profit": 0.0}

        if str(order_id).startswith("SIM_"):
            import random
            win = random.random() < 0.68
            profit = round(stake * 0.87, 2) if win else -stake
            return {
                "settled": True,
                "result": "WIN" if win else "LOSS",
                "profit": profit,
                "simulated": True
            }

        if self.api and self.connected:
            try:
                # check_win_v3 returns profit amount if win, negative/0 if lost
                res = self.api.check_win_v3(int(order_id))
                if res is not None and res != "":
                    profit = float(res)
                    if profit > 0:
                        return {"settled": True, "result": "WIN", "profit": profit}
                    elif profit < 0:
                        return {"settled": True, "result": "LOSS", "profit": profit}
                    else:
                        return {"settled": True, "result": "DRAW", "profit": 0.0}
            except Exception as e:
                logger.error(f"Error checking order status #{order_id}: {e}")
        
        return {"settled": False, "result": "PENDING", "profit": 0.0}

    def _place_order(self, asset: str, action: str, stake: float, duration: int) -> Dict[str, Any]:
        """Internal order dispatcher to IQ Option socket."""
        try:
            if self.api:
                # Dispatch order using iqoptionapi buy() or buy_digital_spot()
                check, order_id = self.api.buy(stake, asset, action, duration)
                if not check:
                    logger.error(f"Order rejected by broker: {order_id}")
                    return {"win": False, "profit": -stake, "order_id": None}
                
                logger.info(f"Order #{order_id} active. Waiting {duration}m for settlement...")
                # Poll result (check_win_v3)
                result = self.api.check_win_v3(order_id)
                win = result > 0
                profit = result if win else -stake
                return {"win": win, "profit": profit, "order_id": order_id}
            else:
                # Simulated realistic outcome for testing
                import random
                win = random.random() < 0.65  # 65% win probability
                profit = round(stake * 0.87, 2) if win else -stake
                return {"win": win, "profit": profit, "order_id": f"SIM_{int(time.time())}"}
        except Exception as e:
            logger.error(f"Execution exception: {str(e)}")
            return {"win": False, "profit": -stake, "error": str(e)}

if __name__ == "__main__":
    if len(sys.argv) > 1:
        command = sys.argv[1]
        
        if command == "test_connection" and len(sys.argv) > 2:
            try:
                data = json.loads(sys.argv[2])
                email = data.get("email", "")
                password = data.get("password", "")
                account_mode = data.get("accountMode", "PRACTICE")
                two_factor_code = data.get("twoFactorCode")
                
                trader = IQOptionTrader(email, password, account_mode)
                success, reason = trader.connect()

                if not success and trader.api and trader.api.two_factor_token and two_factor_code:
                    # User supplied 2FA code
                    success, reason = trader.api.connect_2fa(two_factor_code)
                
                if success:
                    practice_bal = trader.api.balances.get("PRACTICE", 10000.0) if trader.api else 10000.0
                    real_bal = trader.api.balances.get("REAL", 0.0) if trader.api else 0.0
                    current_bal = real_bal if account_mode == "REAL" else practice_bal
                    currency = trader.api.get_currency() if trader.api else "USD"
                    
                    print(json.dumps({
                        "success": True,
                        "version": "6.8.9.1",
                        "library": "IQ_Option / stable_api",
                        "accountMode": account_mode,
                        "balance": current_bal,
                        "practiceBalance": practice_bal,
                        "realBalance": real_bal,
                        "currency": currency,
                        "user_id": trader.api.user_id if trader.api else None,
                        "payoutRate": 87,
                        "message": f"Successfully authenticated with IQ Option ({account_mode} Balance: {current_bal:.2f} {currency})"
                    }))
                else:
                    requires_2fa = bool(reason and "2FA_REQUIRED" in reason)
                    token = reason.split(":")[1] if requires_2fa and ":" in reason else None
                    print(json.dumps({
                        "success": False,
                        "requires2FA": requires_2fa,
                        "twoFactorToken": token,
                        "error": reason or "Failed to authenticate with IQ Option broker.",
                        "accountMode": account_mode
                    }))
                sys.exit(0)
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e)}))
                sys.exit(1)

        elif command == "execute_signal" and len(sys.argv) > 2:
            try:
                data = json.loads(sys.argv[2])
                email = data.get("email", "")
                password = data.get("password", "")
                account_mode = data.get("accountMode", "PRACTICE")
                signal = data.get("signal", {})
                
                trader = IQOptionTrader(email, password, account_mode)
                trader.base_stake = float(data.get("baseStake", 10.0))
                trader.min_payout = float(data.get("minPayout", 80.0))
                trader.martingale_multiplier = float(data.get("martingaleMultiplier", 2.2))
                trader.connect()
                
                result = trader.execute_signal(signal)
                print(json.dumps(result))
                sys.exit(0)
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e)}))
                sys.exit(1)

        elif command == "place_single_order" and len(sys.argv) > 2:
            try:
                data = json.loads(sys.argv[2])
                email = data.get("email", "")
                password = data.get("password", "")
                account_mode = data.get("accountMode", "PRACTICE")
                asset = data.get("asset", "EURUSD")
                action = data.get("action", "CALL")
                stake = float(data.get("stake", 10.0))
                duration = int(data.get("duration", 1))

                trader = IQOptionTrader(email, password, account_mode)
                if email and password and password != "password":
                    trader.connect()

                result = trader.place_single_order(asset, action, stake, duration)
                print(json.dumps(result))
                sys.exit(0)
            except Exception as e:
                print(json.dumps({"success": False, "error": str(e)}))
                sys.exit(1)

        elif command == "check_order_status" and len(sys.argv) > 2:
            try:
                data = json.loads(sys.argv[2])
                email = data.get("email", "")
                password = data.get("password", "")
                account_mode = data.get("accountMode", "PRACTICE")
                order_id = str(data.get("orderId", ""))
                stake = float(data.get("stake", 10.0))

                trader = IQOptionTrader(email, password, account_mode)
                if email and password and password != "password" and not order_id.startswith("SIM_"):
                    trader.connect()

                result = trader.check_order_status(order_id, stake)
                print(json.dumps(result))
                sys.exit(0)
            except Exception as e:
                print(json.dumps({"settled": False, "error": str(e)}))
                sys.exit(1)

    # Default standalone demo run
    trader = IQOptionTrader("trader@example.com", "secure_password", "PRACTICE")
    trader.connect()
    
    mock_signal = {
        "asset": "EURUSD",
        "action": "CALL",
        "timeframe": 5,
        "martingaleSteps": 2
    }
    result = trader.execute_signal(mock_signal)
    print("Execution Result:", json.dumps(result, indent=2))
