'use client'

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Swal from "sweetalert2"
import { useRouter } from "next/navigation"
import { Search, History, RefreshCcw, ShieldAlert, X, ShieldOff } from "lucide-react"

interface AuditLog {
    id: string
    user_id?: string | null
    user_name?: string | null
    action: string
    details?: Record<string, unknown> | null
    changes?: Record<string, unknown> | null
    summary?: string | null
    order_id?: number | null
    ip_address?: string | null
    created_at: string
    users?: {
        name: string
        email: string
    } | { name: string; email: string }[] | null
}

// ─── Access Denied UI ───────────────────────────────────────────────────────
function AccessDenied() {
    const router = useRouter()
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
            <div className="bg-white/5 border border-rose-500/30 rounded-2xl p-10 max-w-md w-full shadow-2xl backdrop-blur-xl">
                <div className="w-16 h-16 bg-rose-500/20 border border-rose-500/30 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <ShieldOff className="w-8 h-8 text-rose-400" />
                </div>
                <h2 className="text-2xl font-black text-white mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-white/60 text-sm mb-1">
                    หน้านี้สงวนไว้สำหรับ <span className="font-bold text-rose-300">Moderator</span> เท่านั้น
                </p>
                <p className="text-white/30 text-xs mb-7">
                    กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นข้อผิดพลาด
                </p>
                <button
                    onClick={() => router.push('/printer/dashboard')}
                    className="bg-rose-500/80 hover:bg-rose-500 text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm border border-rose-400/30 shadow-lg shadow-rose-900/30 active:scale-95"
                >
                    กลับหน้าหลัก
                </button>
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function LogsManagement() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')
    const [accessStatus, setAccessStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')
    const router = useRouter()

    // ─── Guard: เฉพาะ moderator เท่านั้น ──────────────────────────────────────
    useEffect(() => {
        const checkAccess = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession()
                if (!session) {
                    router.push('/login')
                    return
                }

                const { data } = await supabase
                    .from('users')
                    .select('role')
                    .eq('id', session.user.id)
                    .single()

                if (data?.role === 'moderator') {
                    setAccessStatus('allowed')
                    fetchLogs()
                } else {
                    setAccessStatus('denied')
                }
            } catch (error) {
                console.error('Access check error:', error)
                router.push('/login')
            }
        }

        checkAccess()
    }, [])

    const fetchLogs = async () => {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from('audit_logs')
                .select(`
          id,
          user_id,
          user_name,
          action,
          details,
          changes,
          summary,
          order_id,
          ip_address,
          created_at,
          users (name, email)
        `)
                .order('created_at', { ascending: false })
                .limit(200)

            if (error) throw error
            if (data) setLogs(data as AuditLog[])
        } catch (error) {
            console.error('Error fetching logs:', error)
            Swal.fire({
                icon: 'error',
                title: 'ผิดพลาด',
                text: 'ไม่สามารถดึงข้อมูลประวัติการทำรายการได้'
            })
        } finally {
            setLoading(false)
        }
    }

    const getDisplayName = (log: AuditLog): string => {
        if (log.user_name) return log.user_name
        if (log.users) {
            const u = Array.isArray(log.users) ? log.users[0] : log.users
            if (u?.name) return u.name
        }
        return 'ไม่ระบุผู้ใช้'
    }

    const getDisplayEmail = (log: AuditLog): string => {
        if (log.users) {
            const u = Array.isArray(log.users) ? log.users[0] : log.users
            if (u?.email) return u.email
        }
        return ''
    }

    const getDisplayDetail = (log: AuditLog) => {
        const data = log.details || log.changes
        const summary = log.summary

        if ((log.action === 'DELETE_ORDER' || log.action === 'PERMANENT_DELETE_ORDER') && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    <div><span className="text-blue-300/60">สินค้า:</span> <span className="font-semibold text-white">{d.product_name}</span></div>
                    <div><span className="text-blue-300/60">รหัส:</span> <span className="text-white/70">{d.product_id}</span></div>
                    <div><span className="text-blue-300/60">ลอต:</span> <span className="font-semibold text-indigo-300">{d.lot_number}</span></div>
                    <div><span className="text-blue-300/60">จำนวน:</span> <span className="text-white/70">{d.quantity}</span></div>
                    <div><span className="text-blue-300/60">ผู้สั่ง:</span> <span className="text-white/70">{d.created_by}</span></div>
                    <div><span className="text-blue-300/60">ลบโดย:</span> <span className="font-semibold text-rose-400">{d.deleted_by}</span></div>
                </div>
            )
        }

        if (log.action === 'RESTORE_FROM_TRASH' && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    <div><span className="text-blue-300/60">สินค้า:</span> <span className="font-semibold text-white">{d.product_name}</span></div>
                    <div><span className="text-blue-300/60">ลอต:</span> <span className="font-semibold text-indigo-300">{d.lot_number}</span></div>
                    <div><span className="text-blue-300/60">กู้คืนโดย:</span> <span className="font-semibold text-emerald-400">{d.restored_by}</span></div>
                </div>
            )
        }

        if (summary) {
            return (
                <div className="text-xs space-y-0.5">
                    <div className="text-white/80">{summary}</div>
                    {log.order_id && (
                        <div><span className="text-blue-300/60">Order ID:</span> <span className="font-medium text-indigo-300">#{log.order_id}</span></div>
                    )}
                </div>
            )
        }

        if (data) {
            return (
                <code className="text-xs bg-white/8 border border-white/12 text-white/60 px-2 py-1 rounded block truncate" title={JSON.stringify(data, null, 2)}>
                    {JSON.stringify(data)}
                </code>
            )
        }

        return <span className="text-white/30 text-xs">—</span>
    }

    const filteredLogs = logs.filter(log => {
        const search = searchTerm.toLowerCase()
        const displayName = getDisplayName(log).toLowerCase()
        const action = log.action.toLowerCase()
        const detailsString = JSON.stringify(log.details || log.changes || log.summary || '').toLowerCase()
        return displayName.includes(search) || action.includes(search) || detailsString.includes(search)
    })

    // ── Action badge — dark-glass palette ────────────────────────────────────
    const formatAction = (action: string) => {
        const base = "px-2 py-1 rounded-lg text-[11px] font-black tracking-wide whitespace-nowrap"
        switch (action) {
            case 'LOGIN': return <span className={`${base} bg-blue-500/20 text-blue-300 border border-blue-500/25`}>เข้าสู่ระบบ</span>
            case 'CREATE_PRODUCT': return <span className={`${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/25`}>เพิ่มสินค้า</span>
            case 'UPDATE_PRODUCT': return <span className={`${base} bg-amber-500/20 text-amber-300 border border-amber-500/25`}>แก้ไขสินค้า</span>
            case 'DELETE_PRODUCT': return <span className={`${base} bg-rose-500/20 text-rose-300 border border-rose-500/25`}>ลบสินค้า</span>
            case 'CREATE_ORDER': return <span className={`${base} bg-indigo-500/20 text-indigo-300 border border-indigo-500/25`}>สั่งพิมพ์ฉลาก</span>
            case 'DELETE_ORDER': return <span className={`${base} bg-rose-600/25 text-rose-300 border border-rose-500/30`}>🗑️ ลบคำสั่งพิมพ์</span>
            case 'PERMANENT_DELETE_ORDER': return <span className={`${base} bg-rose-800/30 text-rose-200 border border-rose-700/40`}>🗑️ ลบถาวร</span>
            case 'RESTORE_FROM_TRASH': return <span className={`${base} bg-emerald-500/20 text-emerald-300 border border-emerald-500/25`}>♻️ กู้คืนจากถังขยะ</span>
            case 'UPDATE': return <span className={`${base} bg-amber-500/20 text-amber-300 border border-amber-500/25`}>✏️ แก้ไขคำสั่งพิมพ์</span>
            case 'VERIFY': return <span className={`${base} bg-emerald-500/25 text-emerald-200 border border-emerald-500/30`}>✅ ยืนยันตรวจสอบ</span>
            case 'CANCEL': return <span className={`${base} bg-orange-500/20 text-orange-300 border border-orange-500/25`}>❌ ยกเลิกคำสั่งพิมพ์</span>
            case 'CREATE_USER': return <span className={`${base} bg-purple-500/20 text-purple-300 border border-purple-500/25`}>เพิ่มผู้ใช้</span>
            case 'UPDATE_USER': return <span className={`${base} bg-orange-500/20 text-orange-300 border border-orange-500/25`}>แก้ไขผู้ใช้</span>
            case 'UPDATE_PROFILE': return <span className={`${base} bg-sky-500/20 text-sky-300 border border-sky-500/25`}>👤 แก้ไขโปรไฟล์</span>
            case 'DELETE_USER': return <span className={`${base} bg-pink-500/20 text-pink-300 border border-pink-500/25`}>ลบผู้ใช้</span>
            default: return <span className={`${base} bg-white/8 text-white/50 border border-white/10`}>{action}</span>
        }
    }

    // ─── Render states ────────────────────────────────────────────────────────
    if (accessStatus === 'checking') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin" />
                <p className="text-blue-300/60 text-sm font-medium">กำลังตรวจสอบสิทธิ์...</p>
            </div>
        )
    }

    if (accessStatus === 'denied') {
        return <AccessDenied />
    }

    return (
        <div className="text-white min-h-full">

            {/* ── Header card ──────────────────────────────────────────────── */}
            <div className="bg-[#0f1e3d] rounded-2xl shadow-2xl p-5 md:p-7 mb-6 border border-white/10 relative overflow-hidden">

                {/* Glow orbs */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 bg-indigo-500/8 rounded-full blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 bg-purple-500/8 rounded-full blur-3xl" />

                <div className="flex flex-col gap-5 relative">

                    {/* Title */}
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-indigo-500/20 border border-indigo-500/30 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                            <ShieldAlert className="w-4.5 h-4.5 text-indigo-400" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">
                                ประวัติการใช้งานระบบ
                            </h1>
                            <p className="text-[11px] text-blue-300/60 font-medium mt-0.5">Audit Logs — แสดงล่าสุด 200 รายการ</p>
                        </div>
                    </div>

                    {/* Search + refresh row */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Search input */}
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="ค้นหาชื่อ, การกระทำ หรือรายละเอียด..."
                                className="w-full pl-9 pr-9 py-2.5 bg-white/8 border border-white/12 rounded-xl text-white text-sm placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400/50 transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-white/30 hover:text-white/70 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Refresh button */}
                        <button
                            onClick={fetchLogs}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white/80 hover:text-white rounded-xl font-semibold text-sm transition-all duration-200 shrink-0"
                        >
                            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            รีเฟรชข้อมูล
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Loading / Empty shared states ────────────────────────────── */}
            {loading ? (
                <div className="bg-[#0f1e3d] rounded-2xl border border-white/8 p-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-10 h-10 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin" />
                        <span className="text-blue-300/60 text-sm font-medium">กำลังโหลดประวัติ...</span>
                    </div>
                </div>
            ) : filteredLogs.length === 0 ? (
                <div className="bg-[#0f1e3d] border border-white/8 border-dashed rounded-2xl p-16 text-center">
                    <div className="w-14 h-14 bg-white/8 border border-white/12 rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <History className="w-7 h-7 text-white/30" />
                    </div>
                    <span className="text-white/40 text-sm font-medium">ไม่พบประวัติการทำรายการ</span>
                </div>
            ) : (
                <>
                    {/* ── Mobile: card list (hidden on md+) ────────────────────── */}
                    <div className="flex flex-col gap-3 md:hidden">
                        {filteredLogs.map((log) => (
                            <div
                                key={log.id}
                                className="bg-[#0f1e3d] border border-white/10 rounded-2xl overflow-hidden shadow-lg"
                            >
                                {/* Card top: action badge + timestamp */}
                                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/8 bg-white/5">
                                    <div>{formatAction(log.action)}</div>
                                    <span className="text-[10px] font-mono text-blue-300/50 shrink-0">
                                        {new Date(log.created_at).toLocaleString('th-TH')}
                                    </span>
                                </div>

                                {/* Card body */}
                                <div className="px-4 py-3 space-y-2.5">
                                    {/* User row */}
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-[10px] font-black text-blue-300/50 uppercase tracking-widest shrink-0 mt-0.5">ผู้ใช้งาน</span>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-white">{getDisplayName(log)}</div>
                                            {getDisplayEmail(log) && (
                                                <div className="text-[10px] text-blue-300/50">{getDisplayEmail(log)}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Detail row */}
                                    <div className="pt-2.5 border-t border-white/8">
                                        <span className="text-[10px] font-black text-blue-300/50 uppercase tracking-widest block mb-2">รายละเอียด</span>
                                        {getDisplayDetail(log)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="hidden md:block bg-[#0c1628] rounded-2xl shadow-2xl border border-white/8 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="border-b border-white/8 bg-white/5">
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-blue-300/60 uppercase tracking-widest whitespace-nowrap">วัน-เวลา</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-blue-300/60 uppercase tracking-widest">ผู้ใช้งาน</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-blue-300/60 uppercase tracking-widest">การกระทำ</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-blue-300/60 uppercase tracking-widest">รายละเอียด</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredLogs.map((log, idx) => (
                                        <tr
                                            key={log.id}
                                            className={`transition-colors duration-150 hover:bg-white/5 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.03]'}`}
                                        >
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="text-xs font-mono text-blue-300/60">
                                                    {new Date(log.created_at).toLocaleString('th-TH')}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-white">{getDisplayName(log)}</div>
                                                {getDisplayEmail(log) && (
                                                    <div className="text-[11px] text-blue-300/50 mt-0.5">{getDisplayEmail(log)}</div>
                                                )}
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                {formatAction(log.action)}
                                            </td>
                                            <td className="px-5 py-4 text-sm max-w-xs">
                                                {getDisplayDetail(log)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Table footer */}
                        <div className="px-5 py-3 border-t border-white/8 flex items-center justify-between">
                            <span className="text-[11px] text-white/30 font-medium">
                                แสดง <span className="text-white/70 font-black">{filteredLogs.length}</span> รายการ
                                {searchTerm && ` (กรองจาก ${logs.length} รายการ)`}
                            </span>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold transition-colors"
                                >
                                    ล้างตัวกรอง
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mobile footer */}
                    <div className="md:hidden mt-2 flex items-center justify-between px-1">
                        <span className="text-[11px] text-white/30 font-medium">
                            แสดง <span className="text-white/60 font-black">{filteredLogs.length}</span> รายการ
                            {searchTerm && ` (กรองจาก ${logs.length} รายการ)`}
                        </span>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="text-[11px] text-indigo-400/80 hover:text-indigo-300 font-semibold transition-colors"
                            >
                                ล้างตัวกรอง
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    )
}