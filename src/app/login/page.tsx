"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { logAction } from "@/lib/logger";

export default function LoginPage() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        // Explicit validation to enforce email-only login
        if (!email.trim().includes("@") || !email.trim().includes(".")) {
            setError("กรุณากรอก 'อีเมล' ให้ถูกต้อง ");
            setLoading(false);
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password,
            });

            if (error) throw error;

            await logAction('LOGIN', { email: email.trim() });

            router.push("/printer/dashboard");
        } catch (err) {
            const errorObj = err as Error;
            let errorMessage = errorObj.message || "Failed to login";
            if (errorMessage === "Email not confirmed") {
                errorMessage = "กรุณายืนยันอีเมลของคุณก่อนเข้าใช้งาน ";
            } else if (errorMessage === "Invalid login credentials") {
                errorMessage = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
            }
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="theme-bg flex items-center justify-center p-4">
            <div className="login-box animate-slide-up">
                <h1 className="gradient-title text-4xl text-center mb-2">
                    ยินดีต้อนรับ
                </h1>
                <h2 className="text-gray-400 text-center mb-8 text-lg">
                    เข้าสู่ระบบด้วยอีเมลเพื่อสั่งพิมพ์ฉลากสินค้า
                </h2>

                {error && (
                    <div className="mb-6 p-4 rounded-lg bg-red-500/20 backdrop-blur-sm text-red-200 text-sm border border-red-500/30 flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                        <span>{error}</span>
                    </div>
                )}

                <form onSubmit={handleLogin} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <label className="form-label-dark" htmlFor="email">
                            อีเมล
                        </label>
                        <input
                            id="email"
                            type="email"
                            required
                            className="form-input-dark"
                            placeholder="โปรดกรอกอีเมลของท่านเพื่อเข้าสู่ระบบ"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                            <label className="form-label-dark" htmlFor="password" style={{ margin: 0 }}>
                                รหัสผ่าน
                            </label>
                        </div>
                        <input
                            id="password"
                            type="password"
                            required
                            className="form-input-dark"
                            placeholder="••••••••••"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn-gradient mt-2 flex items-center justify-center gap-2"
                        disabled={loading}
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin" size={20} />
                                <span>กำลังเข้าสู่ระบบ...</span>
                            </>
                        ) : (
                            "เข้าสู่ระบบ"
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
}
