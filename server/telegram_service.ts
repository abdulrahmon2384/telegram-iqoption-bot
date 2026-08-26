import { TelegramClient, Api, sessions, password as tgPasswordUtil } from "telegram";
import { NewMessage } from "telegram/events";
import { formatTimeInTz, getActiveTimezone } from "./timezone_helper";

const { StringSession } = sessions;

export interface TelegramChannelItem {
  id: string;
  title: string;
  username?: string;
  isChannel: boolean;
  isGroup: boolean;
}

export interface TelegramAuthResult {
  success: boolean;
  message?: string;
  error?: string;
  phoneCodeHash?: string;
  tempSession?: string;
  requires2FA?: boolean;
  sessionString?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    phone: string;
  };
  channels?: TelegramChannelItem[];
}

// Timeout helper to ensure no operation blocks server responses
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg: string): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

// In-memory active client cache to maintain connection state across auth steps
const activeAuthClients = new Map<string, { client: TelegramClient; session: any; createdAt: number }>();

function cleanupOldClients() {
  const now = Date.now();
  for (const [key, item] of activeAuthClients.entries()) {
    if (now - item.createdAt > 15 * 60 * 1000) { // 15 min TTL
      try { item.client.disconnect(); } catch (e) {}
      activeAuthClients.delete(key);
    }
  }
}

/**
 * Step 1: Validates API ID & API Hash and establishes MTProto Gateway connection
 */
export async function validateGateway(apiId: number | string, apiHash: string): Promise<{ success: boolean; message: string; error?: string }> {
  try {
    const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;
    if (!id || isNaN(id) || !apiHash || apiHash.length < 10) {
      return { success: false, message: "Invalid API ID or API Hash format." };
    }

    const session = new StringSession("");
    const client = new TelegramClient(session, id, apiHash.trim(), {
      connectionRetries: 2,
      useWSS: false,
      autoReconnect: false,
      timeout: 6000,
    });
    client.setLogLevel("none" as any);
    (client as any)._errorHandler = () => {};

    await withTimeout(client.connect(), 7000, "Connection to Telegram MTProto Gateway timed out after 7s");
    const isConnected = client.connected;
    try { await client.disconnect(); } catch (e) {}

    if (isConnected) {
      return {
        success: true,
        message: "Telegram MTProto Gateway connected successfully! Ready to send code.",
      };
    } else {
      return {
        success: false,
        message: "Failed to connect to Telegram Datacenter. Please verify API ID and Hash.",
      };
    }
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    return {
      success: false,
      message: "Gateway connection error: " + errMsg,
      error: errMsg,
    };
  }
}

/**
 * Step 2: Requests Telegram OTP Code for the specified phone number
 */
export async function sendTelegramCode(
  apiId: number | string,
  apiHash: string,
  phone: string
): Promise<TelegramAuthResult> {
  cleanupOldClients();
  const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;
  const cleanPhone = phone.trim().replace(/\s+/g, "");

  if (!id || isNaN(id) || !apiHash || !cleanPhone) {
    return { success: false, error: "API ID, API Hash, and Phone Number are required." };
  }

  try {
    const session = new StringSession("");
    const client = new TelegramClient(session, id, apiHash.trim(), {
      connectionRetries: 2,
      useWSS: false,
      autoReconnect: true,
      timeout: 8000,
    });
    client.setLogLevel("none" as any);
    (client as any)._errorHandler = () => {};

    await withTimeout(client.connect(), 8000, "Connection to Telegram Gateway timed out");

    // Call sendCode
    const result = await withTimeout(
      client.sendCode(
        {
          apiId: id,
          apiHash: apiHash.trim(),
        },
        cleanPhone
      ),
      10000,
      "Telegram sendCode timed out after 10s"
    );

    const tempSessionStr = client.session.save() as unknown as string;
    const phoneCodeHash = result.phoneCodeHash;

    // Cache the connected client for quick verification
    const clientKey = `${cleanPhone}_${id}`;
    activeAuthClients.set(clientKey, {
      client,
      session,
      createdAt: Date.now(),
    });

    return {
      success: true,
      phoneCodeHash,
      tempSession: tempSessionStr,
      message: `Verification code successfully sent to your Telegram app / SMS (${cleanPhone}).`,
    };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    
    // User-friendly error mapping
    let friendly = errMsg;
    if (errMsg.includes("PHONE_NUMBER_INVALID")) {
      friendly = "Invalid phone number format. Please include country code (e.g., +1234567890).";
    } else if (errMsg.includes("API_ID_INVALID") || errMsg.includes("API_ID_PUBLISHED_FLOOD")) {
      friendly = "Invalid Telegram API ID or API Hash. Please verify at https://my.telegram.org.";
    } else if (errMsg.includes("FLOOD_WAIT")) {
      friendly = "Telegram rate limit: Please wait a few minutes before requesting another code.";
    } else if (errMsg.includes("PHONE_PASSWORD_FLOOD")) {
      friendly = "Too many attempts. Please wait a while before trying again.";
    }

    return {
      success: false,
      error: friendly,
    };
  }
}

/**
 * Step 3: Verifies the OTP code (and optional 2FA password) and exports permanent StringSession
 */
export async function verifyTelegramCode(
  apiId: number | string,
  apiHash: string,
  phone: string,
  code: string,
  phoneCodeHash: string,
  password?: string,
  tempSession?: string
): Promise<TelegramAuthResult> {
  cleanupOldClients();
  const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;
  const cleanPhone = phone.trim().replace(/\s+/g, "");
  const cleanCode = code.trim();

  try {
    const clientKey = `${cleanPhone}_${id}`;
    let clientObj = activeAuthClients.get(clientKey);

    let client: TelegramClient;
    if (clientObj && clientObj.client.connected) {
      client = clientObj.client;
    } else {
      const session = new StringSession(tempSession || "");
      client = new TelegramClient(session, id, apiHash.trim(), {
        connectionRetries: 2,
        useWSS: false,
        autoReconnect: true,
        timeout: 8000,
      });
      client.setLogLevel("none" as any);
      (client as any)._errorHandler = () => {};
      await withTimeout(client.connect(), 8000, "Connection to Telegram Gateway timed out");
    }

    // Attempt Sign In
    try {
      await withTimeout(
        client.invoke(
          new Api.auth.SignIn({
            phoneNumber: cleanPhone,
            phoneCodeHash: phoneCodeHash,
            phoneCode: cleanCode,
          })
        ),
        10000,
        "Sign in verification timed out"
      );
    } catch (err: any) {
      if (err.message && err.message.includes("SESSION_PASSWORD_NEEDED")) {
        if (!password) {
          return {
            success: false,
            requires2FA: true,
            message: "Two-Step Verification (2FA Cloud Password) is enabled on this Telegram account. Please enter your 2FA password.",
          };
        }
        
        // Handle 2FA Password sign in via GramJS
        const pwd = await client.invoke(new Api.account.GetPassword());
        const passwordCheck = await tgPasswordUtil.computeCheck(pwd, password);
        await client.invoke(new Api.auth.CheckPassword({ password: passwordCheck }));
      } else {
        throw err;
      }
    }

    // Sign in succeeded!
    const permanentSessionStr = client.session.save() as unknown as string;
    
    // Fetch Me & Dialogs
    const me: any = await withTimeout(client.getMe(), 6000, "Fetching Telegram profile timed out");
    const channels: TelegramChannelItem[] = [];

    try {
      const dialogs: any = await withTimeout(client.getDialogs({ limit: 30 }), 6000, "Dialogs timeout");
      for (const d of dialogs) {
        if (d.isChannel || d.isGroup) {
          channels.push({
            id: String(d.id),
            title: d.title || d.name || "VIP Signals Channel",
            username: d.entity && "username" in d.entity ? (d.entity as any).username : undefined,
            isChannel: Boolean(d.isChannel),
            isGroup: Boolean(d.isGroup),
          });
        }
      }
    } catch (e) {
      console.warn("Dialogs fetch notice:", e);
    }

    activeAuthClients.delete(clientKey);

    return {
      success: true,
      sessionString: permanentSessionStr,
      user: {
        id: String(me.id || Date.now()),
        firstName: me.firstName || "",
        lastName: me.lastName || "",
        username: me.username || "",
        phone: me.phone || cleanPhone,
      },
      channels,
      message: "Successfully authenticated with Telegram! Session saved permanently.",
    };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    let friendly = errMsg;

    if (errMsg.includes("PHONE_CODE_INVALID") || errMsg.includes("PHONE_CODE_EXPIRED")) {
      friendly = "Invalid or expired verification code. Please request a new code.";
    } else if (errMsg.includes("PASSWORD_HASH_INVALID")) {
      friendly = "Incorrect 2FA Cloud Password. Please verify your password.";
    }

    return {
      success: false,
      error: friendly,
    };
  }
}

/**
 * Validates persistent StringSession
 */
export async function validateTelegramSession(
  apiId: number | string,
  apiHash: string,
  sessionString: string
): Promise<{ authenticated: boolean; user?: any; channels?: TelegramChannelItem[]; error?: string }> {
  if (!sessionString) {
    return { authenticated: false, error: "No session string provided." };
  }

  const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;

  try {
    const session = new StringSession(sessionString);
    const client = new TelegramClient(session, id, apiHash.trim(), {
      connectionRetries: 2,
      useWSS: false,
      autoReconnect: false,
      timeout: 6000,
    });
    client.setLogLevel("none" as any);
    (client as any)._errorHandler = () => {};

    await withTimeout(client.connect(), 6000, "Session validation connection timed out");
    const isAuth = await withTimeout(client.isUserAuthorized(), 4000, "Authorization check timed out");

    if (!isAuth) {
      try { await client.disconnect(); } catch (e) {}
      return { authenticated: false, error: "Session expired or revoked." };
    }

    const me: any = await withTimeout(client.getMe(), 4000, "Profile fetch timed out");
    const channels: TelegramChannelItem[] = [];

    try {
      const dialogs: any = await withTimeout(client.getDialogs({ limit: 30 }), 4000, "Dialog fetch timed out");
      for (const d of dialogs) {
        if (d.isChannel || d.isGroup) {
          channels.push({
            id: String(d.id),
            title: d.title || d.name || "VIP Signals Channel",
            username: d.entity && "username" in d.entity ? (d.entity as any).username : undefined,
            isChannel: Boolean(d.isChannel),
            isGroup: Boolean(d.isGroup),
          });
        }
      }
    } catch (e) {}

    try { await client.disconnect(); } catch (e) {}

    return {
      authenticated: true,
      user: {
        id: String(me.id),
        firstName: me.firstName || "",
        lastName: me.lastName || "",
        username: me.username || "",
        phone: me.phone || "",
      },
      channels,
    };
  } catch (error: any) {
    return {
      authenticated: false,
      error: error?.message || String(error),
    };
  }
}

// Active background Telegram client for live real-time listening
let liveListeningClient: TelegramClient | null = null;
let isListenerActive = false;
let lastMessageReceivedAt = 0;
let totalMessagesReceived = 0;
let lastCatchupEpochMs = 0;

// In-memory cache of channel & group entity metadata (ID -> Title, username)
const channelEntityMap = new Map<string, { title: string; username?: string; entity?: any }>();

// Track processed message keys to guarantee absolute deduplication across live events and backfill queries
const processedMessageKeys = new Set<string>();

export function normalizeChannelIdentifier(channelId: any): string {
  if (!channelId) return "VIP_Channel";
  let str = String(channelId).trim();
  // Strip -100 prefix common in GramJS dialog IDs
  if (str.startsWith("-100")) {
    str = str.slice(4);
  } else if (str.startsWith("-")) {
    str = str.slice(1);
  }
  return str.toLowerCase();
}

function recordProcessedMessageKey(
  channelId: string,
  msgId: number | string | undefined,
  text: string,
  dateEpochMs: number,
  channelTitle?: string
): boolean {
  const normChannel = normalizeChannelIdentifier(channelId);
  const numMsgId = Number(msgId);

  // If a valid Telegram message ID exists, use channelId:msgId as the authoritative unique key
  if (numMsgId && numMsgId > 0) {
    const key = `mid_${normChannel}_${numMsgId}`;
    if (processedMessageKeys.has(key)) {
      return false; // Already processed duplicate
    }
    processedMessageKeys.add(key);
    return true;
  }

  // Fallback for simulated or synthetic inputs
  const cleanText = (text || "").replace(/\s+/g, " ").trim().toLowerCase();
  const timeBucket3s = Math.floor(dateEpochMs / 3000);
  const textHash = cleanText.slice(0, 80);
  const key = `txt_${normChannel}_${timeBucket3s}_${textHash}`;

  if (processedMessageKeys.has(key)) {
    return false;
  }
  processedMessageKeys.add(key);

  // Prevent memory bloat by keeping cache size bounded
  if (processedMessageKeys.size > 10000) {
    const it = processedMessageKeys.values();
    for (let i = 0; i < 500; i++) {
      const val = it.next().value;
      if (val) processedMessageKeys.delete(val);
    }
  }
  return true;
}

export function getTelegramListenerStatus(): {
  active: boolean;
  connected: boolean;
  lastMessageReceivedAt: number;
  totalMessagesReceived: number;
  lastCatchupEpochMs: number;
  cachedChannelsCount: number;
} {
  return {
    active: isListenerActive,
    connected: Boolean(liveListeningClient && liveListeningClient.connected),
    lastMessageReceivedAt,
    totalMessagesReceived,
    lastCatchupEpochMs,
    cachedChannelsCount: channelEntityMap.size,
  };
}

export interface IngestedTelegramMessage {
  channelTitle: string;
  channelId: string;
  rawText: string;
  timestamp: string;
  date: number;
  arrivalEpochMs?: number;
  isBackfill?: boolean;
  msgId?: number;
}

/**
 * Warmed-up entity cache helper: populates all subscribed dialogs and channel access hashes
 */
export async function warmupDialogsCache(client: TelegramClient): Promise<number> {
  try {
    const dialogs: any = await withTimeout(client.getDialogs({ limit: 100 }), 8000, "Dialogs warm-up timed out");
    if (Array.isArray(dialogs)) {
      for (const d of dialogs) {
        const id = String(d.id || (d.entity && d.entity.id) || "");
        const norm = normalizeChannelIdentifier(id);
        const title = d.title || d.name || (d.entity && (d.entity.title || d.entity.username || d.entity.firstName)) || `Channel ${id}`;
        const username = d.entity && "username" in d.entity ? `@${d.entity.username}` : undefined;

        const info = { title, username, entity: d.entity };
        channelEntityMap.set(norm, info);
        if (id) channelEntityMap.set(id, info);
      }
      return channelEntityMap.size;
    }
  } catch (err: any) {
    console.warn("[Dialogs Cache Notice]", err?.message || err);
  }
  return channelEntityMap.size;
}

/**
 * Robust Backfill & Catchup Engine:
 * Fetches all missed Telegram channel messages sent between `sinceEpochMs` and NOW across channels.
 * Runs in parallel batches to prevent socket queuing or delay.
 */
export async function backfillMissedMessages(
  apiId: number | string,
  apiHash: string,
  sessionString: string,
  sinceEpochMs: number,
  onIncomingMessage: (msg: IngestedTelegramMessage) => void,
  targetChannelIds?: string[]
): Promise<{ success: boolean; messagesRetrieved: number; error?: string }> {
  if (!sessionString) {
    return { success: false, messagesRetrieved: 0, error: "No session string." };
  }

  const client = liveListeningClient && liveListeningClient.connected
    ? liveListeningClient
    : null;

  let tempClient: TelegramClient | null = null;
  const activeClient = client || (() => {
    const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;
    tempClient = new TelegramClient(new StringSession(sessionString), id, apiHash.trim(), {
      connectionRetries: 3,
      useWSS: false,
      autoReconnect: false,
      timeout: 8000,
    });
    tempClient.setLogLevel("none" as any);
    (tempClient as any)._errorHandler = () => {};
    return tempClient;
  })();

  try {
    if (!client && tempClient) {
      await withTimeout(tempClient.connect(), 8000, "Backfill connection timed out");
      const isAuth = await tempClient.isUserAuthorized();
      if (!isAuth) {
        try { await tempClient.disconnect(); } catch (e) {}
        return { success: false, messagesRetrieved: 0, error: "Unauthorized session." };
      }
    }

    const currentTz = getActiveTimezone();
    const sinceDateSec = Math.max(0, Math.floor(sinceEpochMs / 1000));
    let totalRetrieved = 0;

    // Fetch user's channels & groups
    const dialogs: any = await withTimeout(activeClient.getDialogs({ limit: 50 }), 6000, "Get dialogs timeout for backfill");

    const channelDialogs = dialogs.filter((d: any) => {
      if (!d.isChannel && !d.isGroup) return false;
      if (targetChannelIds && targetChannelIds.length > 0) {
        const idStr = String(d.id);
        const entityIdStr = d.entity ? String(d.entity.id) : "";
        const username = d.entity && "username" in d.entity ? `@${d.entity.username}` : "";
        return targetChannelIds.includes(idStr) || targetChannelIds.includes(entityIdStr) || (username && targetChannelIds.includes(username));
      }
      return true;
    });

    // Process channels in concurrent chunks of 4 to avoid socket congestion
    const chunkSize = 4;
    for (let i = 0; i < channelDialogs.length; i += chunkSize) {
      const chunk = channelDialogs.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (d: any) => {
          try {
            const channelId = String(d.id || (d.entity && d.entity.id) || "VIP_Channel");
            const channelTitle = d.title || d.name || `Channel ${channelId}`;

            // Save to entity cache
            const norm = normalizeChannelIdentifier(channelId);
            channelEntityMap.set(norm, { title: channelTitle, entity: d.entity });

            const messages: any = await withTimeout(
              activeClient.getMessages(d.entity || d.id, { limit: 15 }),
              2500,
              `Timeout reading ${channelTitle}`
            );

            if (Array.isArray(messages)) {
              const sorted = [...messages].sort((a: any, b: any) => (a.date || 0) - (b.date || 0));

              for (const m of sorted) {
                const msgDateSec = typeof m.date === "number" ? m.date : 0;
                const msgEpochMs = msgDateSec * 1000;

                if (msgDateSec < sinceDateSec) continue;

                const rawText = (m.message || m.text || m.rawText || m.caption || "").trim();
                if (!rawText) continue;

                const isNew = recordProcessedMessageKey(channelId, m.id || 0, rawText, msgEpochMs, channelTitle);
                if (!isNew) continue;

                totalRetrieved++;
                const timeStr = formatTimeInTz(msgEpochMs, currentTz, { withSeconds: true, hour12: false });

                console.log(`[Backfill Caught] [${channelTitle}] at ${timeStr} [${currentTz}]: "${rawText.slice(0, 50)}..."`);

                onIncomingMessage({
                  channelTitle,
                  channelId,
                  rawText,
                  timestamp: timeStr,
                  date: msgEpochMs,
                  arrivalEpochMs: Date.now(),
                  isBackfill: true,
                  msgId: m.id,
                });
              }
            }
          } catch (err: any) {
            // Ignore single channel errors gracefully
          }
        })
      );
    }

    lastCatchupEpochMs = Date.now();
    return { success: true, messagesRetrieved: totalRetrieved };
  } catch (error: any) {
    console.error("[Backfill Error]", error);
    return { success: false, messagesRetrieved: 0, error: error?.message || String(error) };
  } finally {
    if (tempClient) {
      try { await tempClient.disconnect(); } catch (e) {}
    }
  }
}

export async function startLiveTelegramListener(
  apiId: number | string,
  apiHash: string,
  sessionString: string,
  onIncomingMessage: (msg: IngestedTelegramMessage) => void,
  catchupSinceEpochMs?: number
): Promise<{ success: boolean; error?: string }> {
  if (!sessionString) {
    return { success: false, error: "No session string provided for live listener." };
  }

  // If already running and connected, run catchup if requested and return
  if (liveListeningClient && liveListeningClient.connected && isListenerActive) {
    if (catchupSinceEpochMs && catchupSinceEpochMs > 0) {
      backfillMissedMessages(apiId, apiHash, sessionString, catchupSinceEpochMs, onIncomingMessage).catch(() => {});
    }
    return { success: true };
  }

  try {
    const id = typeof apiId === "string" ? parseInt(apiId, 10) : apiId;
    const session = new StringSession(sessionString);

    if (liveListeningClient) {
      try { await liveListeningClient.disconnect(); } catch (e) {}
      liveListeningClient = null;
    }

    liveListeningClient = new TelegramClient(session, id, apiHash.trim(), {
      connectionRetries: 15,
      useWSS: false,
      autoReconnect: true,
      timeout: 10000,
    });
    liveListeningClient.setLogLevel("none" as any);
    (liveListeningClient as any)._errorHandler = (err: any) => {
      if (err?.message === "TIMEOUT" || String(err).includes("TIMEOUT")) {
        return;
      }
      console.warn("[Telegram Listener Notice]", err?.message || err);
    };

    console.log("[Telegram MTProto] Connecting live MTProto listener socket...");
    await liveListeningClient.connect();
    const isAuth = await liveListeningClient.isUserAuthorized();
    if (!isAuth) {
      isListenerActive = false;
      return { success: false, error: "Telegram session is not authorized or expired." };
    }

    isListenerActive = true;

    // CRITICAL: Warm up dialog entities so Telegram MTProto server subscribes this session to channel update diffs
    console.log("[Telegram MTProto] Loading and caching channel dialogs to activate real-time stream...");
    await warmupDialogsCache(liveListeningClient);

    // Instant Real-Time Event Handler: Receives live messages across ALL channels and groups with zero blocking RPCs
    liveListeningClient.addEventHandler(async (event: any) => {
      try {
        const message = event?.message;
        if (!message) return;

        // Resilient text extraction from all potential GramJS fields
        const textContent = message.message || message.text || message.rawText || message.caption || "";
        if (typeof textContent !== "string" || !textContent.trim()) {
          return;
        }

        const rawText = textContent.trim();
        lastMessageReceivedAt = Date.now();
        totalMessagesReceived++;

        // Extract channel ID
        let channelId = "";
        if (message.peerId) {
          if (message.peerId.channelId !== undefined) {
            channelId = String(message.peerId.channelId);
          } else if (message.peerId.chatId !== undefined) {
            channelId = String(message.peerId.chatId);
          } else if (message.peerId.userId !== undefined) {
            channelId = String(message.peerId.userId);
          }
        }
        if (!channelId && message.chatId !== undefined) {
          channelId = String(message.chatId);
        }
        if (!channelId) {
          channelId = "VIP_Channel";
        }

        // Fast synchronous channel title resolution (0ms, no network RPC)
        const normChannel = normalizeChannelIdentifier(channelId);
        let channelTitle = "";

        if (channelEntityMap.has(normChannel)) {
          channelTitle = channelEntityMap.get(normChannel)!.title;
        } else if (channelEntityMap.has(channelId)) {
          channelTitle = channelEntityMap.get(channelId)!.title;
        } else if (message.chat?.title) {
          channelTitle = message.chat.title;
        } else if (message.sender?.title) {
          channelTitle = message.sender.title;
        } else if (message.sender?.firstName) {
          channelTitle = message.sender.firstName;
        } else {
          channelTitle = `Channel ${channelId}`;
        }

        // GramJS provides message.date as integer seconds in UTC
        const msgDateSeconds = typeof message.date === "number" && message.date > 0 ? message.date : Math.floor(Date.now() / 1000);
        const msgEpochMs = msgDateSeconds * 1000;
        const arrivalEpochMs = Date.now();

        // Check deduplication
        const isNew = recordProcessedMessageKey(channelId, message.id || 0, rawText, msgEpochMs, channelTitle);
        if (!isNew) {
          return; // Already processed
        }

        const currentTz = getActiveTimezone();
        const timeStr = formatTimeInTz(msgEpochMs, currentTz, { withSeconds: true, hour12: false });

        console.log(`⚡ [INSTANT TELEGRAM EVENT] Received from "${channelTitle}" (${channelId}) at ${timeStr} [${currentTz}]: "${rawText.slice(0, 60)}"`);

        onIncomingMessage({
          channelTitle,
          channelId,
          rawText,
          timestamp: timeStr,
          date: msgEpochMs,
          arrivalEpochMs,
          isBackfill: false,
          msgId: message.id,
        });
      } catch (err) {
        console.error("Error processing incoming Telegram message event:", err);
      }
    }, new NewMessage({}));

    console.log("⚡ Telegram Live MTProto Event Listener successfully bound & active across all channels in real-time!");

    // Run initial catchup if requested
    if (catchupSinceEpochMs && catchupSinceEpochMs > 0) {
      setTimeout(() => {
        backfillMissedMessages(apiId, apiHash, sessionString, catchupSinceEpochMs, onIncomingMessage).catch((e) => {
          console.warn("[Initial Catchup Notice]:", e?.message || e);
        });
      }, 300);
    }

    return { success: true };
  } catch (error: any) {
    console.error("Failed to initialize Telegram Live MTProto Listener:", error);
    isListenerActive = false;
    return { success: false, error: error?.message || String(error) };
  }
}

export function stopLiveTelegramListener() {
  isListenerActive = false;
  if (liveListeningClient) {
    try {
      liveListeningClient.disconnect();
    } catch (e) {}
    liveListeningClient = null;
  }
}

