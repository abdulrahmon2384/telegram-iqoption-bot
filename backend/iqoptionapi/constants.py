"""
Constants for IQ Option API v6.8.9.1
"""

# ACTIVES PAIR IDS
ACTIVES = {
    "EURUSD": 1,
    "EURGBP": 2,
    "GBPJPY": 3,
    "EURJPY": 4,
    "GBPUSD": 5,
    "USDJPY": 6,
    "AUDCAD": 7,
    "NZDUSD": 8,
    "USDCHF": 9,
    "USDCAD": 10,
    "AUDUSD": 99,
    "EURUSD-OTC": 76,
    "GBPUSD-OTC": 77,
    "EURJPY-OTC": 78,
    "AUDCAD-OTC": 79,
    "USDCHF-OTC": 80,
    "USDCAD-OTC": 81,
    "BTCUSD": 816,
    "ETHUSD": 818,
}

# EXPIRATION TIMEFRAMES (in seconds)
TIMEFRAMES = {
    "M1": 60,
    "M2": 120,
    "M5": 300,
    "M15": 900,
    "M30": 1800,
    "H1": 3600,
}

# ACCOUNT MODES
ACCOUNT_MODES = {
    "PRACTICE": 4,
    "REAL": 1,
}
