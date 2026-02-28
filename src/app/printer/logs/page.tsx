'use client'

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Swal from "sweetalert2"
import { Search, History, RefreshCcw, ShieldAlert, X } from "lucide-react"

interface AuditLog {
    id: string
    user_id: string
    action: string
    details: Record<string, unknown> | null
    ip_address: string
    created_at: string
    users?: {
        name: string
        email: string
    } | { name: string; email: string }[] | null
}

export default function LogsManagement() {
    const [logs, setLogs] = useState<AuditLog[]>([])
    const [loading, setLoading] = useState(true)
    const [searchTerm, setSearchTerm] = useState('')

    useEffect(() => {
        fetchLogs()
    }, [])

    const fetchLogs = async () => {
        setLoading(true)
        try {
            // Join with users table to get the user's name and email
            const { data, error } = await supabase
                .from('audit_logs')
                .select(`
                    id, 
                    user_id, 
                    action, 
                    details, 
                    ip_address, 
                    created_at,
                    users (name, email)
                `)
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;
            if (data) {
                setLogs(data as AuditLog[]);
            }
        } catch (error) {
            console.error('Error fetching logs:', error)
            Swal.fire({
                icon: 'error',
                title: 'ผิดพลาด',
                text: 'ไม่สามารถดึงข้อมูลประวัติการทำรายการได้ (อาจติดสิทธิ์ RLS หรือยังไม่ได้สร้างตาราง)'
            })
        } finally {
            setLoading(false)
        }
    }

    const getUserData = (users: AuditLog['users']) => {
        if (!users) return { name: '', email: '' };
        if (Array.isArray(users)) return users.length > 0 ? users[0] : { name: '', email: '' };
        return users;
    };

    const filteredLogs = logs.filter(log => {
        const search = searchTerm.toLowerCase();
        const userData = getUserData(log.users);
        const userName = userData.name.toLowerCase();
        const action = log.action.toLowerCase();
        const detailsString = JSON.stringify(log.details).toLowerCase();

        return userName.includes(search) || action.includes(search) || detailsString.includes(search);
    });

    const formatAction = (action: string) => {
        switch (action) {
            case 'LOGIN': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs font-bold">เข้าสู่ระบบ</span>;
            case 'CREATE_PRODUCT': return <span className="bg-emerald-100 text-emerald-800 px-2 py-1 rounded text-xs font-bold">เพิ่มสินค้า</span>;
            case 'UPDATE_PRODUCT': return <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded text-xs font-bold">แก้ไขสินค้า</span>;
            case 'DELETE_PRODUCT': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-bold">ลบสินค้า</span>;
            case 'CREATE_ORDER': return <span className="bg-indigo-100 text-indigo-800 px-2 py-1 rounded text-xs font-bold">สั่งพิมพ์ฉลาก</span>;
            case 'CREATE_USER': return <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs font-bold">เพิ่มผู้ใช้</span>;
            case 'UPDATE_USER': return <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-bold">แก้ไขผู้ใช้</span>;
            case 'DELETE_USER': return <span className="bg-pink-100 text-pink-800 px-2 py-1 rounded text-xs font-bold">ลบผู้ใช้</span>;
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded text-xs font-bold">{action}</span>;
        }
    };

    return (
        <div className="container mx-auto p-4 text-gray-800">
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-6 text-indigo-900 tracking-tight text-center sm:text-left drop-shadow-sm flex items-center justify-center sm:justify-start">
                <ShieldAlert className="w-8 h-8 mr-3 text-indigo-600" />
                ประวัติการใช้งานระบบ (Audit Logs)
            </h1>

            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="relative w-full sm:w-1/2 md:w-1/3">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-gray-400 w-5 h-5 absolute left-3 top-3.5" />
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ค้นหาชื่อ, การกระทำ หรือรายละเอียด..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white/95 border border-indigo-100 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
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
                                        <div className="text-sm font-bold text-gray-900">{getUserData(log.users).name || 'Unknown User'}</div>
                                        <div className="text-xs text-gray-500">{getUserData(log.users).email}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {formatAction(log.action)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate" title={JSON.stringify(log.details, null, 2)}>
                                        <code className="text-xs bg-gray-50 px-2 py-1 rounded border border-gray-100 block truncate">
                                            {JSON.stringify(log.details)}
                                        </code>
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
