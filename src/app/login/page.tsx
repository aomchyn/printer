"use client";

import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, Shield, Printer, Eye, EyeOff } from "lucide-react";
import { logAction } from "@/lib/logger";

// Deterministic bar pattern for the barcode graphic (no Math.random -> no hydration mismatch)
const BAR_COUNT = 34;
const BAR_WIDTHS = Array.from({ length: BAR_COUNT }, (_, i) => 2 + ((i * 37) % 5));
const stripThai = (value: string) => value.replace(/[\u0E00-\u0E7F]/g, "");

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

    const bars = useMemo(() => BAR_WIDTHS, []);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        if (!email.trim().includes("@") || !email.trim().includes(".")) {
            setError("กรุณากรอก 'อีเมล' ให้ถูกต้อง");
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (error) throw error;

            await logAction("LOGIN", { email: email.trim() });
            router.push("/printer/dashboard");
        } catch (err) {
            const errorObj = err as Error;
            let errorMessage = errorObj.message || "Failed to login";
            if (errorMessage === "Email not confirmed") {
                errorMessage = "กรุณายืนยันอีเมลของคุณก่อนเข้าใช้งาน";
            } else if (errorMessage === "Invalid login credentials") {
                errorMessage = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lp-root">
            {/* ── Ambient backdrop ── */}
            <div className="lp-grid" aria-hidden="true" />
            <div className="lp-vignette" aria-hidden="true" />
            <div className="lp-floorline" aria-hidden="true" />

            <div className="lp-page">
                <div className="lp-container">

                    {/* ── Brand column ── */}
                    <div className="lp-brand">
                        <div className="lp-brand-mark">
                            <Printer size={18} strokeWidth={2.25} />
                            <span>PRINTER&nbsp;·&nbsp;OP</span>
                        </div>

                        <h1 className="lp-brand-title">
                            ระบบควบคุม
                            <br />
                            การพิมพ์ฉลาก
                        </h1>

                        <p className="lp-brand-sub">
                            ติดตามคำสั่งพิมพ์ฉลากสินค้า
                        </p>
                    </div>

                    {/* ── Ticket / login card ── */}
                    <div className="lp-ticket">
                        <div className="lp-ticket-inner">

                            {/* ticket head: barcode + meta */}
                            <div className="lp-ticket-head">
                                <div className="lp-ticket-meta">
                                    <span className="lp-ticket-no">NO. 000482</span>
                                    <span className="lp-ticket-dot" />
                                    <span className="lp-ticket-line">LINE&nbsp;A3</span>
                                </div>
                                <div className="lp-barcode" aria-hidden="true">
                                    {bars.map((w, i) => (
                                        <span key={i} style={{ width: `${w}px` }} />
                                    ))}
                                    <div className="lp-scanline" />
                                </div>
                            </div>

                            {/* tear-off perforation */}
                            <div className="lp-tear" aria-hidden="true">
                                <span className="lp-notch lp-notch-l" />
                                <i className="lp-tear-rule" />
                                <span className="lp-notch lp-notch-r" />
                            </div>

                            {/* form body */}
                            <div className="lp-body">
                                <h2 className="lp-title">เข้าสู่ระบบ</h2>
                                <p className="lp-subtitle">
                                    ยินดีต้อนรับกลับมา กรุณายืนยันตัวตนเพื่อดำเนินการต่อ
                                </p>

                                {error && (
                                    <div className="lp-error" role="alert">
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            width="15"
                                            height="15"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="12" y1="8" x2="12" y2="12" />
                                            <line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        <span>{error}</span>
                                    </div>
                                )}

                                <form onSubmit={handleLogin} className="lp-form" noValidate>
                                    <div className="lp-field">
                                        <label className="lp-label" htmlFor="email">
                                            อีเมล
                                        </label>
                                        <div className="lp-input-wrap">
                                            <span className="lp-input-icon">
                                                <Mail size={15} />
                                            </span>
                                            <input
                                                id="email"
                                                type="email"
                                                required
                                                autoComplete="email"
                                                className="lp-input"
                                                placeholder="กรอกอีเมลของคุณ"
                                                value={email}
                                                onChange={(e) => setEmail(stripThai(e.target.value))}
                                            />
                                        </div>
                                    </div>

                                    <div className="lp-field">
                                        <label className="lp-label" htmlFor="password">
                                            รหัสผ่าน
                                        </label>
                                        <div className="lp-input-wrap">
                                            <span className="lp-input-icon">
                                                <Lock size={15} />
                                            </span>
                                            <input
                                                id="password"
                                                type={showPassword ? "text" : "password"}
                                                required
                                                autoComplete="current-password"
                                                className="lp-input lp-input--pw"
                                                placeholder="ป้อนรหัสผ่านของคุณ"
                                                value={password}
                                                onChange={(e) => setPassword(stripThai(e.target.value))}
                                            />
                                            <button
                                                type="button"
                                                className="lp-pw-toggle"
                                                onClick={() => setShowPassword((v) => !v)}
                                                aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                                            >
                                                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        type="submit"
                                        className="lp-submit"
                                        disabled={loading}
                                        aria-busy={loading}
                                    >
                                        {loading ? (
                                            <>
                                                <span className="lp-spin">
                                                    <Loader2 size={16} />
                                                </span>
                                                <span>กำลังตรวจสอบข้อมูล...</span>
                                            </>
                                        ) : (
                                            "เข้าสู่ระบบ"
                                        )}
                                    </button>
                                </form>
                            </div>

                            <div className="lp-ticket-foot">
                                <span>PRINTER OP LABEL SYSTEM</span>
                                <span>Created by Rapinlapatchaya </span>
                            </div>
                        </div>
                    </div>

                </div>
            </div>

            {/* ── Scoped styles ── */}
            <style jsx>{`
                :global(:root) {
                    --lp-steel-950: #10141b;
                    --lp-steel-900: #171d26;
                    --lp-steel-800: #1e2632;
                    --lp-steel-700: #2b3542;
                    --lp-steel-600: #3c4756;
                    --lp-paper: #f6f1e6;
                    --lp-paper-dim: #e7dfc9;
                    --lp-ink: #211d18;
                    --lp-accent: #4d8fe0;
                    --lp-accent-deep: #2a63a8;
                    --lp-mist: #8a93a3;
                    --lp-mist-dim: #565f6f;
                }

                .lp-root {
                    font-family: "Sarabun", "Kanit", sans-serif;
                    background: var(--lp-steel-950);
                    min-height: 100vh;
                    min-height: 100dvh;
                    position: relative;
                    overflow-x: hidden;
                }

                .lp-root,
                .lp-root *,
                .lp-root *::before,
                .lp-root *::after {
                    box-sizing: border-box;
                }

                .lp-grid {
                    position: fixed;
                    inset: 0;
                    background-image:
                        linear-gradient(rgba(77, 143, 224, 0.035) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(77, 143, 224, 0.035) 1px, transparent 1px);
                    background-size: 44px 44px;
                    z-index: 0;
                }

                .lp-vignette {
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse 60% 50% at 82% 8%, rgba(77, 143, 224, 0.1) 0%, transparent 60%),
                        radial-gradient(ellipse 70% 60% at 10% 100%, rgba(59, 90, 140, 0.16) 0%, transparent 65%);
                    z-index: 1;
                }

                .lp-floorline {
                    position: fixed;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 1px;
                    background: repeating-linear-gradient(
                        90deg,
                        rgba(77, 143, 224, 0.28) 0px,
                        rgba(77, 143, 224, 0.28) 22px,
                        transparent 22px,
                        transparent 44px
                    );
                    animation: lpFloorScroll 5s linear infinite;
                    z-index: 1;
                }

                @keyframes lpFloorScroll {
                    from { background-position: 0 0; }
                    to   { background-position: -44px 0; }
                }

                .lp-page {
                    position: relative;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    min-height: 100dvh;
                    padding: 2rem;
                    padding-top: calc(2rem + env(safe-area-inset-top));
                    padding-bottom: calc(2rem + env(safe-area-inset-bottom));
                    padding-left: calc(2rem + env(safe-area-inset-left));
                    padding-right: calc(2rem + env(safe-area-inset-right));
                }

                .lp-container {
                    display: flex;
                    align-items: center;
                    gap: 4.5rem;
                    max-width: 980px;
                    width: 100%;
                }

                /* ── Brand column ── */
                .lp-brand {
                    flex: 1;
                    color: white;
                    animation: lpSlideLeft 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }

                @keyframes lpSlideLeft {
                    from { opacity: 0; transform: translateX(-24px); }
                    to   { opacity: 1; transform: translateX(0); }
                }

                .lp-brand-mark {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.4rem 0.8rem;
                    border: 1px solid rgba(77, 143, 224, 0.35);
                    border-radius: 999px;
                    color: var(--lp-accent);
                    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
                    font-size: 0.72rem;
                    font-weight: 600;
                    letter-spacing: 0.14em;
                    margin-bottom: 1.75rem;
                }

                .lp-brand-title {
                    font-family: "Kanit", sans-serif;
                    font-size: 2.35rem;
                    font-weight: 600;
                    color: white;
                    line-height: 1.2;
                    margin-bottom: 1rem;
                }

                .lp-brand-sub {
                    font-size: 0.95rem;
                    color: var(--lp-mist);
                    line-height: 1.8;
                    max-width: 340px;
                }

                .lp-chips {
                    margin-top: 2rem;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.55rem;
                }

                .lp-chip {
                    display: inline-flex;
                    align-items: center;
                    gap: 0.35rem;
                    padding: 0.35rem 0.7rem;
                    font-size: 0.72rem;
                    font-weight: 500;
                    color: var(--lp-mist);
                    border: 1px dashed var(--lp-steel-600);
                    border-radius: 6px;
                    background: rgba(255, 255, 255, 0.02);
                    letter-spacing: 0.02em;
                }

                /* ── Ticket card ── */
                .lp-ticket {
                    width: 420px;
                    flex-shrink: 0;
                    animation: lpTicketFeed 0.65s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                    filter: drop-shadow(0 26px 60px rgba(0, 0, 0, 0.5));
                }

                @keyframes lpTicketFeed {
                    from { opacity: 0; transform: translateY(22px); }
                    to   { opacity: 1; transform: translateY(0); }
                }

                .lp-ticket-inner {
                    background: var(--lp-paper);
                    border-radius: 14px;
                    overflow: hidden;
                    position: relative;
                }

                .lp-ticket-head {
                    padding: 1.3rem 1.6rem 1.1rem;
                    background: var(--lp-paper-dim);
                }

                .lp-ticket-meta {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
                    font-size: 0.68rem;
                    font-weight: 600;
                    letter-spacing: 0.08em;
                    color: var(--lp-mist-dim);
                    margin-bottom: 0.7rem;
                }

                .lp-ticket-no { color: var(--lp-ink); }

                .lp-ticket-dot {
                    width: 3px;
                    height: 3px;
                    border-radius: 50%;
                    background: var(--lp-mist-dim);
                }

                .lp-barcode {
                    position: relative;
                    display: flex;
                    align-items: stretch;
                    gap: 2px;
                    height: 34px;
                    overflow: hidden;
                    border-radius: 3px;
                }

                .lp-barcode span {
                    display: block;
                    background: var(--lp-ink);
                    opacity: 0.82;
                }

                .lp-scanline {
                    position: absolute;
                    top: 0;
                    left: -10%;
                    width: 10%;
                    height: 100%;
                    background: linear-gradient(
                        90deg,
                        transparent,
                        rgba(77, 143, 224, 0.55),
                        transparent
                    );
                    animation: lpScan 3.2s ease-in-out infinite;
                }

                @keyframes lpScan {
                    0%   { left: -10%; }
                    50%  { left: 100%; }
                    100% { left: 100%; }
                }

                /* tear-off perforation */
                .lp-tear {
                    position: relative;
                    height: 14px;
                    background: var(--lp-paper);
                }

                .lp-tear-rule {
                    position: absolute;
                    left: 22px;
                    right: 22px;
                    top: 50%;
                    transform: translateY(-50%);
                    border-top: 1.5px dashed rgba(33, 29, 24, 0.22);
                }

                .lp-notch {
                    position: absolute;
                    top: 50%;
                    transform: translateY(-50%);
                    width: 20px;
                    height: 20px;
                    border-radius: 50%;
                    background: var(--lp-steel-950);
                }

                .lp-notch-l { left: -10px; }
                .lp-notch-r { right: -10px; }

                /* form body */
                .lp-body {
                    padding: 0.6rem 1.6rem 1.7rem;
                }

                .lp-title {
                    font-family: "Kanit", sans-serif;
                    font-size: 1.5rem;
                    font-weight: 600;
                    color: var(--lp-ink);
                    margin-bottom: 0.3rem;
                }

                .lp-subtitle {
                    font-size: 0.82rem;
                    color: rgba(33, 29, 24, 0.58);
                    margin-bottom: 1.4rem;
                    line-height: 1.5;
                }

                .lp-error {
                    display: flex;
                    align-items: center;
                    gap: 0.55rem;
                    padding: 0.65rem 0.9rem;
                    border-radius: 8px;
                    background: rgba(200, 50, 40, 0.08);
                    border: 1px solid rgba(200, 50, 40, 0.22);
                    color: #a3271c;
                    font-size: 0.8rem;
                    margin-bottom: 1.1rem;
                }

                .lp-form { display: flex; flex-direction: column; }

                .lp-field { margin-bottom: 1rem; }

                .lp-label {
                    display: block;
                    font-size: 0.7rem;
                    font-weight: 600;
                    color: rgba(33, 29, 24, 0.55);
                    margin-bottom: 0.4rem;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                }

                .lp-input-wrap { position: relative; }

                .lp-input-icon {
                    position: absolute;
                    left: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: rgba(33, 29, 24, 0.38);
                    pointer-events: none;
                    line-height: 0;
                }

                .lp-input {
                    width: 100%;
                    padding: 0.68rem 1rem 0.68rem 2.4rem;
                    background: rgba(33, 29, 24, 0.035);
                    border: 1px solid rgba(33, 29, 24, 0.14);
                    border-radius: 9px;
                    color: var(--lp-ink);
                    font-size: 16px; /* keeps iOS Safari from auto-zooming on focus */
                    outline: none;
                    transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
                }

                .lp-input::placeholder { color: rgba(33, 29, 24, 0.35); }

                .lp-input:focus-visible {
                    border-color: var(--lp-accent-deep);
                    background: rgba(77, 143, 224, 0.06);
                    box-shadow: 0 0 0 3px rgba(77, 143, 224, 0.18);
                }

                .lp-input--pw { padding-right: 2.9rem; }

                .lp-pw-toggle {
                    position: absolute;
                    right: 4px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: rgba(33, 29, 24, 0.4);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 40px;
                    height: 40px;
                    padding: 0;
                    border-radius: 8px;
                    transition: color 0.15s, background 0.15s;
                    -webkit-tap-highlight-color: transparent;
                }

                .lp-pw-toggle:hover {
                    color: rgba(33, 29, 24, 0.75);
                    background: rgba(33, 29, 24, 0.06);
                }

                .lp-pw-toggle:focus-visible {
                    outline: 2px solid var(--lp-accent-deep);
                    outline-offset: 1px;
                }

                .lp-submit {
                    margin-top: 0.4rem;
                    width: 100%;
                    min-height: 48px;
                    padding: 0.78rem;
                    background: linear-gradient(135deg, var(--lp-accent-deep), var(--lp-accent));
                    border: none;
                    border-radius: 10px;
                    color: #f4f8ff;
                    font-family: "Kanit", sans-serif;
                    font-size: 0.98rem;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    letter-spacing: 0.01em;
                    box-shadow: 0 8px 22px rgba(42, 99, 168, 0.32);
                    transition: transform 0.16s, box-shadow 0.16s, opacity 0.16s;
                    -webkit-tap-highlight-color: transparent;
                }

                .lp-submit:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 10px 26px rgba(42, 99, 168, 0.42);
                }

                .lp-submit:active:not(:disabled) { transform: translateY(0) scale(0.99); }

                .lp-submit:focus-visible {
                    outline: 2px solid var(--lp-ink);
                    outline-offset: 2px;
                }

                .lp-submit:disabled { opacity: 0.65; cursor: not-allowed; }

               .lp-spin {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    animation: lpSpin 0.8s linear infinite;
}

                @keyframes lpSpin {
                    to { transform: rotate(360deg); }
                }

                .lp-ticket-foot {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    padding: 0.65rem 1.6rem;
                    background: var(--lp-steel-900);
                    color: var(--lp-mist-dim);
                    font-family: "JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace;
                    font-size: 0.62rem;
                    letter-spacing: 0.06em;
                }

                /* ── Responsive ── */
                @media (max-width: 800px) {
                    .lp-page { padding: 1.5rem; }
                    .lp-container {
                        flex-direction: column;
                        gap: 1.75rem;
                    }
                    .lp-brand { text-align: center; }
                    .lp-brand-mark { margin-left: auto; margin-right: auto; }
                    .lp-brand-sub { margin-left: auto; margin-right: auto; }
                    .lp-chips { justify-content: center; }
                    .lp-ticket { width: 100%; max-width: 420px; }
                }

                @media (max-width: 480px) {
                    .lp-page {
                        padding: 1rem;
                        padding-top: calc(1.25rem + env(safe-area-inset-top));
                        padding-bottom: calc(1.25rem + env(safe-area-inset-bottom));
                        padding-left: calc(1rem + env(safe-area-inset-left));
                        padding-right: calc(1rem + env(safe-area-inset-right));
                        align-items: flex-start;
                    }
                    .lp-container { gap: 1.5rem; }

                    .lp-brand-mark { font-size: 0.66rem; margin-bottom: 1.1rem; }
                    .lp-brand-title { font-size: 1.7rem; margin-bottom: 0.7rem; }
                    .lp-brand-sub { font-size: 0.85rem; max-width: 100%; }
                    .lp-chips { margin-top: 1.25rem; gap: 0.4rem; }
                    .lp-chip { font-size: 0.68rem; padding: 0.3rem 0.6rem; }

                    .lp-ticket-head { padding: 1.1rem 1.15rem 0.9rem; }
                    .lp-body { padding: 0.6rem 1.15rem 1.35rem; }
                    .lp-ticket-foot { padding: 0.6rem 1.15rem; flex-wrap: wrap; gap: 0.25rem; }
                    .lp-title { font-size: 1.3rem; }
                    .lp-subtitle { font-size: 0.8rem; margin-bottom: 1.15rem; }
                    .lp-tear-rule { left: 16px; right: 16px; }

                    .lp-barcode { height: 28px; }
                }

                /* Very short viewports (landscape phones, small tablets) */
                @media (max-height: 640px) and (max-width: 800px) {
                    .lp-page { align-items: flex-start; }
                    .lp-brand { display: none; }
                    .lp-container { justify-content: center; }
                }

                /* ── Reduced motion ── */
                @media (prefers-reduced-motion: reduce) {
                    .lp-brand,
                    .lp-ticket,
                    .lp-floorline,
                    .lp-scanline,
                    .lp-spin {
                        animation: none !important;
                    }
                }
            `}</style>
        </div>
    );
}