'use client'

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Swal from "sweetalert2"
import { useRouter } from "next/navigation"
import { Search, History, RefreshCcw, ShieldAlert, X, ShieldOff } from "lucide-react"
import LogsSkeleton from './skeleton-loading-logs'

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
            <div className="bg-white border border-[#C8102E]/20 rounded-2xl p-10 max-w-md w-full shadow-2xl backdrop-blur-xl">
                <div className="w-16 h-16 bg-[#FCEAEC] border border-[#C8102E]/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <ShieldOff className="w-8 h-8 text-[#C8102E]" />
                </div>
                <h2 className="text-2xl font-black text-[#101820] mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-[#101820]/60 text-sm mb-1">
                    หน้านี้สงวนไว้สำหรับ <span className="font-bold text-[#C8102E]">Moderator</span> เท่านั้น
                </p>
                <p className="text-[#101820]/30 text-xs mb-7">
                    กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นข้อผิดพลาด
                </p>
                <button
                    onClick={() => router.push('/printer/dashboard')}
                    className="bg-[#0057B8] hover:bg-[#004A9F] text-white font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm border border-[#0057B8]/20 shadow-lg shadow-[#0057B8]/15 active:scale-95"
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

    async function fetchLogs() {
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
                    <div><span className="text-[#5F6B70]">สินค้า:</span> <span className="font-semibold text-[#101820]">{d.product_name}</span></div>
                    <div><span className="text-[#5F6B70]">รหัส:</span> <span className="text-[#101820]/70">{d.product_id}</span></div>
                    <div><span className="text-[#5F6B70]">ลอต:</span> <span className="font-semibold text-[#0057B8]">{d.lot_number}</span></div>
                    {d.order_type && (
                        <div><span className="text-[#5F6B70]">จำนวน:</span> <span className="text-[#101820]/70">{d.quantity}</span></div>
                    )}
                    <div><span className="text-[#5F6B70]">ผู้สั่ง:</span> <span className="text-[#101820]/70">{d.created_by}</span></div>
                    <div><span className="text-[#5F6B70]">ลบโดย:</span> <span className="font-semibold text-[#C8102E]">{d.deleted_by}</span></div>
                </div>
            )
        }

        if (log.action === 'CREATE_STABILITY_FEED' && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    {d.product_name && <div><span className="text-[#5F6B70]">สินค้า:</span> <span className="font-semibold text-[#101820]">{d.product_name}</span></div>}
                    <div><span className="text-[#5F6B70]">รหัส:</span> <span className="text-[#101820]/70">{d.product_id}</span></div>
                    <div><span className="text-[#5F6B70]">ลอต:</span> <span className="font-semibold text-[#0057B8]">{d.lot_number}</span></div>
                </div>
            )
        }

        if (log.action === 'DELETE_STABILITY_FEED' && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    {d.product_name && <div><span className="text-[#5F6B70]">สินค้า:</span> <span className="font-semibold text-[#101820]">{d.product_name}</span></div>}
                    <div><span className="text-[#5F6B70]">รหัส:</span> <span className="text-[#101820]/70">{d.product_id}</span></div>
                    <div><span className="text-[#5F6B70]">ลอต:</span> <span className="font-semibold text-[#0057B8]">{d.lot_number}</span></div>
                    {d.deleted_by && <div><span className="text-[#5F6B70]">ลบโดย:</span> <span className="font-semibold text-[#C8102E]">{d.deleted_by}</span></div>}
                </div>
            )
        }

        if (log.action === 'RESTORE_FROM_TRASH' && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    <div><span className="text-[#5F6B70]">สินค้า:</span> <span className="font-semibold text-[#101820]">{d.product_name}</span></div>
                    <div><span className="text-[#5F6B70]">ลอต:</span> <span className="font-semibold text-[#0057B8]">{d.lot_number}</span></div>
                    <div><span className="text-[#5F6B70]">กู้คืนโดย:</span> <span className="font-semibold text-[#008C78]">{d.restored_by}</span></div>
                </div>
            )
        }

        if (summary) {
            return (
                <div className="text-xs space-y-0.5">
                    <div className="text-[#101820]/80">{summary}</div>
                    {log.order_id && (
                        <div><span className="text-[#5F6B70]">Order ID:</span> <span className="font-medium text-[#0057B8]">#{log.order_id}</span></div>
                    )}
                </div>
            )
        }

        if (data) {
            return (
                <code className="text-xs bg-[#F0F3F4] border border-[#D9E1E2] text-[#101820]/60 px-2 py-1 rounded block truncate" title={JSON.stringify(data, null, 2)}>
                    {JSON.stringify(data)}
                </code>
            )
        }

        return <span className="text-[#101820]/30 text-xs">—</span>
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
            case 'LOGIN': return <span className={`${base} bg-[#EAF3FC] text-[#0057B8] border border-[#0057B8]/20`}>เข้าสู่ระบบ</span>
            case 'CREATE_PRODUCT': return <span className={`${base} bg-[#E6F8F4] text-[#008C78] border border-[#00B398]/20`}>เพิ่มสินค้า</span>
            case 'UPDATE_PRODUCT': return <span className={`${base} bg-[#FFF8D6] text-[#A88700] border border-[#F1C400]/30`}>แก้ไขสินค้า</span>
            case 'DELETE_PRODUCT': return <span className={`${base} bg-[#FCEAEC] text-[#C8102E] border border-[#C8102E]/20`}>ลบสินค้า</span>
            case 'CREATE_ORDER': return <span className={`${base} bg-[#EAF3FC] text-[#0057B8] border border-[#0057B8]/20`}>สั่งพิมพ์ฉลาก</span>
            case 'DELETE_ORDER': return <span className={`${base} bg-[#FCEAEC] text-[#C8102E] border border-[#C8102E]/20`}>🗑️ ลบคำสั่งพิมพ์</span>
            case 'PERMANENT_DELETE_ORDER': return <span className={`${base} bg-[#FCEAEC] text-[#9B0B23] border border-[#C8102E]/30`}>🗑️ ลบถาวร</span>
            case 'RESTORE_FROM_TRASH': return <span className={`${base} bg-[#E6F8F4] text-[#008C78] border border-[#00B398]/20`}>♻️ กู้คืนจากถังขยะ</span>
            case 'UPDATE': return <span className={`${base} bg-[#FFF8D6] text-[#A88700] border border-[#F1C400]/30`}>✏️ แก้ไขคำสั่งพิมพ์</span>
            case 'VERIFY': return <span className={`${base} bg-emerald-500/25 text-[#008C78] border border-[#00B398]/20`}>✅ ยืนยันตรวจสอบ</span>
            case 'CANCEL': return <span className={`${base} bg-[#FFF0E7] text-[#C45A12] border border-[#FF6A13]/25`}>❌ ยกเลิกคำสั่งพิมพ์</span>
            case 'CREATE_USER': return <span className={`${base} bg-[#E5F8FB] text-[#00AEC7] border border-[#00AEC7]/20`}>เพิ่มผู้ใช้</span>
            case 'UPDATE_USER': return <span className={`${base} bg-[#FFF0E7] text-[#C45A12] border border-[#FF6A13]/25`}>แก้ไขผู้ใช้</span>
            case 'UPDATE_PROFILE': return <span className={`${base} bg-[#E5F8FB] text-[#00AEC7] border border-[#00AEC7]/20`}>👤 แก้ไขโปรไฟล์</span>
            case 'DELETE_USER': return <span className={`${base} bg-[#FCEAEC] text-[#C8102E] border border-[#C8102E]/20`}>ลบผู้ใช้</span>
            default: return <span className={`${base} bg-[#F0F3F4] text-[#101820]/50 border border-[#D9E1E2]`}>{action}</span>
        }
    }

    // ─── Render states ────────────────────────────────────────────────────────
    if (accessStatus === 'checking') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-[#D9E1E2] border-t-blue-400 animate-spin" />
                <p className="text-[#5F6B70] text-sm font-medium">กำลังตรวจสอบสิทธิ์...</p>
            </div>
        )
    }

    if (accessStatus === 'denied') {
        return <AccessDenied />
    }

    return (
        <div className="text-[#101820] min-h-full">

            {/* ── Header card ──────────────────────────────────────────────── */}
            <div className="bg-[#00263A] rounded-2xl shadow-2xl p-5 md:p-7 mb-6 border border-[#D9E1E2] relative overflow-hidden">

                {/* Glow orbs */}
                <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 bg-[#EAF3FC] rounded-full blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 bg-[#E5F8FB] rounded-full blur-3xl" />

                <div className="flex flex-col gap-5 relative">

                    {/* Title */}
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-[#EAF3FC] border border-[#0057B8]/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                            <ShieldAlert className="w-4.5 h-4.5 text-[#0057B8]" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-white tracking-tight leading-tight">
                                ประวัติการใช้งานระบบ
                            </h1>
                            <p className="text-[11px] text-[#BFEFF5]/80 font-medium mt-0.5">Audit Logs — แสดงล่าสุด 200 รายการ</p>
                        </div>
                    </div>

                    {/* Search + refresh row */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        {/* Search input */}
                        <div className="relative flex-1">
                            <Search className="w-4 h-4 text-[#101820]/30 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="ค้นหาชื่อ, การกระทำ หรือรายละเอียด..."
                                className="w-full pl-9 pr-9 py-2.5 bg-white border border-[#D9E1E2] rounded-xl text-[#101820] text-sm placeholder:text-[#8A9498] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/20 focus:border-[#0057B8] transition-all"
                            />
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#101820]/30 hover:text-[#101820]/70 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>

                        {/* Refresh button */}
                        <button
                            onClick={fetchLogs}
                            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#F0F3F4] hover:bg-white border border-[#D9E1E2] hover:border-[#D9E1E2] text-[#101820]/80 hover:text-[#101820] rounded-xl font-semibold text-sm transition-all duration-200 shrink-0"
                        >
                            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            รีเฟรชข้อมูล
                        </button>
                    </div>
                </div>
            </div>

            {/* ── Loading / Empty shared states ────────────────────────────── */}
            {loading ? (
                <LogsSkeleton />
            ) : filteredLogs.length === 0 ? (
                <div className="bg-white border border-[#D9E1E2] border-dashed rounded-2xl p-16 text-center">
                    <div className="w-14 h-14 bg-[#F0F3F4] border border-[#D9E1E2] rounded-2xl flex items-center justify-center mx-auto mb-3">
                        <History className="w-7 h-7 text-[#101820]/30" />
                    </div>
                    <span className="text-[#101820]/40 text-sm font-medium">ไม่พบประวัติการทำรายการ</span>
                </div>
            ) : (
                <>
                    {/* ── Mobile: card list (hidden on md+) ────────────────────── */}
                    <div className="flex flex-col gap-3 md:hidden">
                        {filteredLogs.map((log) => (
                            <div
                                key={log.id}
                                className="bg-white border border-[#D9E1E2] rounded-2xl overflow-hidden shadow-lg"
                            >
                                {/* Card top: action badge + timestamp */}
                                <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#D9E1E2] bg-white">
                                    <div>{formatAction(log.action)}</div>
                                    <span className="text-[10px] font-mono text-[#5F6B70] shrink-0">
                                        {new Date(log.created_at).toLocaleString('th-TH')}
                                    </span>
                                </div>

                                {/* Card body */}
                                <div className="px-4 py-3 space-y-2.5">
                                    {/* User row */}
                                    <div className="flex items-start justify-between gap-2">
                                        <span className="text-[10px] font-black text-[#5F6B70] uppercase tracking-widest shrink-0 mt-0.5">ผู้ใช้งาน</span>
                                        <div className="text-right">
                                            <div className="text-sm font-bold text-[#101820]">{getDisplayName(log)}</div>
                                            {getDisplayEmail(log) && (
                                                <div className="text-[10px] text-[#5F6B70]">{getDisplayEmail(log)}</div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Detail row */}
                                    <div className="pt-2.5 border-t border-[#D9E1E2]">
                                        <span className="text-[10px] font-black text-[#5F6B70] uppercase tracking-widest block mb-2">รายละเอียด</span>
                                        {getDisplayDetail(log)}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="hidden md:block bg-[#F5F7F8] rounded-2xl shadow-2xl border border-[#D9E1E2] overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="min-w-full">
                                <thead>
                                    <tr className="border-b border-[#D9E1E2] bg-white">
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-[#5F6B70] uppercase tracking-widest whitespace-nowrap">วัน-เวลา</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-[#5F6B70] uppercase tracking-widest">ผู้ใช้งาน</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-[#5F6B70] uppercase tracking-widest">การกระทำ</th>
                                        <th className="px-5 py-3.5 text-left text-[11px] font-black text-[#5F6B70] uppercase tracking-widest">รายละเอียด</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-[#D9E1E2]">
                                    {filteredLogs.map((log, idx) => (
                                        <tr
                                            key={log.id}
                                            className={`transition-colors duration-150 hover:bg-white ${idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.03]'}`}
                                        >
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <span className="text-xs font-mono text-[#5F6B70]">
                                                    {new Date(log.created_at).toLocaleString('th-TH')}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <div className="text-sm font-bold text-[#101820]">{getDisplayName(log)}</div>
                                                {getDisplayEmail(log) && (
                                                    <div className="text-[11px] text-[#5F6B70] mt-0.5">{getDisplayEmail(log)}</div>
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
                        <div className="px-5 py-3 border-t border-[#D9E1E2] flex items-center justify-between">
                            <span className="text-[11px] text-[#101820]/30 font-medium">
                                แสดง <span className="text-[#101820]/70 font-black">{filteredLogs.length}</span> รายการ
                                {searchTerm && ` (กรองจาก ${logs.length} รายการ)`}
                            </span>
                            {searchTerm && (
                                <button
                                    onClick={() => setSearchTerm('')}
                                    className="text-[11px] text-[#0057B8] hover:text-[#0057B8] font-semibold transition-colors"
                                >
                                    ล้างตัวกรอง
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mobile footer */}
                    <div className="md:hidden mt-2 flex items-center justify-between px-1">
                        <span className="text-[11px] text-[#101820]/30 font-medium">
                            แสดง <span className="text-[#101820]/60 font-black">{filteredLogs.length}</span> รายการ
                            {searchTerm && ` (กรองจาก ${logs.length} รายการ)`}
                        </span>
                        {searchTerm && (
                            <button
                                onClick={() => setSearchTerm('')}
                                className="text-[11px] text-[#0057B8]/80 hover:text-[#0057B8] font-semibold transition-colors"
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
