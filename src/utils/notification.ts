/**
 * Native-Like Sound, Alert, Vibration & Push Notification Utility
 */

// Web Audio synthesizer for zero-asset latency-free native audio
let audioCtx: AudioContext | null = null;

export function getAudioContext(): AudioContext | null {
  try {
    if (typeof window === "undefined") return null;
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended") {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

/**
 * Unlock AudioContext on first user gesture
 */
export function unlockAudio() {
  const ctx = getAudioContext();
  if (ctx && ctx.state === "suspended") {
    ctx.resume().catch(() => {});
  }
}

// Auto unlock on first document click or keypress
if (typeof window !== "undefined") {
  const handleFirstUserGesture = () => {
    unlockAudio();
    window.removeEventListener("click", handleFirstUserGesture);
    window.removeEventListener("touchstart", handleFirstUserGesture);
    window.removeEventListener("keydown", handleFirstUserGesture);
  };
  window.addEventListener("click", handleFirstUserGesture, { once: true });
  window.addEventListener("touchstart", handleFirstUserGesture, { once: true });
  window.addEventListener("keydown", handleFirstUserGesture, { once: true });
}

/**
 * Trigger native mobile haptic feedback if supported
 */
export function triggerHapticFeedback(pattern: number | number[] = 50) {
  try {
    if (typeof window !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(pattern);
    }
  } catch {}
}

/**
 * 🟢 Plays a triumphant ascending 3-tone chime for WIN outcomes
 */
export function playTradeWinSound(volume: number = 0.3) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    // C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    const durations = [0.10, 0.10, 0.14, 0.35];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = now + i * 0.09;
      const duration = durations[i];

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });

    // Native mobile haptic vibration
    triggerHapticFeedback([80, 50, 120]);
  } catch (e) {
    console.warn("Audio win chime error:", e);
  }
}

/**
 * 🔴 Plays a soft, low 2-tone chime for LOSS outcomes
 */
export function playTradeLossSound(volume: number = 0.25) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const notes = [392.00, 329.63, 261.63]; // G4, E4, C4
    const durations = [0.12, 0.15, 0.32];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = now + i * 0.12;
      const duration = durations[i];

      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });

    // Native mobile haptic vibration
    triggerHapticFeedback([180, 80, 180]);
  } catch (e) {
    console.warn("Audio loss chime error:", e);
  }
}

/**
 * ⚡ Plays a crisp dual-beep for new VIP Signal Detected
 */
export function playSignalAlertSound(volume: number = 0.25) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const notes = [880.0, 1174.66]; // A5, D6
    const durations = [0.08, 0.18];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startTime = now + i * 0.09;
      const duration = durations[i];

      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.exponentialRampToValueAtTime(volume, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.04);
    });

    triggerHapticFeedback([50, 40, 60]);
  } catch (e) {
    console.warn("Signal alert audio error:", e);
  }
}

/**
 * 🎯 Plays a swift mechanical blip when a trade executes on broker
 */
export function playTradeExecutedSound(volume: number = 0.2) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(659.25, now); // E5
    osc.frequency.exponentialRampToValueAtTime(880.0, now + 0.08); // slide to A5

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);

    triggerHapticFeedback(40);
  } catch (e) {
    console.warn("Trade executed audio error:", e);
  }
}

/**
 * Check if browser notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Current notification permission status
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission;
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";
  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch {
    return Notification.permission || "denied";
  }
}

/**
 * Sends a system browser push notification when a trade exits
 */
export function sendTradeExitNotification(params: {
  asset: string;
  action: "CALL" | "PUT";
  outcome: "WIN" | "LOSS" | "DRAW" | "SKIPPED" | "FAILED";
  profit?: number;
  stake: number;
  managementLevel: number;
  orderId?: string;
  accountMode: string;
}) {
  if (!isNotificationSupported() || Notification.permission !== "granted") {
    return;
  }

  const { asset, action, outcome, profit, stake, managementLevel, orderId, accountMode } = params;

  let title = "";
  let body = "";
  const icon = "/icon.svg";

  const levelStr = managementLevel > 0 ? ` (L${managementLevel} Martingale)` : " (Direct)";
  const modeStr = accountMode === "REAL" ? "REAL" : "DEMO";

  if (outcome === "WIN") {
    title = `🟢 TRADE WON: +$${(profit || 0).toFixed(2)} | ${asset}`;
    body = `IQ Option ${modeStr}: ${action} on ${asset}${levelStr} closed in PROFIT! Order #${orderId || "N/A"}`;
  } else if (outcome === "LOSS") {
    title = `🔴 TRADE LOSS: -$${stake.toFixed(2)} | ${asset}`;
    body = `IQ Option ${modeStr}: ${action} on ${asset}${levelStr} closed OTM. Next management level checking...`;
  } else if (outcome === "DRAW") {
    title = `⚪ TRADE DRAW: $0.00 | ${asset}`;
    body = `IQ Option ${modeStr}: ${action} on ${asset} ended in a DRAW (Stake refunded).`;
  } else if (outcome === "SKIPPED") {
    title = `⚠️ TRADE SKIPPED: ${asset}`;
    body = `Signal for ${asset} ${action} was skipped per risk/timing protection rules.`;
  }

  if (title) {
    try {
      const notif = new Notification(title, {
        body,
        icon,
        tag: `trade-${orderId || Date.now()}`,
        requireInteraction: false,
      });

      // Auto close notification after 8 seconds
      setTimeout(() => {
        try { notif.close(); } catch {}
      }, 8000);
    } catch (e) {
      console.warn("Failed to display system notification:", e);
    }
  }
}
