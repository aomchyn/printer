'use client'

import { useState, useEffect } from "react"
import Swal from "sweetalert2"
import Modal from "../components/Modal"
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase"
import { createClient } from "@supabase/supabase-js"
import {
    Edit2, Trash2, X, Check, UserPlus, Search,
    Mail, BadgeCheck, Briefcase, Building2, Shield, Users
} from "lucide-react"
import { logAction } from "@/lib/logger"

interface User {
    id: string
    email: string
    name: string
    role: string
    employee_id?: string
    job_title?: string
    department?: string
}

function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
    return name.slice(0, 2).toUpperCase()
}

type RoleKey = 'moderator' | 'assistant_moderator' | 'operator' | 'user'

const ROLE_LABEL: Record<RoleKey, string> = {
    moderator: 'Moderator',
    assistant_moderator: 'Asst. Moderator',
    operator: 'Operator',
    user: 'User',
}

const ROLE_CONFIG: Record<RoleKey, { badge: string; avatar: string; border: string }> = {
    moderator: { badge: 'bg-violet-500/20 text-violet-300 border border-violet-500/30', avatar: 'bg-gradient-to-br from-violet-600 to-purple-700', border: 'border-l-violet-500' },
    assistant_moderator: { badge: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30', avatar: 'bg-gradient-to-br from-indigo-500 to-blue-700', border: 'border-l-indigo-400' },
    operator: { badge: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30', avatar: 'bg-gradient-to-br from-emerald-600 to-teal-700', border: 'border-l-emerald-500' },
    user: { badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/30', avatar: 'bg-gradient-to-br from-sky-600 to-blue-700', border: 'border-l-sky-400' },
}

const SECTION_GROUPS: { key: string; roles: RoleKey[]; label: string; icon: React.ElementType; colorClass: string }[] = [
    { key: 'admin', roles: ['moderator', 'assistant_moderator'], label: 'ผู้ดูแลระบบ', icon: Shield, colorClass: 'text-violet-400' },
    { key: 'operator', roles: ['operator'], label: 'Operator', icon: Briefcase, colorClass: 'text-emerald-400' },
    { key: 'user', roles: ['user'], label: 'พนักงานทั่วไป', icon: Users, colorClass: 'text-sky-400' },
]

const DEPARTMENTS = [
    { value: 'QA ประกันคุณภาพ', short: 'QA', label: 'ประกันคุณภาพ' },
    { value: 'PD ฝ่ายผลิต', short: 'PD', label: 'ฝ่ายผลิต' },
    { value: 'WH คลังสินค้า', short: 'WH', label: 'คลังสินค้า' },
    { value: 'VD ผลิตยาสัตว์', short: 'VD', label: 'ผลิตยาสัตว์' },
]

function MetaChip({ icon: Icon, value }: { icon: React.ElementType; value?: string | null }) {
    const isEmpty = !value
    return (
        <div className={`flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-md ${isEmpty ? 'text-slate-300' : 'text-slate-500 bg-[#f0f5ff]'}`}>
            <Icon className={`w-3 h-3 flex-shrink-0 ${isEmpty ? 'text-slate-300' : 'text-slate-400'}`} />
            <span className="truncate">{isEmpty ? '—' : value}</span>
        </div>
    )
}

function UserCard({ user, onEdit, onDelete, currentUserId }: {
    user: User; onEdit: (u: User) => void; onDelete: (u: User) => void; currentUserId: string | null
}) {
    const role = (user.role ?? 'user') as RoleKey
    const cfg = ROLE_CONFIG[role]
    const isSelf = user.id === currentUserId

    return (
        <div className={`bg-white border border-[#dde8f5] border-l-2 ${cfg.border} rounded-xl px-3.5 py-3 hover:shadow-md transition-all duration-200 shadow-sm`}>
            <div className="flex items-start gap-3">
                <div className={`w-9 h-9 min-w-[36px] rounded-lg flex items-center justify-center text-[12px] font-bold text-white ${cfg.avatar} shadow-md mt-0.5 shrink-0`}>
                    {getInitials(user.name)}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                        <span className="text-[13px] font-semibold text-[#0f1e3d]">{user.name}</span>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full tracking-wide ${cfg.badge}`}>
                            {ROLE_LABEL[role]}
                        </span>
                        {isSelf && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-600 border border-amber-400/30">คุณ</span>
                        )}
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mb-1.5 overflow-hidden">
                        <Mail className="w-3 h-3 flex-shrink-0 text-slate-300" />
                        <span className="truncate">{user.email}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                        <MetaChip icon={BadgeCheck} value={user.employee_id} />
                        <MetaChip icon={Briefcase} value={user.job_title} />
                        <MetaChip icon={Building2} value={user.department ? (DEPARTMENTS.find(d => d.value === user.department)?.short ?? user.department) : null} />
                    </div>
                    <div className="flex items-center gap-1.5 pt-2 border-t border-[#eef3fb]">
                        <button onClick={() => onEdit(user)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 border border-blue-100 text-blue-600 hover:bg-blue-500 hover:text-white hover:border-blue-500 text-[11.5px] font-semibold transition-all active:scale-95">
                            <Edit2 className="w-3 h-3" /> แก้ไข
                        </button>
                        {isSelf ? (
                            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-300 text-[11.5px] font-semibold cursor-not-allowed" title="ไม่สามารถลบบัญชีตัวเองได้">
                                <Trash2 className="w-3 h-3" /> ลบ
                            </div>
                        ) : (
                            <button onClick={() => onDelete(user)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-500 hover:bg-red-500 hover:text-white hover:border-red-500 text-[11.5px] font-semibold transition-all active:scale-95">
                                <Trash2 className="w-3 h-3" /> ลบ
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}

const inputCls = `w-full px-3.5 py-2.5 text-[13px] bg-white border border-[#d0daf0] rounded-lg text-[#0f1e3d] placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all`
const labelCls = "block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider"

export default function UserManagement() {
    const [users, setUsers] = useState<User[]>([])
    const [search, setSearch] = useState('')
    const [showModal, setShowModal] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [email, setEmail] = useState('')
    const [name, setName] = useState('')
    const [employeeId, setEmployeeId] = useState('')
    const [jobTitle, setJobTitle] = useState('')
    const [department, setDepartment] = useState('')
    const [password, setPassword] = useState('')
    const [role, setRole] = useState('user')
    const [isAdmin, setIsAdmin] = useState(false)
    const [currentUserId, setCurrentUserId] = useState<string | null>(null)

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false })
            if (error) throw error
            if (data) setUsers(data)
        } catch { Swal.fire({ icon: 'error', title: 'Error', text: 'Failed to fetch users' }) }
    }

    const checkAdminStatus = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            setCurrentUserId(session.user.id)
            const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single()
            if (data?.role === 'moderator' || data?.role === 'assistant_moderator') { setIsAdmin(true); fetchUsers() }
            else Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์เข้าถึง', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' })
        }
    }

    useEffect(() => { checkAdminStatus() }, [])

    const isDuplicateName = (n: string, excludeId?: string) =>
        users.some(u => u.name.toLowerCase() === n.toLowerCase() && u.id !== excludeId)

    const resetForm = () => {
        setShowModal(false); setEditingUser(null)
        setEmail(''); setName(''); setEmployeeId(''); setJobTitle(''); setDepartment(''); setPassword(''); setRole('user')
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (editingUser) {
            const hasChanges = name !== editingUser.name || email !== editingUser.email || role !== (editingUser.role ?? 'user') || (employeeId || '') !== (editingUser.employee_id || '') || (jobTitle || '') !== (editingUser.job_title || '') || (department || '') !== (editingUser.department || '') || (password && password.trim().length > 0)
            if (!hasChanges) { Swal.fire({ icon: 'info', title: 'ไม่มีการเปลี่ยนแปลง', text: 'ไม่พบการแก้ไขข้อมูลใดๆ' }); return }
            if (isDuplicateName(name, editingUser.id)) { Swal.fire({ icon: 'error', title: 'ชื่อผู้ใช้ซ้ำ', text: 'มีชื่อผู้ใช้นี้ในระบบแล้ว' }); return }
            Swal.fire({ title: 'กำลังบันทึก...', allowOutsideClick: false, allowEscapeKey: false, didOpen: () => { Swal.showLoading() } })
            try {
                const { error } = await supabase.from('users').update({ name, role, employee_id: employeeId || null, job_title: jobTitle || null, department: department || null }).eq('id', editingUser.id)
                if (error) throw error
                if (email !== editingUser.email) {
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!session?.access_token) throw new Error('Session expired')
                    const res = await fetch(`/api/users/${editingUser.id}/email`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ newEmail: email }) })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update email') }
                }
                if (password && password.trim().length > 0) {
                    if (password.length < 8) throw new Error('รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร')
                    const { error: refreshError } = await supabase.auth.refreshSession()
                    if (refreshError) throw new Error('Session หมดอายุ กรุณา Login ใหม่')
                    const { data: { session } } = await supabase.auth.getSession()
                    if (!session?.access_token) throw new Error('Session expired')
                    const res = await fetch(`/api/users/${editingUser.id}/password`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` }, body: JSON.stringify({ newPassword: password }) })
                    if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to update password') }
                }
                await logAction('UPDATE_USER', { id: editingUser.id, name, role, password_changed: !!(password && password.trim().length > 0) })
                Swal.fire({ icon: 'success', title: 'สำเร็จ', text: password ? 'อัปเดตผู้ใช้และเปลี่ยนรหัสผ่านเรียบร้อย' : 'อัปเดตผู้ใช้เรียบร้อย', timer: 1500 })
                resetForm(); fetchUsers()
            } catch (error: any) { Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: error.message || 'Failed to save user' }) }
        } else {
            if (isDuplicateName(name)) { Swal.fire({ icon: 'error', title: 'ชื่อผู้ใช้ซ้ำ', text: 'มีชื่อผู้ใช้นี้ในระบบแล้ว' }); return }
            if (password.length < 8) { Swal.fire({ icon: 'error', title: 'รหัสผ่านอ่อนเกินไป', text: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร' }); return }
            Swal.fire({ title: 'กำลังสร้างบัญชี...', didOpen: () => { Swal.showLoading() } })
            try {
                const tempSupabase = createClient(supabaseUrl, supabaseAnonKey, { auth: { persistSession: false, autoRefreshToken: false } })
                const { data, error: signupError } = await tempSupabase.auth.signUp({ email, password })
                if (signupError) throw signupError
                if (data?.user) {
                    const { error: insertError } = await supabase.from('users').insert({ id: data.user.id, email, name, role, employee_id: employeeId || null, job_title: jobTitle || null, department: department || null })
                    if (insertError) throw insertError
                }
                await logAction('CREATE_USER', { email, name, role })
                Swal.fire({ icon: 'success', title: 'สำเร็จ', text: 'สร้างบัญชีผู้ใช้ใหม่เรียบร้อยแล้ว', timer: 1500 })
                resetForm(); fetchUsers()
            } catch (error: any) {
                let msg = error.message
                if (msg?.includes('users_id_fkey')) msg = 'ไม่สามารถสร้างผู้ใช้ได้ เนื่องจากอีเมลนี้ถูกใช้งานไปแล้ว'
                Swal.fire({ icon: 'error', title: 'ข้อผิดพลาด', text: msg || 'Failed to save user' })
            }
        }
    }

    const handleDelete = async (user: User) => {
        if (user.id === currentUserId) { Swal.fire({ icon: 'warning', title: 'ไม่สามารถดำเนินการได้', text: 'คุณไม่สามารถลบบัญชีของตัวเองได้' }); return }
        const result = await Swal.fire({ icon: 'warning', title: 'Are You Sure?', text: `คุณต้องการลบบัญชีผู้ใช้ "${user.name}" อย่างถาวรหรือไม่?`, showCancelButton: true, confirmButtonText: 'Delete', cancelButtonText: 'Cancel' })
        if (!result.isConfirmed) return
        try {
            const { data: { session } } = await supabase.auth.getSession()
            const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${session?.access_token || ''}` } })
            if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed to delete user via API') }
            await supabase.from('users').delete().eq('id', user.id)
            await logAction('DELETE_USER', { id: user.id, email: user.email, name: user.name })
            Swal.fire({ icon: 'success', title: 'Success', text: 'User Deleted Successfully', timer: 1000 })
            fetchUsers()
        } catch (error) { Swal.fire({ icon: 'error', title: 'Error', text: error instanceof Error ? error.message : 'Failed to delete user' }) }
    }

    const handleEdit = (user: User) => {
        setEditingUser(user); setEmail(user.email); setName(user.name)
        setEmployeeId(user.employee_id || ''); setJobTitle(user.job_title || '')
        setDepartment(user.department || ''); setRole(user.role ?? 'user'); setPassword('')
        setShowModal(true)
    }

    const handleAdd = () => {
        setEditingUser(null); setEmail(''); setName(''); setEmployeeId(''); setJobTitle(''); setDepartment(''); setPassword(''); setRole('user')
        setShowModal(true)
    }

    if (!isAdmin) return <div className="p-8 text-center text-xl text-yellow-200">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (Restricted)</div>

    const filtered = users.filter(u => {
        if (!search.trim()) return true
        const q = search.toLowerCase()
        return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.employee_id ?? '').toLowerCase().includes(q) || (u.department ?? '').toLowerCase().includes(q)
    })

    const countRole = (roles: RoleKey[]) => users.filter(u => roles.includes((u.role ?? 'user') as RoleKey)).length

    const STAT_CARDS = [
        { label: 'ผู้ใช้ทั้งหมด', value: users.length, icon: Users, gradient: 'from-white to-blue-50', border: 'border-blue-200', text: 'text-blue-700', iconBg: 'bg-blue-100' },
        { label: 'Moderator', value: countRole(['moderator', 'assistant_moderator']), icon: Shield, gradient: 'from-white to-violet-50', border: 'border-violet-200', text: 'text-violet-700', iconBg: 'bg-violet-100' },
        { label: 'Operator', value: countRole(['operator']), icon: Briefcase, gradient: 'from-white to-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', iconBg: 'bg-emerald-100' },
        { label: 'User', value: countRole(['user']), icon: Users, gradient: 'from-white to-sky-50', border: 'border-sky-200', text: 'text-sky-700', iconBg: 'bg-sky-100' },
    ]

    return (
        <div className="min-h-screen bg-gray-50" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>

            {/* ── Page header: light, blends with content bg ── */}
            <div className="bg-white/80 backdrop-blur-sm border-b border-[#dde8f5] px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                        <Users className="w-3.5 h-3.5 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[#0f1e3d] font-bold text-[14px] leading-tight tracking-wide truncate">จัดการผู้ใช้งาน</h1>
                        <p className="text-slate-400 text-[10.5px] hidden sm:block truncate">ตั้งค่าบัญชี · กำหนดสิทธิ์ · ดูแลพนักงาน</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-[10px] font-semibold text-emerald-600">เรียลไทม์</span>
                    </div>
                </div>
                <button
                    onClick={handleAdd}
                    className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg transition-all shadow-md shadow-blue-500/20 active:scale-95 shrink-0"
                >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">สร้างบัญชีใหม่</span>
                    <span className="sm:hidden">เพิ่ม</span>
                </button>
            </div>

            <div className="p-3 sm:p-5 max-w-5xl mx-auto">

                {/* ── Stat cards ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                    {STAT_CARDS.map(s => (
                        <div key={s.label} className={`bg-gradient-to-br ${s.gradient} border ${s.border} rounded-xl px-3 py-2.5 flex items-center gap-3`}>
                            <div className={`w-7 h-7 ${s.iconBg} rounded-lg flex items-center justify-center shrink-0`}>
                                <s.icon className={`w-3.5 h-3.5 ${s.text}`} />
                            </div>
                            <div className="min-w-0">
                                <div className={`text-xl font-bold leading-tight ${s.text}`}>{s.value}</div>
                                <div className="text-[10px] font-medium text-slate-400 uppercase tracking-widest truncate">{s.label}</div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* ── Search bar ── */}
                <div className="relative mb-4">
                    <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text" value={search} onChange={e => setSearch(e.target.value)}
                        placeholder="ค้นหาชื่อ, อีเมล, รหัสพนักงาน, หน่วยงาน..."
                        className="w-full pl-10 pr-4 py-2.5 text-[13px] bg-white border border-[#d0daf0] rounded-xl text-[#0f1e3d] placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all shadow-sm"
                    />
                </div>

                {/* ── User groups ── */}
                <div className="space-y-5">
                    {SECTION_GROUPS.map(group => {
                        const groupUsers = filtered.filter(u => group.roles.includes((u.role ?? 'user') as RoleKey))
                        if (groupUsers.length === 0) return null
                        const Icon = group.icon
                        return (
                            <div key={group.key}>
                                <div className="flex items-center gap-2 mb-2.5">
                                    <Icon className={`w-3.5 h-3.5 ${group.colorClass} shrink-0`} />
                                    <span className={`text-[11px] font-bold uppercase tracking-[0.12em] ${group.colorClass}`}>{group.label}</span>
                                    <div className="flex-1 h-px bg-[#dde8f5]" />
                                    <span className="text-[10px] font-semibold text-slate-400 bg-white px-2 py-0.5 rounded-full border border-[#dde8f5]">{groupUsers.length} คน</span>
                                </div>
                                <div className="space-y-2">
                                    {groupUsers.map(user => (
                                        <UserCard key={user.id} user={user} onEdit={handleEdit} onDelete={handleDelete} currentUserId={currentUserId} />
                                    ))}
                                </div>
                            </div>
                        )
                    })}
                </div>

                {filtered.length === 0 && (
                    <div className="text-center py-16">
                        <div className="w-12 h-12 bg-white border border-[#dde8f5] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <Search className="w-5 h-5 text-slate-300" />
                        </div>
                        <p className="text-slate-400 text-sm">ไม่พบผู้ใช้ที่ตรงกับการค้นหา</p>
                    </div>
                )}
            </div>

            {/* ── Modal ── */}
            {showModal && (
                <Modal id="user-modal" title={editingUser ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'} onClose={resetForm} size="md">
                    <div className="bg-[#f5f8ff] -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
                        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
                            <div>
                                <label className={labelCls}>Email</label>
                                <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} required />
                            </div>
                            <div>
                                <label className={labelCls}>ชื่อพนักงาน</label>
                                <input type="text" className={inputCls} value={name} onChange={e => setName(e.target.value)} required />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className={labelCls}>รหัสพนักงาน</label>
                                    <input type="text" className={inputCls} placeholder="เช่น 0001" value={employeeId} onChange={e => setEmployeeId(e.target.value)} />
                                </div>
                                <div>
                                    <label className={labelCls}>ตำแหน่งงาน</label>
                                    <input type="text" className={inputCls} placeholder="เช่น Operator" value={jobTitle} onChange={e => setJobTitle(e.target.value)} />
                                </div>
                            </div>
                            <div>
                                <label className={labelCls}>หน่วยงาน</label>
                                <div className="relative">
                                    <select className={`${inputCls} appearance-none pr-10 cursor-pointer`} value={department} onChange={e => setDepartment(e.target.value)}>
                                        <option value="">— เลือกหน่วยงาน —</option>
                                        {DEPARTMENTS.map(d => <option key={d.value} value={d.value}>[{d.short}] {d.label}</option>)}
                                    </select>
                                    <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                                        <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                                {department && (() => {
                                    const found = DEPARTMENTS.find(d => d.value === department)
                                    return found ? (
                                        <div className="mt-1.5 flex items-center gap-2">
                                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 tracking-wider">{found.short}</span>
                                            <span className="text-[12px] text-slate-500">{found.label}</span>
                                        </div>
                                    ) : null
                                })()}
                            </div>
                            <div>
                                <label className={labelCls}>{editingUser ? 'ตั้งรหัสผ่านใหม่ (ไม่บังคับ)' : 'Password'}</label>
                                <input type="password" className={inputCls} value={password} placeholder={editingUser ? 'ปล่อยว่างหากไม่เปลี่ยน' : 'อย่างน้อย 8 ตัวอักษร'} onChange={e => setPassword(e.target.value)} required={!editingUser} />
                            </div>
                            <div>
                                <label className={labelCls}>ระดับสิทธิ์ (Role)</label>
                                <select className={inputCls} value={role} onChange={e => setRole(e.target.value)}>
                                    <option value="moderator">Moderator</option>
                                    <option value="assistant_moderator">Assistant Moderator</option>
                                    <option value="operator">Operator</option>
                                    <option value="user">User</option>
                                </select>
                            </div>
                            <div className="border-t border-[#e8eef8] pt-4 flex justify-end gap-3">
                                <button type="button" onClick={resetForm} className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-[#d0daf0] text-slate-600 font-semibold rounded-lg text-[13px] transition-all">
                                    <X className="w-4 h-4" /> ยกเลิก
                                </button>
                                <button type="submit" className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-semibold rounded-lg text-[13px] shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                                    <Check className="w-4 h-4" /> บันทึก
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}
        </div>
    )
}