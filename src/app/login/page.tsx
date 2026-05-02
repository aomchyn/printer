"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock, Shield, Printer, Eye, EyeOff } from "lucide-react";
import { logAction } from "@/lib/logger";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const router = useRouter();

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
        <div className="login-page-root">
            {/* ── Backgrounds ── */}
            <div className="login-bg-mesh" />
            <div className="login-grid-overlay" />
            <div className="login-orb login-orb-1" />
            <div className="login-orb login-orb-2" />
            <div className="login-orb login-orb-3" />

            {/* ── Page wrapper ── */}
            <div className="login-page">
                <div className="login-container">

                    {/* ── Left brand panel ── */}
                    <div className="login-brand-panel">
                        <div className="login-brand-icon">
                            <Printer size={30} color="white" />
                        </div>

                        <h1 className="login-brand-title">
                            Printer OP<br />
                            <span>Label System</span>
                        </h1>

                        <p className="login-brand-subtitle">
                            ระบบจัดการคำสั่งพิมพ์ฉลากสินค้าและปั๊มถุง
                        </p>
                    </div>

                    {/* ── Login card ── */}
                    <div className="login-card">
                        <div className="login-card-accent" />

                        <h2 className="login-card-title">เข้าสู่ระบบ</h2>
                        <p className="login-card-subtitle">
                            ยินดีต้อนรับกลับมา<br></br>กรุณายืนยันตัวตนเพื่อดำเนินการต่อ
                        </p>

                        {/* Error */}
                        {error && (
                            <div className="login-error-box">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16"
                                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="12" y1="8" x2="12" y2="12" />
                                    <line x1="12" y1="16" x2="12.01" y2="16" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        )}

                        <form onSubmit={handleLogin} className="login-form">
                            {/* Email */}
                            <div className="login-form-group">
                                <label className="login-form-label" htmlFor="email">
                                    อีเมล
                                </label>
                                <div className="login-input-wrapper">
                                    <div className="login-input-icon">
                                        <Mail size={16} />
                                    </div>
                                    <input
                                        id="email"
                                        type="email"
                                        required
                                        className="login-form-input"
                                        placeholder="กรอกอีเมลของคุณ"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                    />
                                </div>
                            </div>

                            {/* Password */}
                            <div className="login-form-group">
                                <label className="login-form-label" htmlFor="password">
                                    รหัสผ่าน
                                </label>
                                <div className="login-input-wrapper">
                                    <div className="login-input-icon">
                                        <Lock size={16} />
                                    </div>
                                    <input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        required
                                        className="login-form-input login-form-input--password"
                                        placeholder="ป้อนรหัสผ่านของคุณ"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        className="login-password-toggle"
                                        onClick={() => setShowPassword((v) => !v)}
                                        aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
                                    >
                                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                    </button>
                                </div>
                            </div>

                            <div className="login-divider" />

                            <button
                                type="submit"
                                className="login-btn-submit"
                                disabled={loading}
                            >
                                {loading ? (
                                    <>
                                        <Loader2 className="animate-spin" size={18} />
                                        <span>กำลังเข้าสู่ระบบ...</span>
                                    </>
                                ) : (
                                    "เข้าสู่ระบบ"
                                )}
                            </button>
                        </form>
                    </div>

                </div>
            </div>

            {/* ── Scoped styles ── */}
            <style jsx>{`
                .login-page-root {
                    font-family: 'Sarabun', 'Kanit', sans-serif;
                    background: #060e1f;
                    min-height: 100vh;
                    position: relative;
                    overflow: hidden;
                }

                /* Mesh background */
                .login-bg-mesh {
                    position: fixed;
                    inset: 0;
                    background:
                        radial-gradient(ellipse 80% 60% at 20% 20%, rgba(30,80,180,0.35) 0%, transparent 60%),
                        radial-gradient(ellipse 60% 80% at 80% 80%, rgba(14,50,120,0.4) 0%, transparent 60%),
                        radial-gradient(ellipse 50% 50% at 50% 50%, rgba(10,30,80,0.5) 0%, transparent 70%),
                        #060e1f;
                    z-index: 0;
                }

                /* Grid overlay */
                .login-grid-overlay {
                    position: fixed;
                    inset: 0;
                    background-image:
                        linear-gradient(rgba(59,130,246,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(59,130,246,0.04) 1px, transparent 1px);
                    background-size: 48px 48px;
                    z-index: 1;
                }

                /* Floating orbs */
                .login-orb {
                    position: fixed;
                    border-radius: 50%;
                    filter: blur(60px);
                    opacity: 0.18;
                    animation: loginFloat 8s ease-in-out infinite;
                    z-index: 2;
                }
                .login-orb-1 {
                    width: 500px; height: 500px;
                    background: #1d4ed8;
                    top: -150px; left: -150px;
                    animation-delay: 0s;
                }
                .login-orb-2 {
                    width: 350px; height: 350px;
                    background: #1e40af;
                    bottom: -100px; right: -100px;
                    animation-delay: -4s;
                }
                .login-orb-3 {
                    width: 220px; height: 220px;
                    background: #3b82f6;
                    top: 50%; right: 15%;
                    animation-delay: -2s;
                }

                @keyframes loginFloat {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    50%       { transform: translateY(-24px) scale(1.05); }
                }

                /* Page layout */
                .login-page {
                    position: relative;
                    z-index: 10;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 100vh;
                    padding: 2rem;
                }

                .login-container {
                    display: flex;
                    align-items: center;
                    gap: 4.5rem;
                    max-width: 960px;
                    width: 100%;
                }

                /* Brand panel */
                .login-brand-panel {
                    flex: 1;
                    color: white;
                    animation: loginSlideLeft 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
                }

                @keyframes loginSlideLeft {
                    from { opacity: 0; transform: translateX(-28px); }
                    to   { opacity: 1; transform: translateX(0); }
                }

                .login-brand-icon {
                    width: 60px; height: 60px;
                    background: linear-gradient(135deg, #1d4ed8, #3b82f6);
                    border-radius: 16px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin-bottom: 1.75rem;
                    box-shadow: 0 0 36px rgba(59,130,246,0.35);
                }

                .login-brand-title {
                    font-family: 'Kanit', sans-serif;
                    font-size: 2.25rem;
                    font-weight: 600;
                    color: white;
                    line-height: 1.15;
                    margin-bottom: 0.75rem;
                }

                .login-brand-title span {
                    background: linear-gradient(90deg, #60a5fa, #93c5fd);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                }

                .login-brand-subtitle {
                    font-size: 0.95rem;
                    color: rgba(148,163,184,0.82);
                    line-height: 1.75;
                    max-width: 320px;
                }

                .login-features {
                    margin-top: 2.25rem;
                    display: flex;
                    flex-direction: column;
                    gap: 0.9rem;
                }

                .login-feature-item {
                    display: flex;
                    align-items: center;
                    gap: 0.7rem;
                    color: rgba(203,213,225,0.78);
                    font-size: 0.875rem;
                }

                .login-feature-dot {
                    width: 7px; height: 7px;
                    border-radius: 50%;
                    background: linear-gradient(135deg, #2563eb, #60a5fa);
                    flex-shrink: 0;
                    box-shadow: 0 0 8px rgba(96,165,250,0.55);
                }

                /* Login card */
                .login-card {
                    width: 410px;
                    flex-shrink: 0;
                    background: rgba(13,22,45,0.85);
                    border: 1px solid rgba(59,130,246,0.18);
                    border-radius: 24px;
                    padding: 2.25rem;
                    backdrop-filter: blur(24px);
                    box-shadow:
                        0 0 0 1px rgba(59,130,246,0.07),
                        0 24px 64px rgba(0,0,0,0.55),
                        inset 0 1px 0 rgba(255,255,255,0.05);
                    animation: loginSlideRight 0.7s cubic-bezier(0.16,1,0.3,1) forwards;
                }

                @keyframes loginSlideRight {
                    from { opacity: 0; transform: translateX(28px); }
                    to   { opacity: 1; transform: translateX(0); }
                }

                .login-card-accent {
                    width: 44px; height: 3px;
                    background: linear-gradient(90deg, #1d4ed8, #60a5fa);
                    border-radius: 99px;
                    margin-bottom: 1.6rem;
                }

                .login-card-title {
                    font-family: 'Kanit', sans-serif;
                    font-size: 1.7rem;
                    font-weight: 600;
                    color: white;
                    margin-bottom: 0.35rem;
                }

                .login-card-subtitle {
                    font-size: 0.85rem;
                    color: rgba(148,163,184,0.72);
                    margin-bottom: 1.75rem;
                    line-height: 1.5;
                }

                /* Error box */
                .login-error-box {
                    display: flex;
                    align-items: center;
                    gap: 0.6rem;
                    padding: 0.75rem 1rem;
                    border-radius: 10px;
                    background: rgba(239,68,68,0.12);
                    border: 1px solid rgba(239,68,68,0.25);
                    color: #fca5a5;
                    font-size: 0.85rem;
                    margin-bottom: 1.25rem;
                }

                /* Form */
                .login-form { display: flex; flex-direction: column; gap: 0; }

                .login-form-group { margin-bottom: 1.1rem; }

                .login-form-label {
                    display: block;
                    font-size: 0.75rem;
                    font-weight: 500;
                    color: rgba(148,163,184,0.88);
                    margin-bottom: 0.45rem;
                    letter-spacing: 0.06em;
                    text-transform: uppercase;
                }

                .login-input-wrapper { position: relative; }

                .login-input-icon {
                    position: absolute;
                    left: 13px;
                    top: 50%;
                    transform: translateY(-50%);
                    color: rgba(100,116,139,0.65);
                    pointer-events: none;
                    display: flex;
                    align-items: center;
                }

                .login-form-input {
                    width: 100%;
                    padding: 0.7rem 1rem 0.7rem 2.6rem;
                    background: rgba(255,255,255,0.04);
                    border: 1px solid rgba(59,130,246,0.18);
                    border-radius: 11px;
                    color: white;
                    font-size: 0.92rem;
                    outline: none;
                    transition: border-color 0.2s, background 0.2s, box-shadow 0.2s;
                }

                .login-form-input::placeholder { color: rgba(100,116,139,0.55); }

                .login-form-input:focus {
                    border-color: rgba(59,130,246,0.55);
                    background: rgba(59,130,246,0.07);
                    box-shadow: 0 0 0 3px rgba(59,130,246,0.12);
                }

                .login-divider {
                    height: 1px;
                    background: rgba(59,130,246,0.1);
                    margin: 1.25rem 0;
                }

                /* Submit button */
                .login-btn-submit {
                    width: 100%;
                    padding: 0.82rem;
                    background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%);
                    border: none;
                    border-radius: 12px;
                    color: white;
                    font-family: 'Kanit', sans-serif;
                    font-size: 1rem;
                    font-weight: 500;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    letter-spacing: 0.03em;
                    box-shadow: 0 4px 20px rgba(29,78,216,0.38);
                    transition: all 0.22s;
                }

                .login-btn-submit:hover:not(:disabled) {
                    transform: translateY(-1px);
                    box-shadow: 0 8px 28px rgba(29,78,216,0.5);
                }

                .login-btn-submit:active:not(:disabled) { transform: translateY(0); }

                .login-btn-submit:disabled { opacity: 0.55; cursor: not-allowed; }

                .login-form-input--password {
                    padding-right: 2.75rem;
                }

                .login-password-toggle {
                    position: absolute;
                    right: 12px;
                    top: 50%;
                    transform: translateY(-50%);
                    background: none;
                    border: none;
                    cursor: pointer;
                    color: rgba(100,116,139,0.6);
                    display: flex;
                    align-items: center;
                    padding: 4px;
                    border-radius: 6px;
                    transition: color 0.18s, background 0.18s;
                }

                .login-password-toggle:hover {
                    color: rgba(148,163,184,0.95);
                    background: rgba(59,130,246,0.12);
                }

                .login-form-input--password::-ms-reveal,
                .login-form-input--password::-ms-clear {
                 display: none;
                }

                /* Security badge */
                .login-security-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.45rem;
                    margin-top: 1.4rem;
                    color: rgba(100,116,139,0.55);
                    font-size: 0.72rem;
                }

                /* Responsive */
                @media (max-width: 768px) {
                    .login-container {
                        flex-direction: column;
                        gap: 2rem;
                        align-items: center;
                    }
                    .login-brand-panel {
                        text-align: center;
                        align-items: center;
                    }
                    .login-brand-icon { margin: 0 auto 1.5rem; }
                    .login-brand-subtitle { max-width: 100%; }
                    .login-features { align-items: center; }
                    .login-card { width: 100%; max-width: 400px; }
                }
            `}</style>
        </div>
    );
}