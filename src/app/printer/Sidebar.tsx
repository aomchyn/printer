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

    // ✅ Profile modal state
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

    async function fetchData() {
        try {
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                router.push('/login');
                return;
            }

            const { data: userData } = await supabase
                .from('users')
                .select('*')
                .eq('id', session.user.id)
                .single();

            if (userData) {
                setName(userData.name);
                setRole(userData.role);
                setEmployeeId(userData.employee_id || '');
                setJobTitle(userData.job_title || '');
                setDepartment(userData.department || '');
            } else {
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = 'user';

                await supabase.from('users').insert({
                    id: session.user.id,
                    email: session.user.email,
                    name: fallbackName,
                    role: fallbackRole,
                    department: 'ไม่ระบุ'
                });

                setName(fallbackName);
                setRole(fallbackRole);
            }
        } catch (error) {
            console.error('Failure mapping user info', error);
        }
    }

    useEffect(() => {
        fetchData();

        const channel = supabase.channel('sidebar-roles')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'users' },
                (payload) => {
                    supabase.auth.getSession().then(({ data: { session } }) => {
                        if (session?.user.id === payload.new.id) {
                            setRole(payload.new.role);
                        }
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ✅ เปิด Modal และ pre-fill ข้อมูลปัจจุบัน
    const openProfile = () => {
        setProfileForm({
            name,
            employee_id: employeeId,
            job_title: jobTitle,
            department,
            new_password: '',
            confirm_password: '',
        });
        setIsProfileOpen(true);
    };

    // ✅ บันทึกโปรไฟล์
    const saveProfile = async () => {
        if (!profileForm.name.trim()) {
            Swal.fire({ icon: 'warning', title: 'กรุณากรอกชื่อ', confirmButtonColor: '#6b7280' });
            return;
        }
        if (profileForm.new_password && profileForm.new_password !== profileForm.confirm_password) {
            Swal.fire({ icon: 'error', title: 'รหัสผ่านไม่ตรงกัน', confirmButtonColor: '#6b7280' });
            return;
        }
        if (profileForm.new_password && profileForm.new_password.length < 8) {
            Swal.fire({ icon: 'warning', title: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร', confirmButtonColor: '#6b7280' });
            return;
        }

       // ✅ เช็คว่ามีการเปลี่ยนแปลงจริงหรือไม่
const hasChanges =
    profileForm.name.trim()        !== name        ||
    profileForm.employee_id.trim() !== employeeId  ||
    profileForm.job_title.trim()   !== jobTitle    ||
    profileForm.department.trim()  !== department  ||
    profileForm.new_password       !== '';

if (!hasChanges) {
    Swal.fire({
        icon: 'info',
        title: 'ไม่มีการเปลี่ยนแปลง',
        text: 'คุณยังไม่ได้แก้ไขข้อมูลโปรไฟล์ใดๆ',
        confirmButtonText: 'รับทราบ',
        confirmButtonColor: '#6b7280',
    });
    return;
}

setIsSavingProfile(true);
try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) return;

            // ✅ อัปเดต users table
            const { error: updateError } = await supabase.from('users').update({
                name:        profileForm.name.trim(),
                employee_id: profileForm.employee_id.trim() || null,
                job_title:   profileForm.job_title.trim() || null,
                department:  profileForm.department.trim() || null,
            }).eq('id', session.user.id);

            if (updateError) throw updateError;

            // ✅ เปลี่ยนรหัสผ่านถ้ากรอกมา
            if (profileForm.new_password) {
                const { error: pwError } = await supabase.auth.updateUser({
                    password: profileForm.new_password,
                });
                if (pwError) throw pwError;
            }

            // ✅ บันทึก Audit Log
const changes: Record<string, { before: string; after: string }> = {};
if (profileForm.name.trim() !== name)              changes['ชื่อ']          = { before: name,       after: profileForm.name.trim() };
if (profileForm.employee_id.trim() !== employeeId) changes['รหัสพนักงาน']   = { before: employeeId, after: profileForm.employee_id.trim() };
if (profileForm.job_title.trim() !== jobTitle)     changes['ตำแหน่งงาน']    = { before: jobTitle,   after: profileForm.job_title.trim() };
if (profileForm.department.trim() !== department)  changes['หน่วยงาน']      = { before: department, after: profileForm.department.trim() };
if (profileForm.new_password)                       changes['รหัสผ่าน']      = { before: '••••••',   after: '(เปลี่ยนแล้ว)' };

const changeSummary = Object.entries(changes)
    .map(([field, { before, after }]) => `${field}: "${before || '-'}" → "${after || '-'}"`)
    .join(' | ');

await supabase.from('audit_logs').insert([{
    user_id:    session.user.id,
    user_name:  profileForm.name.trim(),
    action:     'UPDATE_PROFILE',
    summary:    `แก้ไขโปรไฟล์: ${changeSummary}`,
    changes,
    created_at: new Date().toISOString(),
}]);

// ✅ อัปเดต state ใน sidebar ทันที
setName(profileForm.name.trim());
            setEmployeeId(profileForm.employee_id.trim());
            setJobTitle(profileForm.job_title.trim());
            setDepartment(profileForm.department.trim());

            setIsProfileOpen(false);
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch (err: any) {
            Swal.fire({ icon: 'error', title: 'บันทึกไม่สำเร็จ', text: err?.message || 'กรุณาลองใหม่อีกครั้ง' });
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleLogout = async () => {
        try {
            const button = await Swal.fire({
                icon: 'warning',
                title: 'ยืนยันลงชื่อออก',
                text: 'คุณแน่ใจที่จะลงชื่อออกจากระบบหรือไม่ ?',
                showCancelButton: true,
                showConfirmButton: true
            });
            if (button.isConfirmed) {
                await supabase.auth.signOut();
                router.push('/login');
            }
        } catch (err) {
            Swal.fire({ icon: 'error', title: 'Error', text: 'ไม่สามารถลงชื่อออกได้' + err });
        }
    };

    const navigate = (path: string) => {
        router.push(path);
        setIsOpen(false);
    };

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar */}
            <div className={`
                fixed inset-y-0 left-0 z-50
                w-72 bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 text-white p-4 md:p-6 shadow-2xl flex flex-col
                transform transition-transform duration-300 ease-in-out
                md:relative md:translate-x-0
                ${isOpen ? 'translate-x-0' : '-translate-x-full'}
            `}>
                <div className="sidebar-container h-full flex flex-col">
                    <div className="sidebar-title mb-6 text-center relative border-b border-b-white/10 pb-4">
                        <div className="flex items-center justify-between text-2xl font-bold p-6 border-b border-blue-800/50 text-white tracking-widest bg-gradient-to-r from-blue-900 to-indigo-900">
                            <span className="flex items-center"><Printer className="mr-3 text-blue-400 w-6 h-6" />Printer OP</span>
                        </div>

                        {/* Mobile close button */}
                        <button
                            className="md:hidden absolute -top-2 -right-2 p-2 text-white/70 hover:text-white bg-white/10 rounded-full"
                            onClick={() => setIsOpen(false)}
                        >
                            <X size={20} />
                        </button>

                        {/* User info */}
                        <div className="text-sm font-medium mt-6 mb-4 text-white bg-white/10 p-4 rounded-xl shadow-inner border border-white/5 text-left flex flex-col gap-2">
                            <div className="p-4 bg-indigo-800/40 rounded-xl mb-4 text-sm border border-indigo-700 hover:bg-indigo-700/40 transition flex items-center shadow-inner">
                                <UserCircle className="mr-2 w-5 h-5 shrink-0" />
                                <span className="truncate">{name || 'Loading...'}</span>
                            </div>

                            {employeeId && (
                                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-1">
                                    <span className="text-white/60">รหัสพนักงาน</span>
                                    <span className="text-white/90 truncate ml-2 max-w-[60%]">{employeeId}</span>
                                </div>
                            )}

                            {jobTitle && (
                                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-1">
                                    <span className="text-white/60">ตำแหน่ง</span>
                                    <span className="text-white/90 truncate ml-2 max-w-[70%]">{jobTitle}</span>
                                </div>
                            )}

                            {department && (
                                <div className="flex justify-between items-center text-xs border-b border-white/5 pb-1">
                                    <span className="text-white/60">หน่วยงาน</span>
                                    <span className="text-white/90 truncate ml-2 max-w-[60%]">{department}</span>
                                </div>
                            )}

                            <div className="flex justify-between items-center text-xs pt-1">
                                <span className="text-white/60">สิทธิ์ (Role)</span>
                                <span className={`uppercase tracking-wider font-bold ${
                                    role === 'moderator'           ? 'text-purple-400' :
                                    role === 'assistant_moderator' ? 'text-indigo-400' :
                                    role === 'operator'            ? 'text-blue-400'   :
                                                                     'text-emerald-400'
                                }`}>
                                    {role === 'moderator'           ? 'Moderator'       :
                                     role === 'assistant_moderator' ? 'Asst. Moderator' :
                                     role === 'operator'            ? 'Operator'        : 'User'}
                                </span>
                            </div>
                        </div>

                        {/* ✅ ปุ่มแก้ไขโปรไฟล์ + ออกจากระบบ */}
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={openProfile}
                                className="bg-white/10 hover:bg-white/20 text-white px-4 py-1.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition w-full"
                            >
                                <UserCircle className="w-4 h-4" />
                                <span>แก้ไขโปรไฟล์</span>
                            </button>
                            <button
                                className="bg-red-500/80 hover:bg-red-600 text-white px-4 py-1.5 rounded-lg flex items-center justify-center gap-2 text-sm font-medium transition"
                                onClick={handleLogout}
                            >
                                <LogOut className="w-4 h-4" />
                                <span>ออกจากระบบ</span>
                            </button>
                        </div>
                    </div>

                    {/* Nav */}
                    <nav className="mt-8 overflow-y-auto pb-8 h-full">
                        <ul className="space-y-2">
                            <li>
                                <button onClick={() => navigate('/printer/dashboard')}
                                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('dashboard') ? 'bg-blue-600 text-white shadow-md' : 'text-gray-200 hover:bg-white/10'}`}>
                                    <LineChart className="mr-3 w-5 h-5" />
                                    <span>Dashboard</span>
                                </button>
                            </li>

                            {(role === 'moderator' || role === 'assistant_moderator' || role === 'operator') && (
                                <li>
                                    <button onClick={() => navigate('/printer/statistics')}
                                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('statistics') ? 'bg-blue-600 text-white shadow-md' : 'text-gray-200 hover:bg-white/10'}`}>
                                        <History className="mr-3 w-5 h-5" />
                                        <span>สถิติย้อนหลัง</span>
                                    </button>
                                </li>
                            )}

                            <li>
                                <button onClick={() => navigate('/printer/product')}
                                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('product') ? 'bg-blue-600 text-white shadow-md' : 'text-gray-200 hover:bg-white/10'}`}>
                                    <Package className="mr-3 w-5 h-5" />
                                    <span>Product</span>
                                </button>
                            </li>

                            <li>
                                <button onClick={() => navigate('/printer/order')}
                                    className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('order') ? 'bg-blue-600 text-white shadow-md' : 'text-gray-200 hover:bg-white/10'}`}>
                                    <ShoppingCart className="mr-3 w-5 h-5" />
                                    <span>Orders</span>
                                </button>
                            </li>

                            {(role === 'moderator' || role === 'assistant_moderator') && (
                                <li className="pt-4 border-t border-white/10 mt-4">
                                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">Admin Tools</div>
                                    <button onClick={() => navigate('/printer/user')}
                                        className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('user') ? 'bg-purple-600 text-white shadow-md' : 'text-purple-200 hover:bg-white/10'} mb-2`}>
                                        <Users className="mr-3 w-5 h-5" />
                                        <span>Manage Users</span>
                                    </button>
                                    {role === 'moderator' && (
                                        <button onClick={() => navigate('/printer/logs')}
                                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition ${pathname.includes('logs') ? 'bg-indigo-600 text-white shadow-md' : 'text-indigo-200 hover:bg-white/10'}`}>
                                            <ShieldAlert className="mr-3 w-5 h-5" />
                                            <span>Audit Logs</span>
                                        </button>
                                    )}
                                    {(role === 'moderator' || role === 'assistant_moderator') && (
                                        <button onClick={() => navigate('/printer/trash')}
                                            className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition mt-2 ${pathname.includes('trash') ? 'bg-red-600 text-white shadow-md' : 'text-red-300 hover:bg-white/10'}`}>
                                            <Trash2 className="mr-3 w-5 h-5" />
                                            <span>ถังขยะ</span>
                                        </button>
                                    )}
                                </li>
                            )}
                        </ul>
                    </nav>
                </div>
            </div>

            {/* ✅ Profile Edit Modal */}
            {isProfileOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md text-gray-800">

                        {/* Header */}
                        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                            <h2 className="text-xl font-bold text-gray-800">✏️ แก้ไขโปรไฟล์</h2>
                            <button onClick={() => setIsProfileOpen(false)} className="text-gray-400 hover:text-gray-600 transition">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-4 space-y-4 max-h-[70vh] overflow-y-auto">

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                    ชื่อ <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={profileForm.name}
                                    onChange={e => setProfileForm(f => ({ ...f, name: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสพนักงาน</label>
                                <input
                                    type="text"
                                    value={profileForm.employee_id}
                                    onChange={e => setProfileForm(f => ({ ...f, employee_id: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">ตำแหน่งงาน</label>
                                <input
                                    type="text"
                                    value={profileForm.job_title}
                                    onChange={e => setProfileForm(f => ({ ...f, job_title: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">หน่วยงาน</label>
                                <input
                                    type="text"
                                    value={profileForm.department}
                                    onChange={e => setProfileForm(f => ({ ...f, department: e.target.value }))}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                />
                            </div>

                            {/* เปลี่ยนรหัสผ่าน */}
                            <div className="pt-2 border-t border-gray-100">
                                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
                                    เปลี่ยนรหัสผ่าน (ถ้าต้องการ)
                                </p>
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">รหัสผ่านใหม่</label>
                                        <input
                                            type="password"
                                            value={profileForm.new_password}
                                            onChange={e => setProfileForm(f => ({ ...f, new_password: e.target.value }))}
                                            placeholder="ปล่อยว่างถ้าไม่ต้องการเปลี่ยน"
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">ยืนยันรหัสผ่านใหม่</label>
                                        <input
                                            type="password"
                                            value={profileForm.confirm_password}
                                            onChange={e => setProfileForm(f => ({ ...f, confirm_password: e.target.value }))}
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="flex gap-3 px-6 py-4 border-t border-gray-100">
                            <button
                                onClick={() => setIsProfileOpen(false)}
                                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2.5 rounded-lg font-semibold text-sm transition"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={saveProfile}
                                disabled={isSavingProfile}
                                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white py-2.5 rounded-lg font-semibold text-sm transition"
                            >
                                {isSavingProfile ? 'กำลังบันทึก...' : '💾 บันทึก'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}