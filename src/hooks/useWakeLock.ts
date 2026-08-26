import { useState, useEffect, useRef, useCallback } from "react";

export interface WakeLockState {
  isEnabled: boolean;
  isLocked: boolean;
  isSupported: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  toggleWakeLock: () => Promise<void>;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => Promise<void>;
}

const STORAGE_KEY = "signalbot_screen_awake_enabled";

export function useWakeLock(): WakeLockState {
  const [isEnabled, setIsEnabledState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? saved === "true" : true;
  });

  const [isLocked, setIsLocked] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const wakeLockRef = useRef<any>(null);
  const isEnabledRef = useRef<boolean>(isEnabled);

  useEffect(() => {
    isEnabledRef.current = isEnabled;
  }, [isEnabled]);

  // Check support on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "wakeLock" in navigator) {
      setIsSupported(true);
    }
  }, []);

  // Request Lock
  const requestWakeLock = useCallback(async () => {
    if (typeof window === "undefined" || !("wakeLock" in navigator)) {
      setIsSupported(false);
      return;
    }
    if (!isEnabledRef.current) {
      return;
    }
    try {
      if (wakeLockRef.current !== null && !wakeLockRef.current.released) {
        setIsLocked(true);
        return;
      }
      const sentinel = await (navigator as any).wakeLock.request("screen");
      wakeLockRef.current = sentinel;
      setIsLocked(true);

      sentinel.addEventListener("release", () => {
        setIsLocked(false);
      });
    } catch (err: any) {
      // System denied wake lock or tab is backgrounded
      setIsLocked(false);
    }
  }, []);

  // Release Lock
  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (e) {
        // Ignore release errors
      } finally {
        wakeLockRef.current = null;
        setIsLocked(false);
      }
    }
  }, []);

  // Set Enabled state & persist
  const setEnabled = useCallback(async (enabled: boolean) => {
    setIsEnabledState(enabled);
    isEnabledRef.current = enabled;
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "true" : "false");
    } catch {}

    if (enabled) {
      await requestWakeLock();
    } else {
      await releaseWakeLock();
    }
  }, [requestWakeLock, releaseWakeLock]);

  // Toggle
  const toggleWakeLock = useCallback(async () => {
    await setEnabled(!isEnabledRef.current);
  }, [setEnabled]);

  // Lifecycle & Visibility Change Handler
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isEnabled) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isEnabledRef.current) {
        requestWakeLock();
      }
    };

    const handleFocus = () => {
      if (isEnabledRef.current) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isEnabled, requestWakeLock, releaseWakeLock]);

  return {
    isEnabled,
    isLocked,
    isSupported,
    setEnabled,
    toggleWakeLock,
    requestWakeLock,
    releaseWakeLock,
  };
}
