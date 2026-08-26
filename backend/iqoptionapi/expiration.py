"""
Expiration calculation utilities for IQ Option v6.8.9.1
Calculates exact next-candle expiry timestamps for Turbo (1-5 min) and Binary (15+ min) options.
"""

import time
import math
from datetime import datetime, timezone

def get_expiration_time(duration_minutes: int, current_timestamp: float = None) -> int:
    """
    Calculates future expiration timestamp rounded to IQ Option's candle boundary.
    Turbo options (1-5 minutes): rounds to 60-second boundaries.
    """
    if current_timestamp is None:
        current_timestamp = time.time()

    now = int(current_timestamp)
    # Remaining seconds in the current minute
    remaining = 60 - (now % 60)
    
    # If less than 30 seconds remain, broker rolls to next minute + duration
    if remaining < 30:
        base_exp = now + remaining + (duration_minutes * 60)
    else:
        base_exp = now + remaining + ((duration_minutes - 1) * 60)

    return int(base_exp)

def get_candle_close_time(timeframe_minutes: int) -> int:
    now = int(time.time())
    tf_seconds = timeframe_minutes * 60
    return now + (tf_seconds - (now % tf_seconds))
