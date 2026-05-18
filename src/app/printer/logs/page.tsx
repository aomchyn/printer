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
            <div className="bg-red-50 border border-red-200 rounded-2xl p-10 max-w-md w-full shadow-lg">
                <ShieldOff className="w-16 h-16 text-red-400 mx-auto mb-4" />
                <h2 className="text-2xl font-extrabold text-red-700 mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-gray-600 text-sm mb-1">
                    หน้านี้สงวนไว้สำหรับ <span className="font-bold text-red-600">Moderator</span> เท่านั้น
                </p>
                <p className="text-gray-400 text-xs mb-6">
                    กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นข้อผิดพลาด
                </p>
                <button
                    onClick={() => router.push('/printer/dashboard')}
                    className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg transition text-sm shadow"
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
                    <div><span className="text-gray-400">สินค้า:</span> <span className="font-semibold text-gray-800">{d.product_name}</span></div>
                    <div><span className="text-gray-400">รหัส:</span> {d.product_id}</div>
                    <div><span className="text-gray-400">ลอต:</span> <span className="font-semibold text-indigo-700">{d.lot_number}</span></div>
                    <div><span className="text-gray-400">จำนวน:</span> {d.quantity}</div>
                    <div><span className="text-gray-400">ผู้สั่ง:</span> {d.created_by}</div>
                    <div><span className="text-gray-400">ลบโดย:</span> <span className="font-semibold text-red-600">{d.deleted_by}</span></div>
                </div>
            )
        }

        if (log.action === 'RESTORE_FROM_TRASH' && data) {
            const d = data as any
            return (
                <div className="text-xs space-y-0.5">
                    <div><span className="text-gray-400">สินค้า:</span> <span className="font-semibold text-gray-800">{d.product_name}</span></div>
                    <div><span className="text-gray-400">ลอต:</span> <span className="font-semibold text-indigo-700">{d.lot_number}</span></div>
                    <div><span className="text-gray-400">กู้คืนโดย:</span> <span className="font-semibold text-emerald-600">{d.restored_by}</span></div>
                </div>
            )
        }

        if (summary) {
            return (
                <div className="text-xs space-y-0.5">
                    <div className="text-gray-700">{summary}</div>
                    {log.order_id && (
                        <div><span className="text-gray-400">Order ID:</span> <span className="font-medium text-indigo-600">#{log.order_id}</span></div>
                    )}
                </div>
            )
        }

        if (data) {
            return (
                <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-100 block truncate" title={JSON.stringify(data, null, 2)}>
                    {JSON.stringify(data)}
                </code>
            )
        }

        return <span className="text-gray-400 text-xs">-</span>
    }

    const filteredLogs = logs.filter(log => {
        const search = searchTerm.toLowerCase()
        const displayName = getDisplayName(log).toLowerCase()
        const action = log.action.toLowerCase()
        const detailsString = JSON.stringify(log.details || log.changes || log.summary || '').toLowerCase()
        return displayName.includes(search) || action.includes(search) || detailsString.includes(search)
    })

    const formatAction = (action: string) => {
        switch (action) {
            case 'LOGIN': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">เข้าสู่ระบบ</span>
            case 'CREATE_PRODUCT': return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">เพิ่มสินค้า</span>
            case 'UPDATE_PRODUCT': return <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold">แก้ไขสินค้า</span>
            case 'DELETE_PRODUCT': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">ลบสินค้า</span>
            case 'CREATE_ORDER': return <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-bold">สั่งพิมพ์ฉลาก</span>
            case 'DELETE_ORDER': return <span className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold">🗑️ ลบคำสั่งพิมพ์</span>
            case 'PERMANENT_DELETE_ORDER': return <span className="bg-red-800 text-white px-2 py-1 rounded text-xs font-bold">🗑️ ลบถาวร</span>
            case 'RESTORE_FROM_TRASH': return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">♻️ กู้คืนจากถังขยะ</span>
            case 'UPDATE': return <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold">✏️ แก้ไขคำสั่งพิมพ์</span>
            case 'VERIFY': return <span className="bg-emerald-600 text-white px-2 py-1 rounded text-xs font-bold">✅ ยืนยันตรวจสอบ</span>
            case 'CANCEL': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">❌ ยกเลิกคำสั่งพิมพ์</span>
            case 'CREATE_USER': return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-bold">เพิ่มผู้ใช้</span>
            case 'UPDATE_USER': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">แก้ไขผู้ใช้</span>
            case 'UPDATE_PROFILE': return <span className="bg-sky-100 text-sky-800 px-2 py-1 rounded text-xs font-bold">👤 แก้ไขโปรไฟล์</span>
            case 'DELETE_USER': return <span className="bg-pink-100 text-pink-800 px-2 py-1 rounded text-xs font-bold">ลบผู้ใช้</span>
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold">{action}</span>
        }
    }

    // ─── Render states ────────────────────────────────────────────────────────
    if (accessStatus === 'checking') {
        return (
            <div className="min-h-[60vh] flex items-center justify-center">
                <RefreshCcw className="w-8 h-8 text-indigo-400 animate-spin" />
            </div>
        )
    }

    if (accessStatus === 'denied') {
        return <AccessDenied />
    }

    return (
        <div className="container mx-auto p-4 text-gray-800">
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-6 text-indigo-900 tracking-tight text-center sm:text-left drop-shadow-sm flex items-center justify-center sm:justify-start">
                <ShieldAlert className="w-8 h-8 mr-3 text-indigo-600" />
                ประวัติการใช้งานระบบ (Audit Logs)
            </h1>

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="relative w-full sm:w-1/2 md:w-1/3">
                    <Search className="text-gray-400 w-5 h-5 absolute left-3 top-3.5 pointer-events-none" />
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ค้นหาชื่อ, การกระทำ หรือรายละเอียด..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white/95 border border-indigo-100 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>
                <button
                    onClick={fetchLogs}
                    className="w-full sm:w-auto bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200 font-semibold py-2.5 px-6 rounded-lg transition duration-200 flex items-center justify-center shadow-sm"
                >
                    <RefreshCcw className={`mr-2 w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> รีเฟรชข้อมูล
                </button>
            </div>

            <div className="bg-white/95 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden border border-indigo-100 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-indigo-700 to-purple-700 shadow-md">
                        <tr>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white tracking-wider">วัน-เวลา</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white tracking-wider">ผู้ใช้งาน</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white tracking-wider">การกระทำ</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white tracking-wider">รายละเอียด</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-100">
                        {loading ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    <div className="flex justify-center items-center">
                                        <RefreshCcw className="w-8 h-8 text-indigo-300 animate-spin" />
                                        <span className="ml-3 text-lg text-indigo-600">กำลังโหลดประวัติ...</span>
                                    </div>
                                </td>
                            </tr>
                        ) : filteredLogs.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    <div className="flex flex-col items-center">
                                        <History className="w-16 h-16 text-gray-300 mb-4" />
                                        <span className="text-lg">ไม่พบประวัติการทำรายการ</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredLogs.map((log) => (
                                <tr key={log.id} className="hover:bg-indigo-50/50 transition-colors duration-150">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 font-medium">
                                        {new Date(log.created_at).toLocaleString('th-TH')}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-bold text-gray-900">{getDisplayName(log)}</div>
                                        {getDisplayEmail(log) && (
                                            <div className="text-xs text-gray-500">{getDisplayEmail(log)}</div>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {formatAction(log.action)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs">
                                        {getDisplayDetail(log)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
