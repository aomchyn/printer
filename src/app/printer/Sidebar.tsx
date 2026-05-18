'use client'

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Swal from "sweetalert2"
import { supabase } from "@/lib/supabase"
import { X, Printer, UserCircle, LogOut, LineChart, Package, ShoppingCart, Users, History, ShieldAlert, Trash2 } from "lucide-react"

interface SidebarProps {
    isOpen: boolean;
    setIsOpen: (isOpen: boolean) => void;
}

export default function Sidebar({ isOpen, setIsOpen }: SidebarProps) {
    const [name, setName] = useState('');
    const [role, setRole] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [isProfileOpen, setIsProfileOpen] = useState(false);
    const [profileForm, setProfileForm] = useState({
        name: '',
        employee_id: '',
        job_title: '',
        department: '',
        new_password: '',
        confirm_password: '',
    });
    const [isSavingProfile, setIsSavingProfile] = useState(false);

    const router = useRouter();
    const pathname = usePathname();

    // ── ไม่แตะ logic เลย ──────────────────────────────────────────────
    async function fetchData() {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();
            if (sessionError || !session) { router.push('/login'); return; }
            const { data: userData } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (userData) {
                setName(userData.name); setRole(userData.role);
                setEmployeeId(userData.employee_id || ''); setJobTitle(userData.job_title || ''); setDepartment(userData.department || '');
            } else {
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = 'user';
                await supabase.from('users').insert({ id: session.user.id, email: session.user.email, name: fallbackName, role: fallbackRole, department: 'ไม่ระบุ' });
                setName(fallbackName); setRole(fallbackRole);
            }
        } catch (error) { console.error('Failure mapping user info', error); }
    }

    useEffect(() => {
        fetchData();
        const channel = supabase.channel('sidebar-roles')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users' }, (payload) => {
                supabase.auth.getSession().then(({ data: { session } }) => {
                    if (session?.user.id === payload.new.id) setRole(payload.new.role);
                });
            }).subscribe();
        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openProfile = () => {
        setProfileForm({ name, employee_id: employeeId, job_title: jobTitle, department, new_password: '', confirm_password: '' });
        setIsProfileOpen(true);
    };

    const saveProfile = async () => {
        if (!profileForm.name.trim()) { Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อ', confirmButtonColor: '#6b7280' }); return; }
        if (profileForm.new_password && profileForm.new_password !== profileForm.confirm_password) { Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ตรงกัน', confirmButtonColor: '#6b7280' }); return; }
        if (profileForm.new_password && profileForm.new_password.length < 8) { Swal.fire({ icon: 'warning', title: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', confirmButtonColor: '#6b7280' }); return; }
        const hasChanges = profileForm.name.trim() !== name || profileForm.employee_id.trim() !== employeeId || profileForm.job_title.trim() !== jobTitle || profileForm.department.trim() !== department || profileForm.new_password !== '';
        if (!hasChanges) { Swal.fire({ icon: 'info', title: 'ไม่มีการเปลี่ยนแปลง', text: 'คุณยังไม่ได้แก้ไขข้อมูลโปรไฟล์ใดๆ', confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280' }); return; }
        setIsSavingProfile(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;
            const { error: updateError } = await supabase.from('users').update({ name: profileForm.name.trim(), employee_id: profileForm.employee_id.trim() || null, job_title: profileForm.job_title.trim() || null, department: profileForm.department.trim() || null }).eq('id', session.user.id);
            if (updateError) throw updateError;
            if (profileForm.new_password) { const { error: pwError } = await supabase.auth.updateUser({ password: profileForm.new_password }); if (pwError) throw pwError; await supabase.auth.refreshSession(); }
            const changes: Record<string, { before: string; after: string }> = {};
            if (profileForm.name.trim() !== name) changes['ชื่อ'] = { before: name, after: profileForm.name.trim() };
            if (profileForm.employee_id.trim() !== employeeId) changes['รหัสพนักงาน'] = { before: employeeId, after: profileForm.employee_id.trim() };
            if (profileForm.job_title.trim() !== jobTitle) changes['ตำแหน่งงาน'] = { before: jobTitle, after: profileForm.job_title.trim() };
            if (profileForm.department.trim() !== department) changes['หน่วยงาน'] = { before: department, after: profileForm.department.trim() };
            if (profileForm.new_password) changes['รหัสผ่าน'] = { before: '••••••', after: '(เปลี่ยนแล้ว)' };
            const changeSummary = Object.entries(changes).map(([field, { before, after }]) => `${field}: "${before || '-'}" → "${after || '-'}"`).join(' | ');
            await supabase.from('audit_logs').insert([{ user_id: session.user.id, user_name: profileForm.name.trim(), action: 'UPDATE_PROFILE', summary: `แก้ไขโปรไฟล์: ${changeSummary}`, changes, created_at: new Date().toISOString() }]);
            setName(profileForm.name.trim()); setEmployeeId(profileForm.employee_id.trim()); setJobTitle(profileForm.job_title.trim()); setDepartment(profileForm.department.trim());
            setIsProfileOpen(false);
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch (err: any) {
            Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err?.message || 'กรุณาลองใหม่อีกครั้ง' });
        } finally { setIsSavingProfile(false); }
    };

    const handleLogout = async () => {
        try {
            const button = await Swal.fire({ icon: 'warning', title: 'ยืนยันลงชื่อออก', text: 'คุณแน่ใจที่จะลงชื่อออกจากระบบหรือไม่ ?', showCancelButton: true, showConfirmButton: true });
            if (button.isConfirmed) { await supabase.auth.signOut(); router.push('/login'); }
        } catch (err) { Swal.fire({ icon: 'error', title: 'Error', text: 'ไม่สามารถลงชื่อออกได้' + err }); }
    };

    const navigate = (path: string) => { router.push(path); setIsOpen(false); };
    // ── จบ logic ──────────────────────────────────────────────────────

    const roleBadge: Record<string, { label: string; cls: string }> = {
        moderator: { label: 'Moderator', cls: 'text-purple-300 bg-purple-500/20 border-purple-500/30' },
        assistant_moderator: { label: 'Asst. Moderator', cls: 'text-indigo-300 bg-indigo-500/20 border-indigo-500/30' },
        operator: { label: 'Operator', cls: 'text-blue-300 bg-blue-500/20 border-blue-500/30' },
    };
    const { label: roleLabel, cls: roleCls } = roleBadge[role] ?? { label: 'User', cls: 'text-emerald-300 bg-emerald-500/20 border-emerald-500/30' };

    const navItem = (path: string, icon: React.ReactNode, label: string, activeCls = 'bg-white/15 text-white shadow-sm') => (
        <button
            onClick={() => navigate(path)}
            className={`w-full text-left px-4 py-2.5 rounded-xl flex items-center gap-3 text-sm font-semibold transition-all duration-200
                ${pathname.includes(path.split('/').pop()!) ? activeCls + ' border border-white/15' : 'text-blue-100/80 hover:bg-white/10 hover:text-white border border-transparent'}`}
        >
            <span className="shrink-0 opacity-80">{icon}</span>
            {label}
        </button>
    );

    return (
        <>
            {/* Overlay */}
            {isOpen && (
                <div className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsOpen(false)} />
            )}

            {/* Sidebar */}
            <div className={`
                fixed inset-y-0 left-0 z-50 w-72 flex flex-col
                bg-gradient-to-b from-[#0a1628] via-[#0f1e3d] to-[#152a54]
                border-r border-white/8 shadow-2xl
                transform transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>

                {/* ── Brand ── */}
                <div className="px-5 py-5 border-b border-white/8 relative overflow-hidden shrink-0">
                    {/* glow */}
                    <div className="absolute -top-6 -right-6 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                    <div className="flex items-center gap-3 relative">
                        <div className="w-9 h-9 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center shadow-inner shrink-0">
                            <Printer className="w-4.5 h-4.5 text-blue-300" />
                        </div>
                        <div>
                            <div className="text-[16px] font-black text-white tracking-tight leading-none">Printer OP</div>
                            <div className="text-[10px] text-blue-300/70 font-medium mt-0.5 tracking-wider uppercase">Label Management System</div>
                        </div>
                    </div>

                    {/* Mobile close */}
                    <button className="md:hidden absolute top-4 right-4 p-1.5 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all" onClick={() => setIsOpen(false)}>
                        <X size={16} />
                    </button>
                </div>

                {/* ── User card ── */}
                <div className="px-4 py-4 border-b border-white/8 shrink-0">
                    <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                        {/* Avatar row */}
                        <div className="px-4 py-3 flex items-center gap-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-black text-sm shrink-0 shadow-md shadow-blue-900/40">
                                {name ? name.charAt(0).toUpperCase() : '?'}
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-white font-bold text-sm truncate leading-tight">{name || 'Loading...'}</div>
                                <span className={`inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full border tracking-wider ${roleCls}`}>
                                    {roleLabel}
                                </span>
                            </div>
                        </div>

                        {/* Info rows */}
                        {(employeeId || jobTitle || department) && (
                            <div className="px-4 pb-3 flex flex-col gap-1.5 text-[11px] border-t border-white/8 pt-2.5">
                                {employeeId && (
                                    <div className="flex justify-between items-center">
                                        <span className="text-blue-300/70 font-medium">รหัสพนักงาน</span>
                                        <span className="text-white/90 font-bold font-mono">{employeeId}</span>
                                    </div>
                                )}
                                {jobTitle && (
                                    <div className="flex justify-between items-center gap-2">
                                        <span className="text-blue-300/70 font-medium shrink-0">ตำแหน่ง</span>
                                        <span className="text-white/90 font-medium truncate text-right">{jobTitle}</span>
                                    </div>
                                )}
                                {department && (
                                    <div className="flex justify-between items-center gap-2">
                                        <span className="text-blue-300/70 font-medium shrink-0">หน่วยงาน</span>
                                        <span className="text-white/90 font-medium truncate text-right">{department.split(' ')[0]}</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2 mt-3">
                        <button onClick={openProfile} className="flex-1 flex items-center justify-center gap-1.5 bg-white/8 hover:bg-white/15 border border-white/10 hover:border-white/20 text-white/80 hover:text-white py-2 rounded-xl text-xs font-semibold transition-all duration-200">
                            <UserCircle className="w-3.5 h-3.5" /> แก้ไขโปรไฟล์
                        </button>
                        <button onClick={handleLogout} className="flex items-center justify-center gap-1.5 bg-rose-500/20 hover:bg-rose-500/35 border border-rose-500/30 hover:border-rose-400/50 text-rose-300 hover:text-rose-200 px-3 py-2 rounded-xl text-xs font-semibold transition-all duration-200">
                            <LogOut className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>

                {/* ── Nav ── */}
                <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
                    {navItem('/printer/dashboard', <LineChart className="w-4 h-4" />, 'Dashboard')}
                    {(role === 'moderator' || role === 'assistant_moderator' || role === 'operator') &&
                        navItem('/printer/statistics', <History className="w-4 h-4" />, 'สถิติย้อนหลัง')}
                    {navItem('/printer/product', <Package className="w-4 h-4" />, 'Product')}
                    {navItem('/printer/order', <ShoppingCart className="w-4 h-4" />, 'Orders')}

                    {(role === 'moderator' || role === 'assistant_moderator') && (
                        <div className="pt-4 mt-2 border-t border-white/8">
                            <div className="text-[10px] font-black text-white/30 uppercase tracking-widest mb-2 px-2">Admin Tools</div>
                            <div className="space-y-1">
                                {navItem('/printer/user', <Users className="w-4 h-4" />, 'Manage Users', 'bg-purple-500/20 text-purple-200 border-purple-500/25')}
                                {role === 'moderator' &&
                                    navItem('/printer/logs', <ShieldAlert className="w-4 h-4" />, 'Audit Logs', 'bg-indigo-500/20 text-indigo-200 border-indigo-500/25')}
                                {navItem('/printer/trash', <Trash2 className="w-4 h-4" />, 'ถังขยะ', 'bg-rose-500/20 text-rose-200 border-rose-500/25')}
                            </div>
                        </div>
                    )}
                </nav>
            </div>

            {/* ── Profile Modal ── */}
            {isProfileOpen && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md border border-slate-200/80 overflow-hidden">

                        {/* Header */}
                        <div className="bg-gradient-to-r from-[#0f1e3d] to-[#1e3a8a] px-6 py-4 flex justify-between items-center">
                            <div className="flex items-center gap-2.5">
                                <div className="p-1.5 bg-white/10 rounded-xl border border-white/15">
                                    <UserCircle className="w-4 h-4 text-blue-200" />
                                </div>
                                <h2 className="text-[15px] font-black text-white tracking-tight">แก้ไขโปรไฟล์</h2>
                            </div>
                            <button onClick={() => setIsProfileOpen(false)} className="p-1.5 text-white/50 hover:text-white bg-white/10 hover:bg-white/20 rounded-lg transition-all">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-4 max-h-[65vh] overflow-y-auto">
                            {[
                                { label: 'ชื่อ', key: 'name', required: true, type: 'text' },
                                { label: 'รหัสพนักงาน', key: 'employee_id', type: 'text' },
                                { label: 'ตำแหน่งงาน', key: 'job_title', type: 'text' },
                            ].map(({ label, key, required, type }) => (
                                <div key={key}>
                                    <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                                        {label} {required && <span className="text-rose-500">*</span>}
                                    </label>
                                    <input
                                        type={type}
                                        value={profileForm[key as keyof typeof profileForm]}
                                        onChange={e => setProfileForm(f => ({ ...f, [key]: e.target.value }))}
                                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-sm font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                    />
                                </div>
                            ))}

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">หน่วยงาน</label>
                                <select
                                    value={profileForm.department}
                                    onChange={e => setProfileForm(f => ({ ...f, department: e.target.value }))}
                                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-sm font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                >
                                    <option value="">— เลือกหน่วยงาน —</option>
                                    <option value="QA ประกันคุณภาพ">QA — ประกันคุณภาพ</option>
                                    <option value="PD ฝ่ายผลิต">PD — ฝ่ายผลิต</option>
                                    <option value="WH คลังสินค้า">WH — คลังสินค้า</option>
                                    <option value="VD ผลิตยาสัตว์">VD — ผลิตยาสัตว์</option>
                                </select>
                            </div>

                            <div className="pt-3 border-t border-slate-100">
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">เปลี่ยนรหัสผ่าน (ถ้าต้องการ)</div>
                                <div className="space-y-3">
                                    {[
                                        { label: 'รหัสผ่านใหม่', key: 'new_password', placeholder: 'ปล่อยว่างถ้าไม่ต้องการเปลี่ยน' },
                                        { label: 'ยืนยันรหัสผ่านใหม่', key: 'confirm_password', placeholder: '' },
                                    ].map(({ label, key, placeholder }) => (
                                        <div key={key}>
                                            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
                                            <input
                                                type="password"
                                                value={profileForm[key as keyof typeof profileForm]}
                                                onChange={e => setProfileForm(f => ({ ...f, [key]: e.target.value }))}
                                                placeholder={placeholder}
                                                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-sm font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                                            />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
                            <button onClick={() => setIsProfileOpen(false)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs transition-all duration-200">
                                ยกเลิก
                            </button>
                            <button onClick={saveProfile} disabled={isSavingProfile} className="flex-1 bg-[#0f1e3d] hover:bg-[#152a54] disabled:bg-slate-300 text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-blue-900/20 transition-all duration-200">
                                {isSavingProfile ? 'กำลังบันทึก...' : '💾 บันทึกการแก้ไข'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}