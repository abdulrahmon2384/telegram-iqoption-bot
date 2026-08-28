/**
 * Native High-Performance IQ Option WebSocket Client (TypeScript)
 * Direct Connection to IQ Option Live Servers:
 *  - Authentication: https://auth.iqoption.com/api/v2/login
 *  - Real-Time Trading WebSocket: wss://iqoption.com/echo/websocket
 *  - Direct Binary & Turbo Options Order Execution: binary-options.open-option
 *  - Real Balance Sync, Payout Discovery, and Live Settlement Tracking
 */

import WebSocket from "ws";
import { formatTimeInTz, getActiveTimezone } from "./timezone_helper";

export interface IQBalances {
  PRACTICE: number;
  REAL: number;
  bonus?: number;
  totalReal?: number;
  practiceBalanceId?: number;
  realBalanceId?: number;
  bonusBalanceId?: number;
  currency: string;
}

export interface IQUserProfile {
  id: number;
  email: string;
  name: string;
  currency: string;
  balances: IQBalances;
  activeAccountMode: "PRACTICE" | "REAL";
  activeBalanceId: number;
}

export interface IQOrderPlacementResult {
  success: boolean;
  orderId?: string | number;
  asset: string;
  action: "CALL" | "PUT";
  stake: number;
  duration: number;
  expirationEpochSec?: number;
  payout?: number;
  openPrice?: number;
  error?: string;
  isSimulated?: boolean;
}

export interface IQOrderSettlementResult {
  settled: boolean;
  orderId: string | number;
  outcome: "WIN" | "LOSS" | "DRAW" | "PENDING";
  profit: number;
  closePrice?: number;
  openPrice?: number;
  error?: string;
  rawBrokerResponse?: any;
}

// Helper to detect broker error indicating asset is closed or unavailable
export function isAssetUnavailableError(errMsg?: string): boolean {
  if (!errMsg) return false;
  const lower = errMsg.toLowerCase();
  return (
    lower.includes("not available") ||
    lower.includes("asset is not available") ||
    lower.includes("cannot purchase") ||
    lower.includes("active is closed") ||
    lower.includes("asset is closed") ||
    lower.includes("market is closed") ||
    lower.includes("suspended") ||
    lower.includes("asset_not_found") ||
    lower.includes("time is not valid") ||
    lower.includes("instrument is disabled")
  );
}

// Helper to detect broker error indicating insufficient balance or low funds on broker side
export function isInsufficientBalanceError(errMsg?: string): boolean {
  if (!errMsg) return false;
  const lower = errMsg.toLowerCase();
  return (
    lower.includes("not enough balance") ||
    lower.includes("not_enough_balance") ||
    lower.includes("insufficient_balance") ||
    lower.includes("insufficient balance") ||
    lower.includes("not enough money") ||
    lower.includes("not enough funds") ||
    lower.includes("not_enough_funds") ||
    lower.includes("balance_is_not_enough") ||
    lower.includes("balance_not_enough") ||
    lower.includes("low balance") ||
    lower.includes("low_balance") ||
    lower.includes("balance is zero") ||
    lower.includes("not have enough funds") ||
    lower.includes("not have enough balance") ||
    lower.includes("funds_insufficient") ||
    lower.includes("balance is not enough")
  );
}

// Complete IQ Option Asset ID Mapping (Standard + 24/7 OTC Pairs + Cryptos + Commodities)
export const ASSET_ID_MAP: Record<string, number> = {
  // Standard Currency Pairs
  "EURUSD": 1,
  "EURGBP": 2,
  "GBPUSD": 3,
  "USDJPY": 4,
  "AUDCAD": 5,
  "NZDUSD": 6,
  "USDCHF": 7,
  "EURJPY": 8,
  "GBPJPY": 9,
  "USDNOK": 10,
  "USDCAD": 11,
  "AUDUSD": 12,
  "EURCAD": 13,
  "CADJPY": 14,
  "GBPCAD": 15,
  "AUDJPY": 99,
  "GBPAUD": 100,
  "EURNZD": 101,
  "CADCHF": 102,
  "AUDNZD": 103,
  "GBPNZD": 104,
  "CHFJPY": 105,
  "EURCHF": 106,
  "NZDJPY": 107,
  "AUDCHF": 109,
  "NZDCAD": 948,
  "NZDCHF": 950,
  "USDSEK": 212,
  "USDSGD": 213,
  "USDHKD": 214,
  "USDBRL": 215,
  "USDMXN": 216,
  "USDINR": 217,
  "USDZAR": 218,
  "USDTRY": 219,
  "USDRUB": 220,

  // 24/7 OTC Currency Pairs (Weekends & Always-On OTC Markets)
  "EURUSD-OTC": 76,
  "EURGBP-OTC": 77,
  "GBPUSD-OTC": 78,
  "USDCHF-OTC": 79,
  "NZDUSD-OTC": 80,
  "EURJPY-OTC": 81,
  "GBPJPY-OTC": 84,
  "USDJPY-OTC": 85,
  "AUDCAD-OTC": 86,
  "AUDNZD-OTC": 87,
  "AUDUSD-OTC": 99,
  "AUDCHF-OTC": 89,
  "GBPAUD-OTC": 90,
  "GBPCAD-OTC": 91,
  "GBPNZD-OTC": 92,
  "GBPCHF-OTC": 93,
  "EURAUD-OTC": 94,
  "EURCAD-OTC": 95,
  "EURNZD-OTC": 96,
  "CHFJPY-OTC": 97,
  "EURCHF-OTC": 98,
  "USDCAD-OTC": 100,
  "AUDJPY-OTC": 101,
  "CADCHF-OTC": 102,
  "CADJPY-OTC": 103,
  "NZDJPY-OTC": 108,
  "NZDCAD-OTC": 949,
  "NZDCHF-OTC": 951,
  "USDNOK-OTC": 85,
  "USDSEK-OTC": 116,
  "USDSGD-OTC": 118,
  "USDHKD-OTC": 120,
  "USDBRL-OTC": 122,
  "USDMXN-OTC": 124,
  "USDINR-OTC": 126,
  "USDZAR-OTC": 128,
  "USDTRY-OTC": 130,
  "USDRUB-OTC": 132,

  // Cryptos & Commodities
  "BTCUSD": 816,
  "BTCUSD-OTC": 817,
  "ETHUSD": 818,
  "ETHUSD-OTC": 819,
  "LTCUSD": 820,
  "LTCUSD-OTC": 821,
  "XRPUSD": 822,
  "XRPUSD-OTC": 823,
  "GOLD": 74,
  "GOLD-OTC": 75,
  "SILVER": 72,
  "SILVER-OTC": 73,
};

export class IQOptionClient {
  private email: string = "";
  private password: string = "";
  private ssid: string | null = null;
  private ws: WebSocket | null = null;
  private isConnecting: boolean = false;
  private isConnected: boolean = false;
  private accountMode: "PRACTICE" | "REAL" = "PRACTICE";

  private userProfile: IQUserProfile | null = null;
  private requestCallbacks = new Map<string, { resolve: (val: any) => void; reject: (err: any) => void; timer: NodeJS.Timeout }>();
  private orderSettlementListeners = new Map<string, (settlement: IQOrderSettlementResult) => void>();
  private orderSettlementCache = new Map<string, IQOrderSettlementResult>();

  private dynamicActiveIds = new Map<string, number>();
  private livePayouts = new Map<string, number>();
  private latestAssetQuotes = new Map<number, number>();
  private reconnectAttempts = 0;
  private pingInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Populate dynamic active IDs from static map
    for (const [key, val] of Object.entries(ASSET_ID_MAP)) {
      this.dynamicActiveIds.set(key, val);
    }
  }

  public isClientConnected(): boolean {
    return this.isConnected;
  }

  public hasSession(): boolean {
    return Boolean(this.ssid);
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      connecting: this.isConnecting,
      accountMode: this.accountMode,
      email: this.email,
      user: this.userProfile ? {
        id: this.userProfile.id,
        name: this.userProfile.name,
        email: this.userProfile.email,
        currency: this.userProfile.currency,
      } : null,
      balances: this.userProfile ? this.userProfile.balances : {
        PRACTICE: 10000,
        REAL: 0,
        currency: "USD",
      },
      activeBalance: this.getActiveBalanceAmount(),
    };
  }

  public getActiveBalanceAmount(): number {
    if (!this.userProfile) return this.accountMode === "REAL" ? 0 : 10000;
    if (this.accountMode === "REAL") {
      const real = this.userProfile.balances.REAL || 0;
      const bonus = this.userProfile.balances.bonus || 0;
      return real > 0 ? real : (bonus > 0 ? bonus : real);
    }
    return this.userProfile.balances.PRACTICE;
  }

  /**
   * Deducts the risked stake from local/simulated account balance upon trade entry
   */
  public debitBalanceForOrder(stake: number, mode: "PRACTICE" | "REAL") {
    if (!this.userProfile) {
      this.userProfile = {
        id: 0,
        email: this.email || "demo@iqoption.com",
        name: "IQ Option Demo Trader",
        currency: "USD",
        balances: {
          PRACTICE: 10000,
          REAL: 0,
          currency: "USD",
        },
        activeAccountMode: mode,
        activeBalanceId: mode === "REAL" ? 1 : 4,
      };
    }
    if (mode === "REAL") {
      this.userProfile.balances.REAL = Math.max(0, Number(((this.userProfile.balances.REAL || 0) - stake).toFixed(2)));
      this.userProfile.balances.totalReal = (this.userProfile.balances.REAL || 0) + (this.userProfile.balances.bonus || 0);
    } else {
      this.userProfile.balances.PRACTICE = Math.max(0, Number(((this.userProfile.balances.PRACTICE || 10000) - stake).toFixed(2)));
    }
    console.log(`[Balance Deduct] Stake $${stake} debited for new trade. Active Balance: $${this.getActiveBalanceAmount().toFixed(2)}`);
  }

  /**
   * Credits the gross return (Risk Stake + Net Profit) to balance upon win, early sell, or draw
   */
  public creditBalanceForSettlement(grossReturn: number, mode: "PRACTICE" | "REAL") {
    if (!this.userProfile) {
      this.userProfile = {
        id: 0,
        email: this.email || "demo@iqoption.com",
        name: "IQ Option Demo Trader",
        currency: "USD",
        balances: {
          PRACTICE: 10000,
          REAL: 0,
          currency: "USD",
        },
        activeAccountMode: mode,
        activeBalanceId: mode === "REAL" ? 1 : 4,
      };
    }
    if (mode === "REAL") {
      this.userProfile.balances.REAL = Number(((this.userProfile.balances.REAL || 0) + grossReturn).toFixed(2));
      this.userProfile.balances.totalReal = (this.userProfile.balances.REAL || 0) + (this.userProfile.balances.bonus || 0);
    } else {
      this.userProfile.balances.PRACTICE = Number(((this.userProfile.balances.PRACTICE || 10000) + grossReturn).toFixed(2));
    }
    console.log(`[Balance Credit] Gross return $${grossReturn.toFixed(2)} credited on settlement. Active Balance: $${this.getActiveBalanceAmount().toFixed(2)}`);
  }

  public setAccountMode(mode: "PRACTICE" | "REAL") {
    this.accountMode = mode;
    if (this.userProfile) {
      this.userProfile.activeAccountMode = mode;
      const targetBalanceId = mode === "REAL"
        ? this.userProfile.balances.realBalanceId
        : this.userProfile.balances.practiceBalanceId;
      if (targetBalanceId) {
        this.userProfile.activeBalanceId = targetBalanceId;
        this.sendWebSocketMessage("sendMessage", {
          name: "change-balance",
          version: "2.0",
          body: { balance_id: targetBalanceId },
        }).catch(() => {});
      }
    }
  }

  /**
   * Step 1: Login via REST API to obtain authenticated SSID session token
   */
  public async login(
    email: string,
    password: string,
    accountMode: "PRACTICE" | "REAL" = "PRACTICE",
    twoFactorCode?: string
  ): Promise<{
    success: boolean;
    error?: string;
    requires2FA?: boolean;
    twoFactorToken?: string;
    profile?: IQUserProfile;
  }> {
    this.email = email.trim();
    this.password = password;
    this.accountMode = accountMode;

    if (!this.email || !this.password) {
      return { success: false, error: "Email and password are required to login to IQ Option." };
    }

    try {
      let authUrls = [
        "https://auth.iqoption.com/api/v2/login",
        "https://iqoption.com/api/v2/login",
      ];
      let payload: any = { identifier: this.email, password: this.password };

      if (twoFactorCode) {
        authUrls = [
          "https://auth.iqoption.com/api/v2/verify/2fa",
          "https://iqoption.com/api/v2/verify/2fa",
        ];
        payload = { token: twoFactorCode, code: twoFactorCode };
      }

      let lastError = "Unable to connect to IQ Option authentication service.";
      let ssid: string | null = null;
      let loginData: any = null;

      for (const authUrl of authUrls) {
        try {
          const res = await fetch(authUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
              "Origin": "https://iqoption.com",
              "Referer": "https://iqoption.com/en/login",
            },
            body: JSON.stringify(payload),
          });

          const data: any = await res.json().catch(() => null);
          loginData = data;

          if (data?.code === "verify") {
            const token = data?.data?.token || data?.token || "";
            const method = data?.data?.method || "app/sms";
            return {
              success: false,
              requires2FA: true,
              twoFactorToken: token,
              error: `IQ Option 2-Factor Authentication required (${method}). Enter code to complete login.`,
            };
          }

          if (data?.code === "invalid_credentials" || data?.message?.toLowerCase().includes("invalid") || data?.message?.toLowerCase().includes("password")) {
            return {
              success: false,
              error: "Invalid email or password. Please verify your IQ Option account credentials.",
            };
          }

          ssid = data?.ssid || data?.data?.ssid || data?.token || null;
          
          const cookieHeader = res.headers.get("set-cookie") || "";
          if (!ssid && cookieHeader.includes("ssid=")) {
            const match = cookieHeader.match(/ssid=([^;]+)/);
            if (match) ssid = match[1];
          }

          if (ssid) {
            break;
          } else if (data?.message || data?.code) {
            lastError = data.message || data.code;
          }
        } catch (err: any) {
          lastError = err.message || String(err);
        }
      }

      if (!ssid) {
        return {
          success: false,
          error: lastError || "Failed to authenticate with IQ Option. Please check your credentials.",
        };
      }

      this.ssid = ssid;

      // Step 1.5: Fetch Real User Profile and Balances from IQ Option REST API
      await this.fetchProfileAndBalancesRest();

      // Step 2: Establish real WebSocket connection with IQ Option
      const wsConnected = await this.connectWebSocket();
      if (!wsConnected && !this.userProfile) {
        return {
          success: false,
          error: "Authenticated with IQ Option HTTP, but WebSocket connection handshake timed out.",
        };
      }

      // Sync active balance mode
      if (this.userProfile) {
        await this.syncActiveBalanceWithBroker();
      }

      return {
        success: true,
        profile: this.userProfile || undefined,
      };
    } catch (e: any) {
      return { success: false, error: e.message || String(e) };
    }
  }

  /**
   * Fetches Real Profile and Balances directly from IQ Option HTTP API using SSID Cookie
   */
  public async fetchProfileAndBalancesRest(): Promise<boolean> {
    if (!this.ssid) return false;

    const urls = [
      "https://iqoption.com/api/getprofile",
      "https://iqoption.com/api/v1/balances",
      "https://iqoption.com/api/v2/balances",
      "https://iqoption.com/api/profile",
      "https://auth.iqoption.com/api/v1.0/getuser",
    ];

    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Cookie": `ssid=${this.ssid}`,
      "Accept": "application/json",
    };

    for (const url of urls) {
      try {
        const resp = await fetch(url, { headers });
        if (!resp.ok) continue;
        const json: any = await resp.json().catch(() => null);
        if (!json) continue;

        const res = json.result || json.data || json;
        if (res && (typeof res === "object" || Array.isArray(res))) {
          let practiceBal = this.userProfile?.balances?.PRACTICE ?? 10000.0;
          let realBal = this.userProfile?.balances?.REAL ?? 0.0;
          let bonusBal = this.userProfile?.balances?.bonus ?? 0.0;
          let practiceBalanceId = this.userProfile?.balances?.practiceBalanceId;
          let realBalanceId = this.userProfile?.balances?.realBalanceId;
          let bonusBalanceId = this.userProfile?.balances?.bonusBalanceId;
          let currency = res.currency || this.userProfile?.currency || "USD";
          let id = res.id || res.user_id || this.userProfile?.id || 0;
          let name = res.name || res.first_name || (res.email ? res.email.split("@")[0] : "IQ Trader");

          if (Array.isArray(res)) {
            // e.g. /api/v1/balances directly returning array of balances
            for (const b of res) {
              const bType = b.type;
              const bAmount = typeof b.amount === "number" ? b.amount : parseFloat(b.amount || 0);
              const bBonus = typeof b.bonus_amount === "number" ? b.bonus_amount : (typeof b.bonus === "number" ? b.bonus : parseFloat(b.bonus_amount || b.bonus || 0));
              if (b.currency) currency = b.currency;
              if (bType === 4) {
                practiceBal = bAmount;
                practiceBalanceId = b.id;
              } else if (bType === 1) {
                realBal = bAmount;
                realBalanceId = b.id;
                if (bBonus > 0) bonusBal += bBonus;
              } else if (bType === 2) {
                bonusBal += bAmount;
                bonusBalanceId = b.id;
              }
            }
          } else if (Array.isArray(res.balances)) {
            for (const b of res.balances) {
              const bType = b.type;
              const bAmount = typeof b.amount === "number" ? b.amount : parseFloat(b.amount || 0);
              const bBonus = typeof b.bonus_amount === "number" ? b.bonus_amount : (typeof b.bonus === "number" ? b.bonus : parseFloat(b.bonus_amount || b.bonus || 0));
              if (b.currency) currency = b.currency;
              if (bType === 4) {
                practiceBal = bAmount;
                practiceBalanceId = b.id;
              } else if (bType === 1) {
                realBal = bAmount;
                realBalanceId = b.id;
                if (bBonus > 0) bonusBal += bBonus;
              } else if (bType === 2) {
                bonusBal += bAmount;
                bonusBalanceId = b.id;
              }
            }
          } else if (typeof res.balance === "number" || typeof res.balance === "string") {
            const bVal = parseFloat(String(res.balance));
            if (this.accountMode === "REAL") realBal = bVal;
            else practiceBal = bVal;
          }

          const activeBalanceId = this.accountMode === "REAL"
            ? (realBalanceId || bonusBalanceId || res.balance_id || 0)
            : (practiceBalanceId || res.balance_id || 0);

          this.userProfile = {
            id,
            email: res.email || this.email,
            name,
            currency,
            balances: {
              PRACTICE: practiceBal,
              REAL: realBal,
              bonus: bonusBal,
              totalReal: realBal + bonusBal,
              practiceBalanceId,
              realBalanceId,
              bonusBalanceId,
              currency,
            },
            activeAccountMode: this.accountMode,
            activeBalanceId,
          };

          console.log(`[IQ Option REST Sync] Live Profile Loaded from ${url}: User #${id} | Real: $${realBal.toFixed(2)}${bonusBal > 0 ? ` (+Bonus: $${bonusBal.toFixed(2)})` : ""} | Practice: $${practiceBal.toFixed(2)} ${currency}`);
          return true;
        }
      } catch (err) {
        console.warn(`[IQ Option REST Sync] Fetch ${url} error:`, err);
      }
    }
    return false;
  }

  /**
   * Switches active balance mode on IQ Option broker servers
   */
  public async syncActiveBalanceWithBroker(): Promise<boolean> {
    if (!this.userProfile) return false;
    const targetBalanceId = this.accountMode === "REAL"
      ? this.userProfile.balances.realBalanceId
      : this.userProfile.balances.practiceBalanceId;

    if (!targetBalanceId) return false;
    this.userProfile.activeBalanceId = targetBalanceId;
    this.userProfile.activeAccountMode = this.accountMode;

    // Send via WebSocket
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.sendWebSocketMessage("sendMessage", {
        name: "change-balance",
        version: "2.0",
        body: { balance_id: targetBalanceId },
      }).catch(() => {});
    }

    // Also send via REST API
    if (this.ssid) {
      try {
        await fetch("https://iqoption.com/api/v1/change-balance", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Cookie": `ssid=${this.ssid}`,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          body: JSON.stringify({ balance_id: targetBalanceId }),
        });
      } catch (e) {}
    }

    return true;
  }

  /**
   * Step 2: Connect to IQ Option Live WebSocket Gateway
   */
  public connectWebSocket(): Promise<boolean> {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      return Promise.resolve(true);
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.isConnected) {
            clearInterval(check);
            resolve(true);
          }
        }, 300);
        setTimeout(() => {
          clearInterval(check);
          resolve(this.isConnected);
        }, 10000);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve) => {
      try {
        const wsUrl = "wss://iqoption.com/echo/websocket";
        this.ws = new WebSocket(wsUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Origin": "https://iqoption.com",
          },
        });

        const connectionTimeout = setTimeout(() => {
          if (!this.isConnected) {
            this.isConnecting = false;
            resolve(false);
          }
        }, 12000);

        this.ws.on("open", () => {
          console.log("[IQ Option WS] Socket connection opened. Authenticating with SSID...");
          // Send authentication payload
          if (this.ssid) {
            this.sendRaw({
              name: "ssid",
              msg: this.ssid,
            });
            this.sendRaw({
              name: "authenticate",
              msg: { ssid: this.ssid },
            });
            // Explicitly request balances, profile, and full asset actives data
            setTimeout(() => {
              this.sendRaw({
                name: "sendMessage",
                request_id: `get_bal_${Date.now()}`,
                msg: {
                  name: "get-balances",
                  version: "1.0",
                  body: { types_ids: [1, 4, 2] },
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `get_prof_${Date.now()}`,
                msg: {
                  name: "get-profile",
                  version: "1.0",
                  body: {},
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `get_user_prof_${Date.now()}`,
                msg: {
                  name: "get-user-profile-client",
                  version: "1.0",
                  body: {},
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `get_init_v3_${Date.now()}`,
                msg: {
                  name: "get-initialization-data",
                  version: "3.0",
                  body: {},
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `get_init_v4_${Date.now()}`,
                msg: {
                  name: "get-initialization-data",
                  version: "4.0",
                  body: {},
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `underlying_turbo_${Date.now()}`,
                msg: {
                  name: "underlying-list",
                  version: "2.0",
                  body: { type: "turbo-option" },
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `underlying_bin_${Date.now()}`,
                msg: {
                  name: "underlying-list",
                  version: "2.0",
                  body: { type: "binary-option" },
                },
              });
              this.sendRaw({
                name: "sendMessage",
                request_id: `api_game_${Date.now()}`,
                msg: {
                  name: "api_game_getoptions",
                  version: "1.0",
                  body: {},
                },
              });
            }, 300);
          }

          // Start ping heartbeat (keepalive)
          if (this.pingInterval) clearInterval(this.pingInterval);
          this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
              this.sendRaw({ name: "heartbeat", userTime: Date.now(), heartbeatTime: Date.now() });
            }
          }, 20000);
        });

        this.ws.on("message", (raw: WebSocket.Data) => {
          try {
            const str = raw.toString();
            const message = JSON.parse(str);
            this.handleIncomingMessage(message);

            // Once profile or balances arrive, confirm connected
            if (message.name === "profile" || message.name === "balances" || message.name === "authenticated" || message.name === "initialization-data") {
              if (!this.isConnected) {
                this.isConnected = true;
                this.isConnecting = false;
                clearTimeout(connectionTimeout);
                this.reconnectAttempts = 0;
                resolve(true);
              }
            }
          } catch (e) {}
        });

        this.ws.on("error", (err) => {
          console.warn("[IQ Option WS Error]:", err.message);
        });

        this.ws.on("close", (code, reason) => {
          console.warn(`[IQ Option WS Closed] code=${code} reason=${reason.toString()}`);
          this.isConnected = false;
          this.isConnecting = false;
          if (this.pingInterval) clearInterval(this.pingInterval);

          // Auto-reconnect if session still configured
          if (this.ssid && this.reconnectAttempts < 10) {
            this.reconnectAttempts++;
            const delay = Math.min(30000, 2000 * Math.pow(1.5, this.reconnectAttempts));
            setTimeout(() => {
              this.connectWebSocket().catch(() => {});
            }, delay);
          }
        });
      } catch (e: any) {
        this.isConnecting = false;
        resolve(false);
      }
    });
  }

  private sendRaw(data: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  public sendWebSocketMessage(name: string, msg: any, timeoutMs: number = 8000): Promise<any> {
    const requestId = `req_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    const payload = {
      name,
      request_id: requestId,
      msg,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.requestCallbacks.delete(requestId);
        // If timeout occurs, resolve with null instead of crashing
        resolve(null);
      }, timeoutMs);

      this.requestCallbacks.set(requestId, { resolve, reject, timer });
      this.sendRaw(payload);
    });
  }

  /**
   * Parses all incoming messages from IQ Option WebSocket Server
   */
  private handleIncomingMessage(msg: any) {
    const name = msg?.name;
    const data = msg?.msg;
    const requestId = msg?.request_id;

    // 1. Resolve pending request callbacks
    if (requestId && this.requestCallbacks.has(requestId)) {
      const callback = this.requestCallbacks.get(requestId);
      if (callback) {
        clearTimeout(callback.timer);
        this.requestCallbacks.delete(requestId);
        callback.resolve(msg);
      }
    }

    // 2. Handle User Profile & Balances
    if ((name === "profile" || name === "user-profile-client") && data) {
      this.handleProfileMessage(data);
    }

    // 3. Handle Balances Array
    if (name === "balances" && data) {
      if (Array.isArray(data)) {
        this.handleBalancesArray(data);
      } else if (Array.isArray(data.balances)) {
        this.handleBalancesArray(data.balances);
      }
    }

    // 4. Handle Live Balance Change
    if (name === "balance-changed" && data) {
      this.handleBalanceChanged(data);
    }

    // 5. Handle Live Option Closed (Settlement!)
    if (name === "option-closed" || name === "socket-option-closed" || name === "option-archived") {
      this.handleOptionClosed(data);
    }

    // 6. Handle Initialization Data & Actives
    if (
      name === "initialization-data" ||
      name === "front-initialization-data" ||
      name === "api_game_getoptions" ||
      name === "underlying-list" ||
      name === "actives" ||
      name === "instruments"
    ) {
      this.handleInitializationData(data || msg);
    }

    // 7. Handle Live Quotes and Candles
    if (name === "candle-generated" || name === "quote" || name === "candles") {
      const activeId = data?.active_id || data?.activeId || data?.id;
      const price = data?.close ?? data?.value ?? data?.price ?? data?.c;
      if (typeof activeId === "number" && typeof price === "number" && price > 0) {
        this.latestAssetQuotes.set(activeId, price);
      }
    }
  }

  private normalizeIqAssetName(asset: string): string {
    return String(asset).trim().toUpperCase().replace(/[\/_\s]/g, "");
  }

  /**
   * Recursive tree walker extracting active_id and name pairs from v6.8.9.1 / v6 initialization data
   * Exactly matching Python iqoptionapi `_populate_active_map`
   */
  private populateActiveMap(result: any): number {
    if (!result || typeof result !== "object") return 0;
    let mapped = 0;

    const walk = (obj: any) => {
      if (!obj) return;
      if (Array.isArray(obj)) {
        for (const value of obj) walk(value);
      } else if (typeof obj === "object") {
        const activeIdRaw = obj.active_id ?? obj.activeId ?? obj.id;
        const nameRaw = obj.name ?? obj.ticker ?? obj.symbol ?? obj.pair ?? obj.description ?? obj.active_name;

        if (activeIdRaw !== undefined && activeIdRaw !== null && nameRaw) {
          const numId = typeof activeIdRaw === "number" ? activeIdRaw : parseInt(String(activeIdRaw), 10);
          if (!isNaN(numId) && numId > 0) {
            // Handles names such as binary.EURUSD-OTC, turbo.EURUSD-OTC, digital.EURUSD-OTC, and plain EURUSD-OTC
            const nameStr = String(nameRaw);
            const assetPart = nameStr.includes(".") ? nameStr.split(".").slice(-1)[0] : nameStr;
            const asset = this.normalizeIqAssetName(assetPart);

            if (asset) {
              this.dynamicActiveIds.set(asset, numId);
              const isOTC = asset.includes("OTC") || nameStr.toUpperCase().includes("OTC");
              const baseClean = asset.replace(/[^A-Z0-9]/g, "").replace(/OTC$/g, "").replace(/^OTC/g, "");

              if (baseClean.length >= 3) {
                if (isOTC) {
                  this.dynamicActiveIds.set(`${baseClean}-OTC`, numId);
                  this.dynamicActiveIds.set(`${baseClean}OTC`, numId);
                  this.dynamicActiveIds.set(`${baseClean}_OTC`, numId);
                  this.dynamicActiveIds.set(`${baseClean}-`, numId);
                  this.dynamicActiveIds.set(`${baseClean} (OTC)`, numId);
                } else {
                  this.dynamicActiveIds.set(baseClean, numId);
                }
              }
              mapped++;
            }
          }
        }

        for (const value of Object.values(obj)) {
          if (typeof value === "object" && value !== null) {
            walk(value);
          }
        }
      }
    };

    try {
      walk(result);
      if (mapped > 0) {
        console.log(`[IQ Option Dynamic Actives] Mapped ${mapped} live active IDs via recursive init tree walker`);
      }
    } catch (e) {
      console.warn("[IQ Option Active Mapping Warning]", e);
    }
    return mapped;
  }

  private handleInitializationData(data: any) {
    if (!data) return;
    const root = data.msg || data.body || data;
    this.populateActiveMap(root);
  }

  /**
   * Resolves the real numeric Active ID for any OTC pair on IQ Option
   */
  public resolveActiveId(assetRaw: string): number {
    if (!assetRaw) return 76; // Default to EURUSD-OTC (76)
    const upper = assetRaw.toUpperCase().trim();
    const baseClean = upper
      .replace(/\(.*?\)/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .replace(/OTC$/g, "")
      .replace(/^OTC/g, "");

    // Keys prioritized for OTC trading bot
    const lookupKeys: string[] = [
      `${baseClean}-OTC`,
      `${baseClean}OTC`,
      `${baseClean}_OTC`,
      `${baseClean} (OTC)`,
      upper,
      this.normalizeIqAssetName(upper),
      baseClean,
    ];

    // 1. Check dynamically fetched actives from IQ Option WebSocket first
    for (const key of lookupKeys) {
      if (this.dynamicActiveIds.has(key)) {
        return this.dynamicActiveIds.get(key)!;
      }
    }

    // 2. Check complete static OTC map
    for (const key of lookupKeys) {
      if (ASSET_ID_MAP[key]) {
        return ASSET_ID_MAP[key];
      }
    }

    // 3. Fallback to base OTC map
    if (ASSET_ID_MAP[`${baseClean}-OTC`]) {
      return ASSET_ID_MAP[`${baseClean}-OTC`];
    }

    // Fallback default OTC EURUSD-OTC
    return 76;
  }

  /**
   * Validates if asset is mapped in active map before trade dispatch (matching Python find_open_asset)
   */
  public findOpenAsset(assetRaw: string): { assetName: string; activeId: number } | null {
    const activeId = this.resolveActiveId(assetRaw);
    if (!activeId) return null;
    const baseClean = assetRaw.toUpperCase().replace(/\(.*?\)/g, "").replace(/[^A-Z0-9]/g, "").replace(/OTC$/g, "");
    return {
      assetName: `${baseClean}-OTC`,
      activeId,
    };
  }

  private handleProfileMessage(data: any) {
    const res = data.result || data.data || data;
    const id = res.id || res.user_id || 0;
    const email = res.email || this.email;
    const name = res.name || res.first_name || (email ? email.split("@")[0] : "IQ Option Trader");
    const currency = res.currency || this.userProfile?.currency || "USD";

    let practiceBal = this.userProfile?.balances?.PRACTICE ?? 10000.0;
    let realBal = this.userProfile?.balances?.REAL ?? 0.0;
    let bonusBal = this.userProfile?.balances?.bonus ?? 0.0;
    let practiceBalanceId: number | undefined = this.userProfile?.balances?.practiceBalanceId;
    let realBalanceId: number | undefined = this.userProfile?.balances?.realBalanceId;
    let bonusBalanceId: number | undefined = this.userProfile?.balances?.bonusBalanceId;

    if (Array.isArray(res.balances)) {
      for (const b of res.balances) {
        const bType = b.type;
        const bAmount = typeof b.amount === "number" ? b.amount : parseFloat(b.amount || 0);
        const bBonus = typeof b.bonus_amount === "number" ? b.bonus_amount : (typeof b.bonus === "number" ? b.bonus : parseFloat(b.bonus_amount || b.bonus || 0));
        if (bType === 4) {
          practiceBal = bAmount;
          practiceBalanceId = b.id;
        } else if (bType === 1) {
          realBal = bAmount;
          realBalanceId = b.id;
          if (bBonus > 0) bonusBal += bBonus;
        } else if (bType === 2) {
          bonusBal += bAmount;
          bonusBalanceId = b.id;
        }
      }
    } else if (typeof res.balance === "number") {
      if (this.accountMode === "REAL") realBal = res.balance;
      else practiceBal = res.balance;
    }

    const activeBalanceId = this.accountMode === "REAL"
      ? (realBalanceId || bonusBalanceId || res.balance_id || 0)
      : (practiceBalanceId || res.balance_id || 0);

    this.userProfile = {
      id,
      email,
      name,
      currency,
      balances: {
        PRACTICE: practiceBal,
        REAL: realBal,
        bonus: bonusBal,
        totalReal: realBal + bonusBal,
        practiceBalanceId,
        realBalanceId,
        bonusBalanceId,
        currency,
      },
      activeAccountMode: this.accountMode,
      activeBalanceId,
    };

    console.log(`[IQ Option WS Profile Loaded] User #${id} | Practice: $${practiceBal.toFixed(2)} | Real: $${realBal.toFixed(2)}${bonusBal > 0 ? ` (+Bonus: $${bonusBal.toFixed(2)})` : ""} ${currency}`);
  }

  private handleBalancesArray(balances: any[]) {
    let practiceBal = this.userProfile?.balances?.PRACTICE ?? 10000.0;
    let realBal = this.userProfile?.balances?.REAL ?? 0.0;
    let bonusBal = this.userProfile?.balances?.bonus ?? 0.0;
    let practiceBalanceId = this.userProfile?.balances?.practiceBalanceId;
    let realBalanceId = this.userProfile?.balances?.realBalanceId;
    let bonusBalanceId = this.userProfile?.balances?.bonusBalanceId;
    let currency = this.userProfile?.currency || "USD";

    for (const b of balances) {
      const bType = b.type;
      const bAmount = typeof b.amount === "number" ? b.amount : parseFloat(b.amount || 0);
      const bBonus = typeof b.bonus_amount === "number" ? b.bonus_amount : (typeof b.bonus === "number" ? b.bonus : parseFloat(b.bonus_amount || b.bonus || 0));
      if (b.currency) currency = b.currency;
      if (bType === 4) {
        practiceBal = bAmount;
        practiceBalanceId = b.id;
      } else if (bType === 1) {
        realBal = bAmount;
        realBalanceId = b.id;
        if (bBonus > 0) bonusBal += bBonus;
      } else if (bType === 2) {
        bonusBal += bAmount;
        bonusBalanceId = b.id;
      }
    }

    if (this.userProfile) {
      this.userProfile.balances.PRACTICE = practiceBal;
      this.userProfile.balances.REAL = realBal;
      this.userProfile.balances.bonus = bonusBal;
      this.userProfile.balances.totalReal = realBal + bonusBal;
      this.userProfile.balances.practiceBalanceId = practiceBalanceId;
      this.userProfile.balances.realBalanceId = realBalanceId;
      this.userProfile.balances.bonusBalanceId = bonusBalanceId;
      this.userProfile.currency = currency;
      this.userProfile.balances.currency = currency;
    } else {
      this.userProfile = {
        id: 0,
        email: this.email,
        name: this.email ? this.email.split("@")[0] : "IQ Trader",
        currency,
        balances: {
          PRACTICE: practiceBal,
          REAL: realBal,
          bonus: bonusBal,
          totalReal: realBal + bonusBal,
          practiceBalanceId,
          realBalanceId,
          bonusBalanceId,
          currency,
        },
        activeAccountMode: this.accountMode,
        activeBalanceId: this.accountMode === "REAL" ? (realBalanceId || bonusBalanceId) : practiceBalanceId,
      };
    }
  }

  private handleBalanceChanged(data: any) {
    const current = data.current_balance || data.balance || data;
    const bType = current.type;
    const bAmount = typeof current.amount === "number" ? current.amount : parseFloat(current.amount || 0);
    const bBonus = typeof current.bonus_amount === "number" ? current.bonus_amount : (typeof current.bonus === "number" ? current.bonus : parseFloat(current.bonus_amount || current.bonus || 0));

    if (!this.userProfile) {
      this.userProfile = {
        id: data.user_id || 0,
        email: this.email,
        name: "IQ Trader",
        currency: data.currency || "USD",
        balances: {
          PRACTICE: bType === 4 ? bAmount : 10000,
          REAL: bType === 1 ? bAmount : 0,
          bonus: bType === 2 ? bAmount : bBonus,
          totalReal: (bType === 1 ? bAmount : 0) + (bType === 2 ? bAmount : bBonus),
          practiceBalanceId: bType === 4 ? current.id : undefined,
          realBalanceId: bType === 1 ? current.id : undefined,
          bonusBalanceId: bType === 2 ? current.id : undefined,
          currency: data.currency || "USD",
        },
        activeAccountMode: this.accountMode,
        activeBalanceId: current.id || (this.accountMode === "REAL" ? 1 : 4),
      };
      return;
    }

    if (bType === 4) {
      this.userProfile.balances.PRACTICE = bAmount;
      if (current.id) this.userProfile.balances.practiceBalanceId = current.id;
    } else if (bType === 1) {
      this.userProfile.balances.REAL = bAmount;
      if (bBonus > 0) this.userProfile.balances.bonus = bBonus;
      this.userProfile.balances.totalReal = bAmount + (this.userProfile.balances.bonus || 0);
      if (current.id) this.userProfile.balances.realBalanceId = current.id;
    } else if (bType === 2) {
      this.userProfile.balances.bonus = bAmount;
      this.userProfile.balances.totalReal = (this.userProfile.balances.REAL || 0) + bAmount;
      if (current.id) this.userProfile.balances.bonusBalanceId = current.id;
    }
  }

  private handleOptionClosed(data: any) {
    if (!data) return;
    const orderId = String(data.id || data.option_id || data.position_id);
    const winStr = String(data.win || "").toLowerCase();
    const isWin = winStr === "win" || (typeof data.win_amount === "number" && data.win_amount > 0);
    const isDraw = winStr === "equal" || winStr === "draw" || winStr === "tie";

    const stake = parseFloat(data.amount || data.price || 10);
    let profit = 0;
    let outcome: "WIN" | "LOSS" | "DRAW" = "LOSS";

    if (isWin) {
      outcome = "WIN";
      profit = typeof data.profit_amount === "number"
        ? data.profit_amount
        : (typeof data.win_amount === "number" ? data.win_amount - stake : stake * 0.87);
    } else if (isDraw) {
      outcome = "DRAW";
      profit = 0;
    } else {
      outcome = "LOSS";
      profit = -stake;
    }

    const settlement: IQOrderSettlementResult = {
      settled: true,
      orderId,
      outcome,
      profit: Number(profit.toFixed(2)),
      closePrice: data.close_quote || data.close_price,
      openPrice: data.open_quote || data.open_price,
      rawBrokerResponse: data,
    };

    this.orderSettlementCache.set(orderId, settlement);

    // Notify registered listener
    if (this.orderSettlementListeners.has(orderId)) {
      const listener = this.orderSettlementListeners.get(orderId);
      if (listener) listener(settlement);
      this.orderSettlementListeners.delete(orderId);
    }
  }

  /**
   * Calculates the exact expiration Unix timestamp in seconds for IQ Option
   */
  public calculateExpirationTimestamp(durationMinutes: number, scheduledEntryEpochMs: number = Date.now()): number {
    const entrySec = Math.floor(scheduledEntryEpochMs / 1000);
    const candleDurationSec = Math.max(1, durationMinutes) * 60;
    
    // Align with nearest end-of-candle boundary on IQ Option
    let expiredSec = Math.ceil(entrySec / 60) * 60 + candleDurationSec;
    // If entry is right at candle open, expiry is exactly entry + duration * 60
    if (entrySec % 60 === 0) {
      expiredSec = entrySec + candleDurationSec;
    }
    return expiredSec;
  }

  /**
   * Dispatches a REAL binary or turbo option trade to IQ Option Broker
   */
  public async placeOrder(params: {
    asset: string;
    action: "CALL" | "PUT";
    stake: number;
    durationMinutes: number;
    accountMode?: "PRACTICE" | "REAL";
    scheduledEntryEpochMs?: number;
  }): Promise<IQOrderPlacementResult> {
    const { asset, action, stake, durationMinutes } = params;
    const mode = params.accountMode || this.accountMode;
    const actionLower = action.toLowerCase() as "call" | "put";

    const activeId = this.resolveActiveId(asset);
    const duration = Math.max(1, durationMinutes || 1);
    const optionTypeId = duration <= 5 ? 3 : 1; // 3 for Turbo (1-5m), 1 for Binary (>5m)
    const expirationSec = this.calculateExpirationTimestamp(duration, params.scheduledEntryEpochMs || Date.now());

    // 1. Check if connected to IQ Option
    if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
      // If we have saved credentials, try reconnecting first
      if (this.ssid) {
        await this.connectWebSocket();
      }
    }

    // High-fidelity fallback for demo/simulation testing when live broker session is not yet active
    if (!this.isConnected || !this.userProfile) {
      const simOrderId = `SIM-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      console.log(`[IQ Option Practice/Demo Bridge] Placing Simulated Order #${simOrderId} | ${asset} ${action} $${stake} (${duration}m)`);
      return {
        success: true,
        orderId: simOrderId,
        asset,
        action,
        stake,
        duration,
        expirationEpochSec: expirationSec,
        payout: 87,
        isSimulated: true,
      };
    }

    // 2. Select balance ID (Supports cash accounts, bonus accounts, and promotional accounts)
    const userBalanceId = mode === "REAL"
      ? (this.userProfile.balances.realBalanceId || this.userProfile.balances.bonusBalanceId || this.userProfile.activeBalanceId)
      : (this.userProfile.balances.practiceBalanceId || this.userProfile.activeBalanceId);

    if (!userBalanceId) {
      return {
        success: false,
        asset,
        action,
        stake,
        duration,
        error: `No valid ${mode} balance ID found on IQ Option profile.`,
      };
    }

    const currentBalance = mode === "REAL"
      ? this.userProfile.balances.REAL
      : this.userProfile.balances.PRACTICE;
    const bonusBalance = this.userProfile.balances.bonus || 0;

    // Professional balance handling: We DO NOT locally pre-block trades when balance is zero or low.
    // Real accounts may hold bonus funds, trading credits, or promotional balances enabled for live execution.
    // The order is dispatched directly to IQ Option broker to allow server-authoritative validation.
    console.log(`[IQ Option Dispatch] Mode: ${mode} | UserBalanceId: ${userBalanceId} | Cash: $${currentBalance.toFixed(2)}${mode === "REAL" && bonusBalance > 0 ? ` (+Bonus: $${bonusBalance.toFixed(2)})` : ""} | Stake: $${stake.toFixed(2)} | Submitting order to broker...`);

    const nowSec = Math.floor(Date.now() / 1000);

    const rawClean = asset.toUpperCase().trim();
    const isExplicitOTC = rawClean.includes("OTC") || rawClean.includes("(OTC)") || rawClean.includes("-OTC") || rawClean.includes("_OTC");
    const basePair = rawClean
      .replace(/\(.*?\)/g, "")
      .replace(/[^A-Z0-9]/g, "")
      .replace(/OTC$/g, "")
      .replace(/^OTC/g, "");

    const primaryName = isExplicitOTC ? `${basePair}-OTC` : basePair;
    const counterpartName = isExplicitOTC ? basePair : `${basePair}-OTC`;

    // Build intelligent candidate list for order placement:
    // 1. Primary requested pair
    // 2. Counterpart pair (OTC if primary is standard; standard if primary is OTC)
    const primaryActiveId = this.resolveActiveId(primaryName);
    const counterpartActiveId = this.resolveActiveId(counterpartName);

    const primaryOptionType = duration <= 5 ? 3 : 1; // 3 for Turbo (1-5m), 1 for Binary (>5m)
    const altOptionType = primaryOptionType === 3 ? 1 : 3;

    interface OrderCandidate {
      targetAsset: string;
      activeId: number;
      optionTypeId: number;
      label: string;
    }

    const candidateList: OrderCandidate[] = [
      { targetAsset: primaryName, activeId: primaryActiveId, optionTypeId: primaryOptionType, label: `Primary ${primaryName} (Type ${primaryOptionType})` },
      { targetAsset: primaryName, activeId: primaryActiveId, optionTypeId: altOptionType, label: `Primary ${primaryName} (Alt Type ${altOptionType})` },
      { targetAsset: counterpartName, activeId: counterpartActiveId, optionTypeId: primaryOptionType, label: `Counterpart ${counterpartName} (Type ${primaryOptionType})` },
      { targetAsset: counterpartName, activeId: counterpartActiveId, optionTypeId: altOptionType, label: `Counterpart ${counterpartName} (Alt Type ${altOptionType})` },
    ];

    // Deduplicate candidates
    const seen = new Set<string>();
    const candidates: OrderCandidate[] = [];
    for (const c of candidateList) {
      if (!c.activeId) continue;
      const key = `${c.activeId}_${c.optionTypeId}`;
      if (!seen.has(key)) {
        seen.add(key);
        candidates.push(c);
      }
    }

    let lastBrokerError = "";
    let attemptedPermutations = 0;

    for (const candidate of candidates) {
      if (!candidate.activeId) continue;
      attemptedPermutations++;

      const openOptionBody = {
        user_balance_id: userBalanceId,
        active_id: candidate.activeId,
        option_type_id: candidate.optionTypeId,
        direction: actionLower,
        expired: expirationSec,
        price: stake,
        time: nowSec,
      };

      console.log(`[IQ Option LIVE] Attempting ${candidate.label} (${candidate.targetAsset}, activeId: ${candidate.activeId}, type: ${candidate.optionTypeId}):`, JSON.stringify(openOptionBody));

      try {
        // Try binary-options.open-option
        let response = await this.sendWebSocketMessage("sendMessage", {
          name: "binary-options.open-option",
          version: "1.0",
          body: openOptionBody,
        }, 4000);

        if (response && response.msg) {
          const body = response.msg.body || response.msg;
          const isSuccessful = response.msg.is_successful !== false && !response.msg.message;

          if (isSuccessful && (body.id || response.msg.id)) {
            const brokerOrderId = body.id || response.msg.id;
            const fallbackNotice = candidate.targetAsset !== asset ? ` (Auto-fallback to ${candidate.targetAsset})` : "";
            console.log(`✅ [IQ Option LIVE] Trade Placed Successfully! Broker Order ID #${brokerOrderId}${fallbackNotice}`);

            // Subscribe to live candle/quote updates for fast checkpoint checking
            this.subscribeToAssetQuotes(candidate.activeId);

            const openPrice = typeof body.value === "number" ? body.value
              : typeof body.open_quote === "number" ? body.open_quote
              : typeof body.open_price === "number" ? body.open_price
              : typeof response.msg.value === "number" ? response.msg.value
              : this.getLatestQuote(candidate.targetAsset) || undefined;

            return {
              success: true,
              orderId: brokerOrderId,
              asset: candidate.targetAsset,
              action,
              stake,
              duration,
              expirationEpochSec: expirationSec,
              payout: 87,
              openPrice,
              isSimulated: false,
            };
          } else if (response.msg.message || body.message) {
            const rejectReason = String(response.msg.message || body.message);
            lastBrokerError = rejectReason;
            console.log(`[IQ Option] Candidate ${candidate.targetAsset} (type ${candidate.optionTypeId}) response: ${rejectReason}`);

            // If error is NOT an asset availability/closed error (e.g. balance or stake issue), stop iterating
            if (!isAssetUnavailableError(rejectReason)) {
              const isInsufficientFunds = isInsufficientBalanceError(rejectReason);
              const formattedError = isInsufficientFunds
                ? `Insufficient balance on IQ Option broker: ${rejectReason}`
                : `IQ Option Broker Rejected: ${rejectReason}`;

              return {
                success: false,
                asset: candidate.targetAsset,
                action,
                stake,
                duration,
                error: formattedError,
                isSimulated: false,
              };
            }
          }
        }

        // Secondary attempt: buyV2 protocol for this candidate
        const buyV2Response = await this.sendWebSocketMessage("sendMessage", {
          name: "buyV2",
          version: "1.0",
          body: {
            price: stake,
            act: candidate.activeId,
            exp: expirationSec,
            type: candidate.optionTypeId,
            direction: actionLower,
            time: nowSec,
            user_balance_id: userBalanceId,
          },
        }, 3500);

        if (buyV2Response && buyV2Response.msg) {
          const bBody = buyV2Response.msg.body || buyV2Response.msg;
          if (bBody.id || buyV2Response.msg.id) {
            const brokerOrderId = bBody.id || buyV2Response.msg.id;
            const fallbackNotice = candidate.targetAsset !== asset ? ` (Auto-fallback to ${candidate.targetAsset})` : "";
            console.log(`✅ [IQ Option LIVE via buyV2] Trade Placed! Broker Order ID #${brokerOrderId}${fallbackNotice}`);

            this.subscribeToAssetQuotes(candidate.activeId);

            const openPrice = typeof bBody.value === "number" ? bBody.value
              : typeof bBody.open_quote === "number" ? bBody.open_quote
              : typeof bBody.open_price === "number" ? bBody.open_price
              : this.getLatestQuote(candidate.targetAsset) || undefined;

            return {
              success: true,
              orderId: brokerOrderId,
              asset: candidate.targetAsset,
              action,
              stake,
              duration,
              expirationEpochSec: expirationSec,
              payout: 87,
              openPrice,
              isSimulated: false,
            };
          }
        }
      } catch (err: any) {
        lastBrokerError = err.message || String(err);
      }
    }

    // If all candidate permutations failed because market is closed on broker
    const isClosed = isAssetUnavailableError(lastBrokerError);
    const friendlyError = isClosed
      ? `Cannot purchase option (${asset} & ${counterpartName} are currently closed/unavailable on IQ Option). Outside active broker market hours.`
      : (lastBrokerError || "Timeout waiting for IQ Option broker order confirmation response.");

    return {
      success: false,
      asset,
      action,
      stake,
      duration,
      error: `IQ Option Broker Rejected: ${friendlyError}`,
      isSimulated: false,
    };
  }

  /**
   * Retrieves verified settlement result from IQ Option for an executed order
   */
  public async getOrderSettlement(
    orderId: string | number,
    stake: number,
    timeoutMs: number = 8000
  ): Promise<IQOrderSettlementResult> {
    const idStr = String(orderId);

    // 1. Check cache first
    if (this.orderSettlementCache.has(idStr)) {
      return this.orderSettlementCache.get(idStr)!;
    }

    // 1B. Handle simulated/demo orders
    if (idStr.startsWith("SIM-")) {
      const isWin = Math.random() >= 0.35; // realistic 65% win benchmark
      const profit = isWin ? Number((stake * 0.87).toFixed(2)) : -stake;
      const outcome: "WIN" | "LOSS" = isWin ? "WIN" : "LOSS";
      const result: IQOrderSettlementResult = {
        settled: true,
        orderId,
        outcome,
        profit,
      };
      this.orderSettlementCache.set(idStr, result);
      return result;
    }

    // 2. If socket connected, query get-options
    if (this.isConnected && this.userProfile) {
      try {
        const balanceId = this.accountMode === "REAL"
          ? this.userProfile.balances.realBalanceId
          : this.userProfile.balances.practiceBalanceId;

        const res = await this.sendWebSocketMessage("sendMessage", {
          name: "get-options",
          version: "1.0",
          body: {
            user_balance_id: balanceId,
            limit: 10,
          },
        }, 5000);

        if (res?.msg?.options && Array.isArray(res.msg.options)) {
          const match = res.msg.options.find((o: any) => String(o.id) === idStr);
          if (match && match.win !== undefined) {
            const winStr = String(match.win).toLowerCase();
            const outcome = winStr === "win" ? "WIN" : (winStr === "equal" || winStr === "draw" ? "DRAW" : "LOSS");
            const profit = outcome === "WIN"
              ? Number((parseFloat(match.win_amount || 0) - stake).toFixed(2))
              : (outcome === "DRAW" ? 0 : -stake);

            const result: IQOrderSettlementResult = {
              settled: true,
              orderId,
              outcome,
              profit,
              closePrice: match.close_quote,
              openPrice: match.open_quote,
              rawBrokerResponse: match,
            };
            this.orderSettlementCache.set(idStr, result);
            return result;
          }
        }
      } catch (e) {}
    }

    // 3. Register listener for WebSocket push notification or REST polling
    const wsPromise = new Promise<IQOrderSettlementResult>((resolve) => {
      const timer = setTimeout(() => {
        this.orderSettlementListeners.delete(idStr);
        resolve({
          settled: false,
          orderId,
          outcome: "PENDING",
          profit: 0,
        });
      }, timeoutMs);

      this.orderSettlementListeners.set(idStr, (result) => {
        clearTimeout(timer);
        resolve(result);
      });
    });

    const wsResult = await wsPromise;
    if (wsResult.settled) {
      return wsResult;
    }

    // 4. REST History Fallback if WebSocket timed out
    if (this.ssid) {
      try {
        const historyUrls = [
          "https://iqoption.com/api/v1/history/positions?limit=10",
          "https://iqoption.com/api/v1/users/positions?limit=10",
        ];
        for (const hUrl of historyUrls) {
          const resp = await fetch(hUrl, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
              "Cookie": `ssid=${this.ssid}`,
              "Accept": "application/json",
            },
          });
          if (resp.ok) {
            const hData: any = await resp.json().catch(() => null);
            const positions = hData?.result?.positions || hData?.positions || hData?.data || [];
            if (Array.isArray(positions)) {
              const matched = positions.find((p: any) => String(p.id || p.position_id || p.external_id) === idStr);
              if (matched) {
                const winStr = String(matched.win || matched.status || "").toLowerCase();
                const isWin = winStr === "win" || (typeof matched.win_amount === "number" && matched.win_amount > 0) || (typeof matched.close_profit === "number" && matched.close_profit > 0);
                const isDraw = winStr === "equal" || winStr === "draw" || winStr === "tie";
                const outcome = isWin ? "WIN" : (isDraw ? "DRAW" : "LOSS");
                const profit = isWin
                  ? Number((parseFloat(matched.win_amount || matched.close_profit || 0) - stake).toFixed(2))
                  : (isDraw ? 0 : -stake);

                const res: IQOrderSettlementResult = {
                  settled: true,
                  orderId,
                  outcome,
                  profit,
                  closePrice: matched.close_quote || matched.close_price,
                  openPrice: matched.open_quote || matched.open_price,
                  rawBrokerResponse: matched,
                };
                this.orderSettlementCache.set(idStr, res);
                return res;
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[IQ Option Settlement REST Fallback Error]:`, err);
      }
    }

    return wsResult;
  }

  public getLatestQuote(asset: string): number | null {
    const activeId = this.resolveActiveId(asset);
    if (!activeId) return null;
    return this.latestAssetQuotes.get(activeId) || null;
  }

  public subscribeToAssetQuotes(activeId: number) {
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.sendWebSocketMessage("subscribeMessage", {
          name: "candle-generated",
          params: {
            routingFilters: {
              active_id: activeId,
              size: 1,
            },
          },
        }, 1000).catch(() => {});
        this.sendWebSocketMessage("subscribeMessage", {
          name: "quote",
          params: {
            routingFilters: {
              active_id: activeId,
            },
          },
        }, 1000).catch(() => {});
      } catch (e) {}
    }
  }

  /**
   * Retrieves the latest spot price for an asset on IQ Option (via WebSocket candle query, cache, or REST API)
   */
  public async getCurrentPrice(asset: string): Promise<number | null> {
    const activeId = this.resolveActiveId(asset);
    if (!activeId) return null;

    // 1. Check cached quotes first (instant 0ms response)
    if (this.latestAssetQuotes.has(activeId)) {
      return this.latestAssetQuotes.get(activeId)!;
    }

    // 2. Check live websocket query
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const resp = await this.sendWebSocketMessage("sendMessage", {
          name: "get-candles",
          version: "2.0",
          body: {
            active_id: activeId,
            size: 1,
            to: nowSec,
            count: 1,
          },
        }, 1500);

        if (resp?.msg?.candles && Array.isArray(resp.msg.candles) && resp.msg.candles.length > 0) {
          const lastCandle = resp.msg.candles[resp.msg.candles.length - 1];
          const price = typeof lastCandle.close === "number" ? lastCandle.close : parseFloat(lastCandle.close || lastCandle.value);
          if (!isNaN(price) && price > 0) {
            this.latestAssetQuotes.set(activeId, price);
            return price;
          }
        }
      } catch (e) {}
    }

    // 3. REST API Fallback
    if (this.ssid) {
      try {
        const nowSec = Math.floor(Date.now() / 1000);
        const resp = await fetch(`https://iqoption.com/api/chart/candles?active_id=${activeId}&time=${nowSec}&count=1&size=1`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
            "Cookie": `ssid=${this.ssid}`,
            "Accept": "application/json",
          },
        });
        if (resp.ok) {
          const data: any = await resp.json().catch(() => null);
          const candles = data?.result || data?.candles || data?.data;
          if (Array.isArray(candles) && candles.length > 0) {
            const last = candles[candles.length - 1];
            const p = typeof last.close === "number" ? last.close : parseFloat(last.close || last.value || 0);
            if (!isNaN(p) && p > 0) {
              this.latestAssetQuotes.set(activeId, p);
              return p;
            }
          }
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Checks whether an open option position is currently positive / profitable
   */
  public async checkOptionProfitState(orderId: string | number): Promise<{ isPositive: boolean; profit: number; details: string } | null> {
    const idStr = String(orderId);
    if (idStr.startsWith("SIM-")) {
      return { isPositive: true, profit: 0, details: "Simulated position winning state" };
    }

    if (this.isConnected && this.userProfile) {
      try {
        const balanceId = this.accountMode === "REAL"
          ? this.userProfile.balances.realBalanceId
          : this.userProfile.balances.practiceBalanceId;

        const res = await this.sendWebSocketMessage("sendMessage", {
          name: "get-options",
          version: "1.0",
          body: {
            user_balance_id: balanceId,
            limit: 5,
          },
        }, 2000);

        if (res?.msg?.options && Array.isArray(res.msg.options)) {
          const match = res.msg.options.find((o: any) => String(o.id) === idStr);
          if (match) {
            const openQuote = match.open_quote || match.open_price;
            const closeQuote = match.close_quote || match.cur_quote || match.current_price;
            const dir = String(match.direction || match.dir || "").toLowerCase();
            if (openQuote && closeQuote) {
              const isWin = dir === "call" ? closeQuote > openQuote : closeQuote < openQuote;
              return {
                isPositive: isWin,
                profit: isWin ? (match.amount || 10) * 0.87 : 0,
                details: `Live Quote ${closeQuote} vs Strike ${openQuote} (${dir.toUpperCase()} ${isWin ? "IN PROFIT 🟢" : "IN LOSS 🔴"})`,
              };
            }
          }
        }
      } catch (e) {}
    }

    return null;
  }

  /**
   * Verifies if an option or position is officially sold / closed on the IQ Option broker side
   */
  public async verifyOptionSoldOnBroker(orderId: string | number, maxWaitMs: number = 2500): Promise<{ isSold: boolean; profit?: number; raw?: any; error?: string }> {
    const idStr = String(orderId);
    const numId = parseInt(idStr.replace(/\D/g, ""), 10) || orderId;

    if (idStr.startsWith("SIM-")) {
      return { isSold: true, profit: 0 };
    }

    // 1. Check cached settlement first (if WebSocket already broadcasted option-closed)
    if (this.orderSettlementCache.has(idStr)) {
      const cached = this.orderSettlementCache.get(idStr);
      if (cached && (cached.settled || cached.outcome === "WIN" || cached.outcome === "LOSS" || cached.outcome === "DRAW")) {
        return { isSold: true, profit: cached.profit, raw: cached.rawBrokerResponse };
      }
    }

    // 2. Query IQ Option active options list via WebSocket (get-options)
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN && this.userProfile) {
      try {
        const balanceId = this.accountMode === "REAL"
          ? this.userProfile.balances.realBalanceId
          : this.userProfile.balances.practiceBalanceId;

        const res = await this.sendWebSocketMessage("sendMessage", {
          name: "get-options",
          version: "1.0",
          body: {
            user_balance_id: balanceId,
            limit: 10,
          },
        }, 1500);

        if (res?.msg?.options && Array.isArray(res.msg.options)) {
          const match = res.msg.options.find((o: any) => String(o.id) === idStr || o.id === numId);
          if (match) {
            const status = String(match.status || match.state || "").toLowerCase();
            const winStr = String(match.win || "").toLowerCase();
            const isSoldStatus = status === "sold" || status === "closed" || status === "settled" || status === "archived";
            const hasWinAmount = typeof match.win_amount === "number" && match.win_amount > 0;
            const hasProfit = typeof match.profit_amount === "number" || typeof match.close_profit === "number";

            if (isSoldStatus || hasWinAmount || hasProfit || winStr === "win") {
              const stake = parseFloat(match.amount || 10);
              const profit = typeof match.profit_amount === "number"
                ? match.profit_amount
                : (typeof match.win_amount === "number" ? match.win_amount - stake : stake * 0.87);
              return { isSold: true, profit: Number(profit.toFixed(2)), raw: match };
            }
          }
        }
      } catch (e) {}
    }

    // 3. Query IQ Option History API via REST
    if (this.ssid) {
      try {
        const historyEndpoints = [
          "https://iqoption.com/api/v1/history/positions?limit=10",
          "https://iqoption.com/api/v1/users/positions?limit=10",
        ];
        for (const ep of historyEndpoints) {
          const resp = await fetch(ep, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
              "Cookie": `ssid=${this.ssid}`,
              "Accept": "application/json",
            },
          });
          if (resp.ok) {
            const hData: any = await resp.json().catch(() => null);
            const positions = hData?.result?.positions || hData?.positions || hData?.data || [];
            if (Array.isArray(positions)) {
              const matched = positions.find((p: any) => String(p.id || p.position_id || p.external_id) === idStr || p.id === numId);
              if (matched) {
                const status = String(matched.status || matched.state || matched.win || "").toLowerCase();
                const isClosed = status === "sold" || status === "closed" || status === "win" || (typeof matched.win_amount === "number" && matched.win_amount > 0) || (typeof matched.close_profit === "number");
                if (isClosed) {
                  const stake = parseFloat(matched.amount || 10);
                  const profit = typeof matched.win_amount === "number" && matched.win_amount > 0
                    ? matched.win_amount - stake
                    : (typeof matched.close_profit === "number" ? matched.close_profit : stake * 0.87);
                  return { isSold: true, profit: Number(profit.toFixed(2)), raw: matched };
                }
              }
            }
          }
        }
      } catch (e) {}
    }

    return { isSold: false };
  }

  /**
   * Sells an open option early via IQ Option broker API with guaranteed broker-side confirmation verification
   */
  public async sellOption(orderId: string | number): Promise<{ success: boolean; confirmed: boolean; profit?: number; error?: string; rawResult?: any }> {
    const idStr = String(orderId);
    const numId = parseInt(idStr.replace(/\D/g, ""), 10) || orderId;

    if (idStr.startsWith("SIM-")) {
      console.log(`[IQ Option Simulated] Early sell executed for Simulated Order #${idStr}`);
      return { success: true, confirmed: true, profit: 0 };
    }

    console.log(`[IQ Option sell_option] Executing Early Option Sale for Broker Order #${numId}...`);
    let lastBrokerError = "";
    let saleAccepted = false;

    // 1. Try WebSocket sell-options protocols (v2.0, v1.0, and digital option close)
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        // Method A: sendMessage sell-options v2.0
        const resV2 = await this.sendWebSocketMessage("sendMessage", {
          name: "sell-options",
          version: "2.0",
          body: {
            options_ids: [numId],
          },
        }, 2000);

        if (resV2?.msg?.is_successful === true || (Array.isArray(resV2?.msg) && resV2.msg.length > 0)) {
          console.log(`✅ [IQ Option sell_option] sell-options v2.0 accepted by broker for #${numId}`);
          saleAccepted = true;
        } else if (resV2?.msg?.message || resV2?.msg?.error) {
          lastBrokerError = String(resV2?.msg?.message || resV2?.msg?.error);
        }

        // Method B: sendMessage sell-options v1.0
        if (!saleAccepted) {
          const resV1 = await this.sendWebSocketMessage("sendMessage", {
            name: "sell-options",
            version: "1.0",
            body: {
              options_ids: [numId],
            },
          }, 2000);

          if (resV1?.msg?.is_successful === true || (Array.isArray(resV1?.msg) && resV1.msg.length > 0) || (resV1?.msg && !resV1?.msg?.is_successful && resV1?.msg?.is_successful !== false && !resV1?.msg?.message)) {
            console.log(`✅ [IQ Option sell_option] sell-options v1.0 accepted by broker for #${numId}`);
            saleAccepted = true;
          } else if (resV1?.msg?.message) {
            lastBrokerError = String(resV1?.msg?.message);
          }
        }

        // Method C: Raw sell-options channel
        if (!saleAccepted) {
          const rawRes = await this.sendWebSocketMessage("sell-options", {
            options_ids: [numId],
          }, 2000);

          if (rawRes?.msg?.is_successful === true || (Array.isArray(rawRes?.msg) && rawRes.msg.length > 0)) {
            console.log(`✅ [IQ Option sell_option] raw sell-options accepted for #${numId}`);
            saleAccepted = true;
          }
        }

        // Method D: Single option & Digital option formats
        if (!saleAccepted) {
          await this.sendWebSocketMessage("sendMessage", {
            name: "sell-option",
            version: "1.0",
            body: { option_id: numId },
          }, 1500).catch(() => {});

          await this.sendWebSocketMessage("sendMessage", {
            name: "digital-options.close-position",
            version: "1.0",
            body: { position_id: numId },
          }, 1500).catch(() => {});
        }
      } catch (e: any) {
        console.warn(`[IQ Option sell_option WS warning]:`, e.message);
        lastBrokerError = e.message;
      }
    }

    // 2. Try REST API Fallbacks
    if (!saleAccepted && this.ssid) {
      try {
        const endpoints = [
          { url: "https://iqoption.com/api/v1/sell_options", body: { options_ids: [numId] } },
          { url: "https://iqoption.com/api/option/sell", body: { option_id: numId } },
          { url: "https://iqoption.com/api/v1/digital/positions/sell", body: { position_id: numId } },
          { url: "https://iqoption.com/api/v1/positions/sell", body: { position_id: numId } },
        ];

        for (const ep of endpoints) {
          const resp = await fetch(ep.url, {
            method: "POST",
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
              "Cookie": `ssid=${this.ssid}`,
              "Content-Type": "application/json",
              "Accept": "application/json",
            },
            body: JSON.stringify(ep.body),
          });

          if (resp.ok) {
            const json: any = await resp.json().catch(() => null);
            if (json?.is_successful === true || (Array.isArray(json?.result) && json.result.length > 0) || (json && json?.is_successful !== false && !json?.message && !json?.error)) {
              console.log(`✅ [IQ Option sell_option] REST sell accepted via ${ep.url} for #${numId}`);
              saleAccepted = true;
              break;
            } else if (json?.message || json?.error) {
              lastBrokerError = String(json.message || json.error);
            }
          }
        }
      } catch (e: any) {
        console.warn(`[IQ Option sell_option REST warning]:`, e.message);
        lastBrokerError = e.message;
      }
    }

    // 3. STRICT BROKER VERIFICATION LOOP: Confirm that the order is ACTUALLY closed on IQ Option
    // We poll broker status to ensure we have confirmed feedback before telling the engine/UI it is closed
    const verification = await this.verifyOptionSoldOnBroker(orderId, 2500);
    if (verification.isSold) {
      console.log(`🎯 [IQ Option sell_option VERIFIED] Order #${numId} verified SOLD & CLOSED on broker! Profit: +$${verification.profit}`);
      return {
        success: true,
        confirmed: true,
        profit: verification.profit,
        rawResult: verification.raw,
      };
    }

    // If sale was accepted but verification is slightly delayed, do one more quick check after 500ms
    if (saleAccepted) {
      await new Promise((r) => setTimeout(r, 500));
      const retryVerify = await this.verifyOptionSoldOnBroker(orderId, 1500);
      if (retryVerify.isSold) {
        console.log(`🎯 [IQ Option sell_option VERIFIED RETRY] Order #${numId} verified SOLD on retry! Profit: +$${retryVerify.profit}`);
        return {
          success: true,
          confirmed: true,
          profit: retryVerify.profit,
          rawResult: retryVerify.raw,
        };
      }
    }

    // If broker did NOT confirm the sale or rejected it (e.g. sell_option_disabled, cannot_sell, time_is_not_valid)
    const finalError = lastBrokerError || "Broker rejected early sell or option is not eligible for early sale on this candle.";
    console.warn(`⚠️ [IQ Option sell_option NOT CONFIRMED] Order #${numId} sale was not confirmed by broker. Error: ${finalError}`);
    return {
      success: false,
      confirmed: false,
      error: finalError,
    };
  }

  public disconnect() {
    this.isConnected = false;
    this.isConnecting = false;
    if (this.pingInterval) clearInterval(this.pingInterval);
    if (this.ws) {
      try { this.ws.close(); } catch (e) {}
      this.ws = null;
    }
  }
}

// Global Singleton Instance of IQOptionClient
export const globalIQClient = new IQOptionClient();
