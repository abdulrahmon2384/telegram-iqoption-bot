-- Supabase Schema for Telegram -> IQ Option SignalBot
-- Copy and paste this into your Supabase SQL Editor and click "Run"

-- 1. Telegram Auth Session Table (Stores persistent StringSession so you never have to re-login)
CREATE TABLE IF NOT EXISTS telegram_auth (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT UNIQUE NOT NULL,
    phone TEXT NOT NULL,
    username TEXT,
    first_name TEXT,
    session_string TEXT NOT NULL,
    api_id TEXT NOT NULL,
    api_hash TEXT NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Monitored VIP Telegram Channels Table
CREATE TABLE IF NOT EXISTS monitored_channels (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    channel_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    username TEXT,
    is_channel BOOLEAN DEFAULT TRUE,
    is_group BOOLEAN DEFAULT FALSE,
    is_monitored BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Received Trading Signals Table
CREATE TABLE IF NOT EXISTS trading_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_channel TEXT NOT NULL,
    raw_message TEXT NOT NULL,
    asset TEXT NOT NULL,
    action TEXT NOT NULL,
    timeframe TEXT NOT NULL,
    martingale_steps INT DEFAULT 1,
    status TEXT DEFAULT 'PENDING', -- PENDING, EXECUTED, SKIPPED, FAILED
    received_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Trade Execution Ledger Table (Broker outcomes & P/L)
CREATE TABLE IF NOT EXISTS trade_executions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    signal_id UUID REFERENCES trading_signals(id) ON DELETE SET NULL,
    asset TEXT NOT NULL,
    action TEXT NOT NULL,
    stake NUMERIC NOT NULL,
    payout NUMERIC DEFAULT 87.0,
    gale_level INT DEFAULT 0,
    outcome TEXT, -- WIN, LOSS, PENDING
    profit_loss NUMERIC DEFAULT 0.0,
    account_mode TEXT DEFAULT 'PRACTICE', -- PRACTICE or REAL
    executed_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Bot Settings & Integrations Table (Persists IQ Option, Telegram, and Risk Configuration)
CREATE TABLE IF NOT EXISTS bot_settings (
    id TEXT PRIMARY KEY DEFAULT 'main_config',
    bot_enabled BOOLEAN DEFAULT FALSE,
    account_mode TEXT DEFAULT 'PRACTICE',
    base_stake NUMERIC DEFAULT 10.0,
    min_payout NUMERIC DEFAULT 80.0,
    martingale_multiplier NUMERIC DEFAULT 2.2,
    max_gale_steps INT DEFAULT 1,
    daily_stop_loss NUMERIC DEFAULT 100.0,
    daily_take_profit NUMERIC DEFAULT 200.0,
    iq_email TEXT DEFAULT '',
    iq_password TEXT DEFAULT '',
    iq_account_mode TEXT DEFAULT 'PRACTICE',
    iq_connected BOOLEAN DEFAULT FALSE,
    telegram_api_id TEXT DEFAULT '',
    telegram_api_hash TEXT DEFAULT '',
    telegram_phone TEXT DEFAULT '',
    telegram_session TEXT DEFAULT '',
    telegram_user JSONB DEFAULT '{}'::jsonb,
    telegram_connected BOOLEAN DEFAULT FALSE,
    selected_channels JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS) & Public read/write policy for simple setups
ALTER TABLE telegram_auth ENABLE ROW LEVEL SECURITY;
ALTER TABLE monitored_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE trading_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public all access" ON telegram_auth FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON monitored_channels FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON trading_signals FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON trade_executions FOR ALL USING (true);
CREATE POLICY "Allow public all access" ON bot_settings FOR ALL USING (true);
