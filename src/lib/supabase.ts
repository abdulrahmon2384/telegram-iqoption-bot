import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { BotSettings, IQOptionConfig, TelegramConfig, TelegramUser, TelegramChannel } from "../types";

// Retrieve Supabase URL & Anon Key strictly from Vite environment variables (.env)
export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  const envUrl = (import.meta as any).env?.VITE_SUPABASE_URL || "";
  const envKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

  return {
    url: envUrl.trim(),
    anonKey: envKey.trim(),
    isConfigured: Boolean(envUrl && envKey),
  };
}

let supabaseInstance: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  if (!isConfigured) {
    return null;
  }
  if (!supabaseInstance) {
    try {
      supabaseInstance = createClient(url, anonKey);
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
      return null;
    }
  }
  return supabaseInstance;
}

// 1. Fetch Complete Stored App Configuration directly from Supabase
export async function loadAppConfigFromSupabase() {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return null;
  }

  try {
    // 1. Load bot settings & broker credentials
    const { data: settingsData, error: settingsError } = await supabase
      .from("bot_settings")
      .select("*")
      .eq("id", "main_config")
      .maybeSingle();

    if (settingsError && settingsError.code !== "PGRST116" && settingsError.code !== "PGRST205" && !settingsError.message?.includes("schema cache")) {
      console.warn("Supabase load settings note:", settingsError.message);
    }

    // 2. Load latest active Telegram auth session
    const { data: telegramData, error: telegramError } = await supabase
      .from("telegram_auth")
      .select("*")
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 3. Load monitored channels
    const { data: channelsData } = await supabase
      .from("monitored_channels")
      .select("*")
      .order("created_at", { ascending: false });

    return {
      settings: settingsData || null,
      telegramAuth: telegramData || null,
      channels: channelsData || [],
    };
  } catch (err) {
    console.error("Error reading config from Supabase:", err);
    return null;
  }
}

// 2. Save / Sync Complete Configuration directly to Supabase
export async function saveAppConfigToSupabase(params: {
  settings?: Partial<BotSettings>;
  iqOption?: Partial<IQOptionConfig>;
  telegram?: Partial<TelegramConfig>;
  selectedChannels?: string[];
}) {
  const supabase = getSupabaseClient();
  if (!supabase) {
    return { success: false, reason: "SUPABASE_NOT_CONFIGURED" };
  }

  try {
    const payload: any = {
      id: "main_config",
      updated_at: new Date().toISOString(),
    };

    if (params.settings) {
      if (params.settings.isEnabled !== undefined) payload.bot_enabled = params.settings.isEnabled;
      if (params.settings.accountMode !== undefined) payload.account_mode = params.settings.accountMode;
      if (params.settings.baseStake !== undefined) payload.base_stake = params.settings.baseStake;
      if (params.settings.minPayout !== undefined) payload.min_payout = params.settings.minPayout;
      if (params.settings.martingaleMultiplier !== undefined) payload.martingale_multiplier = params.settings.martingaleMultiplier;
      if (params.settings.maxGaleSteps !== undefined) payload.max_gale_steps = params.settings.maxGaleSteps;
      if (params.settings.dailyStopLoss !== undefined) payload.daily_stop_loss = params.settings.dailyStopLoss;
      if (params.settings.dailyTakeProfit !== undefined) payload.daily_take_profit = params.settings.dailyTakeProfit;
    }

    if (params.iqOption) {
      if (params.iqOption.email !== undefined) payload.iq_email = params.iqOption.email;
      if (params.iqOption.password !== undefined) payload.iq_password = params.iqOption.password;
      if (params.iqOption.accountMode !== undefined) payload.iq_account_mode = params.iqOption.accountMode;
      if (params.iqOption.isConnected !== undefined) payload.iq_connected = params.iqOption.isConnected;
    }

    if (params.telegram) {
      if (params.telegram.apiId !== undefined) payload.telegram_api_id = params.telegram.apiId;
      if (params.telegram.apiHash !== undefined) payload.telegram_api_hash = params.telegram.apiHash;
      if (params.telegram.phone !== undefined) payload.telegram_phone = params.telegram.phone;
    }

    if (params.selectedChannels) {
      payload.selected_channels = params.selectedChannels;
    }

    const { error } = await supabase.from("bot_settings").upsert(payload, { onConflict: "id" });
    if (error) throw error;

    return { success: true };
  } catch (err: any) {
    console.error("Failed to save config to Supabase:", err);
    return { success: false, error: err.message };
  }
}

// 3. Save Telegram Session to Supabase
export async function saveTelegramAuthToSupabase(
  user: TelegramUser,
  sessionString: string,
  apiId: string,
  apiHash: string
) {
  const supabase = getSupabaseClient();
  if (!supabase) return { success: false, reason: "SUPABASE_NOT_CONFIGURED" };

  try {
    const { error } = await supabase.from("telegram_auth").upsert(
      {
        user_id: user.id,
        phone: user.phone,
        username: user.username || null,
        first_name: user.firstName,
        session_string: sessionString,
        api_id: String(apiId),
        api_hash: apiHash,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error("Failed to save Telegram session to Supabase:", err);
    return { success: false, error: err.message };
  }
}
