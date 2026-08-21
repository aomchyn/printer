"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

// Production = 8 ชั่วโมง
const SESSION_LIFETIME_MS = 8 * 60 * 60 * 1000;

// ตรวจซ้ำทุก 1 นาที เผื่อ browser sleep / timer ถูก throttle
const CHECK_INTERVAL_MS = 60 * 1000;

export default function SessionExpiryGuard() {
  const router = useRouter();

  const expiringRef = useRef(false);
  const expiresAtRef = useRef<number | null>(null);

  useEffect(() => {
    let active = true;

    const logoutExpiredSession = async () => {
      if (expiringRef.current) return;

      expiringRef.current = true;

      try {
        // Logout เฉพาะ session/device นี้
        await supabase.auth.signOut({
          scope: "local",
        });
      } catch (error) {
        console.error("Automatic session logout failed:", error);
      } finally {
        expiresAtRef.current = null;

        if (active) {
          router.replace("/login?reason=session_expired");
          router.refresh();
        }
      }
    };

    const setExpiryFromSession = (
      lastSignInAt?: string | null,
    ) => {
      if (!lastSignInAt) {
        expiresAtRef.current = null;
        return;
      }

      const signedInAt = Date.parse(lastSignInAt);

      if (!Number.isFinite(signedInAt)) {
        expiresAtRef.current = null;
        return;
      }

      expiresAtRef.current =
        signedInAt + SESSION_LIFETIME_MS;
    };

    const checkSessionExpiry = async () => {
      if (expiringRef.current) return;

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (error) {
        console.error("Session expiry check failed:", error);
        return;
      }

      if (!session) {
        expiresAtRef.current = null;
        return;
      }

      setExpiryFromSession(
        session.user.last_sign_in_at,
      );

      const expiresAt = expiresAtRef.current;

      if (expiresAt !== null && Date.now() >= expiresAt) {
        await logoutExpiredSession();
      }
    };

    // ตรวจทันทีตอนเปิดเว็บ / refresh
    checkSessionExpiry();

    // ตรวจทุก 1 นาที
    const interval = window.setInterval(
      checkSessionExpiry,
      CHECK_INTERVAL_MS,
    );

    // กลับมาที่ browser ให้ตรวจทันที
    const handleFocus = () => {
      checkSessionExpiry();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkSessionExpiry();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );

    // จับการ login/logout/token refresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "SIGNED_OUT") {
          expiresAtRef.current = null;
          expiringRef.current = false;
          return;
        }

        if (session) {
          setExpiryFromSession(
            session.user.last_sign_in_at,
          );

          const expiresAt = expiresAtRef.current;

          if (
            expiresAt !== null &&
            Date.now() >= expiresAt
          ) {
            void logoutExpiredSession();
          }
        }
      },
    );

    return () => {
      active = false;

      window.clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );

      subscription.unsubscribe();
    };
  }, [router]);

  return null;
}