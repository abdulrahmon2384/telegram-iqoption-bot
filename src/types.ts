export interface TelegramUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  phone: string;
}

export interface TelegramChannel {
  id: string;
  title: string;
  username?: string;
  isChannel: boolean;
  isGroup: boolean;
  isMonitored?: boolean;
}

export interface AutoTradeSession {
  isActive: boolean;
  startTime: number; // Unix timestamp in ms
  durationHours: number; // in hours (e.g. 1, 2, 3, 0.5, etc.)
  endTime: number; // Unix timestamp in ms
  remainingSeconds: number;
  status: "RUNNING" | "STOPPED" | "COMPLETED" | "RECOVERED";
  label: string;
}

export interface MonitoredMessage {
  id: string;
  telegramMsgId?: string;
  epochMs?: number;
  channelId: string;
  channelTitle: string;
  timestamp: string;
  rawText: string;
  isSignal: boolean;
  isBackfill?: boolean;
  matchedKeywords: string[];
  parsedSignal?: ParsedSignal;
  tradeRecord?: TradeRecord;
  status: "IDENTIFIED" | "NON_SIGNAL" | string;
}

export interface MartingaleLevelInfo {
  level: number;
  time?: string;
}

export interface ParsedSignal {
  id?: string;
  raw?: string;
  rawText?: string;
  asset: string;
  action: "CALL" | "PUT" | "";
  timeframe: string;
  durationMinutes: number;
  entryType?: "NOW" | "SCHEDULED";
  scheduledTime?: string;
  gale?: number;
  martingaleSteps?: number;
  martingaleLevels?: MartingaleLevelInfo[];
  confidence: number;
  notes?: string[];
  timestamp?: string;
  matchedKeywords?: string[];
}

export interface ManagementLevelRule {
  enabled: boolean;
  entryDelaySeconds: number; // 0 = at expiration, >0 = offset in seconds
  stakeMode: "MULTIPLIER" | "FIXED";
  stakeMultiplier: number; // e.g. 2.0x, 2.2x
  customStake: number; // e.g. $220 fixed
  direction: "SAME" | "REVERSE" | "CALL" | "PUT";
  durationMinutes: number; // Timer in minutes (e.g. 1m, 2m, 5m)
  maxAllowedDelayMs: number; // Maximum allowed delay tolerance in ms (e.g. 3000ms, 4000ms)
}

export interface BotSettings {
  isEnabled: boolean;
  accountMode: "PRACTICE" | "REAL";
  baseStake: number;
  minPayout: number;
  martingaleMultiplier: number;
  maxGaleSteps: number; // 1 (Level 1 Entry Only), 2 (Up to Level 2 Checkpoint), 3 (Up to Level 3 Full Close)
  checkpointLeadSeconds?: number; // Pre-close precision lead time in seconds before checkpoint minute (default 3s)
  dailyStopLoss: number;
  dailyTakeProfit: number;
  timeZone?: string; // Unified Project & Broker Timezone (e.g. Africa/Lagos, America/Sao_Paulo, Europe/London, UTC+1, etc.)
  listenToAllChannels?: boolean; // When true, simultaneously listens to ALL joined Telegram channels and groups
  ignoreTelegramMartingale?: boolean; // Rule 6: Ignore signal MG tags, use Bot Level 1/2/3 rules
  waitForActualResult?: boolean; // Rule 7: Wait for confirmed IQ settlement before next level
  managementLevels?: {
    level1: ManagementLevelRule;
    level2: ManagementLevelRule;
    level3: ManagementLevelRule;
  };
}

export type TradeState =
  | "SIGNAL_RECEIVED"
  | "VALIDATING"
  | "SCHEDULED"
  | "PREPARING"
  | "WAITING_FOR_ENTRY"
  | "PRE_TRADE_CHECK"
  | "EXECUTING"
  | "OPEN"
  | "EXPIRED"
  | "WIN"
  | "LOSS"
  | "DRAW"
  | "SKIPPED"
  | "FAILED"
  | "CANCELLED";

export interface TradeLogEntry {
  timestamp: string;
  message: string;
  type: "info" | "success" | "warn" | "error";
}

export interface TradeRecord {
  id: string;
  signalId: string;
  parentTradeId?: string;
  managementLevel: number; // 1 for Level 1 (Signal Entry), 2 for Level 2, 3 for Level 3
  deterministicKey: string;
  sourceChannel: string;
  rawSignalText: string;
  asset: string;
  rawAsset: string;
  action: "CALL" | "PUT";
  durationMinutes: number;
  timeframe: string;
  signalDate: string;
  telegramSentTime: string;
  telegramSentEpochMs: number;
  scheduledEntryTime: string;
  scheduledEntryEpochMs: number;
  actualExecutionTime?: string;
  actualExecutionEpochMs?: number;
  executionDelayMs?: number;
  expectedExpirationTime?: string;
  expectedExpirationEpochMs?: number;
  actualSettlementTime?: string;
  accountMode: "PRACTICE" | "REAL";
  stake: number;
  orderId?: string;
  isSimulated?: boolean;
  payoutRate?: number;
  profit?: number;
  openPrice?: number;
  closePrice?: number;
  level1Time?: string;
  level1EpochMs?: number;
  level2Time?: string;
  level2EpochMs?: number;
  level3Time?: string;
  level3EpochMs?: number;
  earlyClosedAt?: "LEVEL_1" | "LEVEL_2" | "EXPIRATION";
  state: TradeState;
  skipReason?: string;
  failReason?: string;
  outcome?: "WIN" | "LOSS" | "DRAW" | "PENDING" | "SKIPPED" | "FAILED";
  nextLevelTriggered?: boolean;
  childTradeId?: string;
  logs: TradeLogEntry[];
  createdAt: number;
  updatedAt: number;
}

export interface SignalLog {
  id: string;
  timestamp: string;
  sourceChannel: string;
  rawText: string;
  parsed: ParsedSignal;
  status: "IDENTIFIED" | "PENDING" | "EXECUTED" | "SKIPPED" | "FAILED";
  outcome?: "WIN" | "LOSS" | "GALE_WIN" | "PENDING";
  profit?: number;
  stake: number;
  accountMode: "PRACTICE" | "REAL";
  tradeRecord?: TradeRecord;
}

export type AccountType = "PRACTICE" | "REAL";
export type Timeframe = "M1" | "M2" | "M5" | "M15" | "M30" | "H1";

export interface BotConfig {
  accountType: AccountType;
  baseStake: number;
  minPayout: number;
  martingaleMultiplier: number;
  maxGaleSteps: number;
  dailyStopLoss: number;
  dailyTakeProfit: number;
  autoTradeEnabled: boolean;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  message: string;
  type: "info" | "success" | "warning" | "error" | "trade";
  metadata?: any;
}

export interface TelegramConfig {
  apiId: string;
  apiHash: string;
  phone: string;
  sessionString?: string;
  isConnected?: boolean;
  reActivationRequired?: boolean;
  reActivationReason?: string;
}

export interface IQOptionConfig {
  email: string;
  password?: string;
  accountMode: "PRACTICE" | "REAL";
  isConnected?: boolean;
  requires2FA?: boolean;
  twoFactorToken?: string;
  balance?: number;
  practiceBalance?: number;
  realBalance?: number;
  bonusBalance?: number;
  currency?: string;
}

export interface DatabaseSyncStatus {
  isConfigured: boolean;
  url?: string;
  lastSyncedAt?: string;
  tablesVerified: boolean;
  telegramSessionSynced: boolean;
  iqCredentialsSynced: boolean;
  settingsSynced: boolean;
}

export interface AppDatabaseConfig {
  telegram: TelegramConfig;
  iqOption: IQOptionConfig;
  settings: BotSettings;
  selectedChannels: string[];
}
