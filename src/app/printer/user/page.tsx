'use client'

import { useState, useEffect } from "react"
import Swal from "sweetalert2"
import Modal from "../components/Modal"
import { supabase, supabaseUrl, supabaseAnonKey } from "@/lib/supabase"
import { createClient } from "@supabase/supabase-js"
import { Edit2, Trash2, X, Check } from "lucide-react"

interface User {
    id: string
    email: string
    name: string
    role: string
    employee_id?: string
    job_title?: string
    department?: string
}

export default function UserManagement() {
    const [users, setUsers] = useState<User[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [department, setDepartment] = useState('');
    const [password, setPassword] = useState('');
    const [role, setRole] = useState('user');
    const [isAdmin, setIsAdmin] = useState(false); // only admins should see this

    useEffect(() => {
        checkAdminStatus();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const checkAdminStatus = async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
            const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            if (data?.role === 'moderator' || data?.role === 'assistant_moderator') {
                setIsAdmin(true);
                fetchUsers();
            } else if (!data) {
                // Auto-recovery to sync with Sidebar's recovery
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = fallbackName.toLowerCase().includes('admin') ? 'moderator' : 'user';

                if (fallbackRole === 'moderator') {
                    setIsAdmin(true);
                    fetchUsers();
                    return; // exit early, as they are effectively an admin
                } else {
                    Swal.fire({
                        icon: 'error',
                        title: 'ไม่มีสิทธิ์เข้าถึง',
                        text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น',
                    });
                }
            } else {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่มีสิทธิ์เข้าถึง',
                    text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น',
                });
            }
        }
    }

    const fetchUsers = async () => {
        try {
            const { data, error } = await supabase.from('users').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            if (data) {
                setUsers(data);
            }
        } catch {
            Swal.fire({
                icon: 'error',
                title: 'error',
                text: 'Failed to fetch users'
            })
        }
    }

    const isDuplicateName = (checkName: string, excludeUserId?: string): boolean => {
        return users.some(user =>
            user.name.toLowerCase() === checkName.toLowerCase() &&
            user.id !== excludeUserId
        );
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (editingUser) {
            if (isDuplicateName(name, editingUser.id)) {
                Swal.fire({
                    icon: 'error',
                    title: 'ชื่อผู้ใช้ซ้ำ',
                    text: 'มีชื่อผู้ใช้นี้ในระบบแล้ว กรุณาใช้ชื่ออื่น'
                });
                return;
            }
        } else {
            if (isDuplicateName(name)) {
                Swal.fire({
                    icon: 'error',
                    title: 'ชื่อผู้ใช้ซ้ำ',
                    text: 'มีชื่อผู้ใช้นี้ในระบบแล้ว กรุณาใช้ชื่ออื่น'
                });
                return;
            }

            if (password.length < 6) {
                Swal.fire({
                    icon: 'error',
                    title: 'รหัสผ่านอ่อนเกินไป',
                    text: 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร'
                });
                return;
            }
        }

        try {
            if (editingUser) {
                const { error } = await supabase.from('users').update({
                    name: name,
                    role: role,
                    employee_id: employeeId || null,
                    job_title: jobTitle || null,
                    department: department || null
                }).eq('id', editingUser.id);

                if (error) throw error;

                // If admin provided a new password, reset it using the API
                if (password && password.trim().length > 0) {
                    if (password.length < 8) {
                        Swal.fire({
                            icon: 'error',
                            title: 'รหัสผ่านอ่อนเกินไป',
                            text: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร'
                        });
                        return;
                    }

                    const { data: { session } } = await supabase.auth.getSession();
                    const res = await fetch(`/api/users/${editingUser.id}/password`, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${session?.access_token || ''}`
                        },
                        body: JSON.stringify({ newPassword: password })
                    });

                    if (!res.ok) {
                        const data = await res.json();
                        throw new Error(data.error || 'Failed to update user password');
                    }
                }

                Swal.fire({
                    icon: 'success',
                    title: 'Success',
                    text: password ? `User updated and password reset successfully` : `User updated successfully`,
                    timer: 1500
                })

                setShowModal(false);
                setEditingUser(null);
                setEmail('');
                setName('');
                setEmployeeId('');
                setJobTitle('');
                setDepartment('');
                setPassword('');
                setRole('user');
                fetchUsers();
            } else {
                // ADD NEW USER
                Swal.fire({ title: 'กำลังสร้างบัญชี...', didOpen: () => { Swal.showLoading() } });

                // Create a temporary client so it doesn't log the admin out out our current session
                const tempSupabase = createClient(
                    supabaseUrl,
                    supabaseAnonKey,
                    { auth: { persistSession: false, autoRefreshToken: false } }
                );

                const { data, error: signupError } = await tempSupabase.auth.signUp({
                    email,
                    password
                });

                if (signupError) throw signupError;

                if (data?.user) {
                    const { error: insertError } = await supabase.from('users').insert({
                        id: data.user.id,
                        email: email,
                        name: name,
                        role: role,
                        employee_id: employeeId || null,
                        job_title: jobTitle || null,
                        department: department || null
                    });

                    if (insertError) throw insertError;
                }

                Swal.fire({
                    icon: 'success',
                    title: 'สำเร็จ',
                    text: `สร้างบัญชีผู้ใช้ใหม่เรียบร้อยแล้ว`,
                    timer: 1500
                });

                setShowModal(false);
                setEmail('');
                setName('');
                setEmployeeId('');
                setJobTitle('');
                setDepartment('');
                setPassword('');
                setRole('user');
                fetchUsers();
            }
        } catch (error) {
            console.error(error);
            let errorMessage = (error as Error).message;
            if (errorMessage && errorMessage.includes('users_id_fkey')) {
                errorMessage = 'ไม่สามารถสร้างผู้ใช้ได้ เนื่องจากอีเมลนี้ถูกใช้งานไปแล้ว หรือกำลังรอการยืนยันทางอีเมลอยู่';
            }

            Swal.fire({
                icon: 'error',
                title: 'ข้อผิดพลาด',
                text: errorMessage || `Failed to save user`
            })
        }
    }

    const handleDelete = async (user: User) => {
        const result = await Swal.fire({
            icon: 'warning',
            title: 'Are You Sure ?',
            text: `Do you want to delete user ${user.name}? (This only removes their profile, they can still log in if they didn't delete their auth account)`,
            showCancelButton: true,
            confirmButtonText: 'Delete',
            cancelButtonText: 'Cancel'
        })

        if (result.isConfirmed) {
            try {
                const { data: { session } } = await supabase.auth.getSession();

                // Call the API route to delete from auth.users (requires service_role key on the server)
                const res = await fetch(`/api/users/${user.id}`, {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token || ''}`
                    }
                });

                if (!res.ok) {
                    const data = await res.json();
                    throw new Error(data.error || 'Failed to delete user via API');
                }

                // Note: If the api route deleted the user from auth.users, 
                // it might cascade to public.users if configured.
                // Just in case, we also try to delete from public.users here.
                await supabase.from('users').delete().eq('id', user.id);

                Swal.fire({
                    icon: 'success',
                    title: 'Success',
                    text: 'User Deleted Successfully',
                    timer: 1000
                })

                fetchUsers()
            } catch (error) {
                Swal.fire({
                    icon: 'error',
                    title: 'Error',
                    text: error instanceof Error ? error.message : 'Failed to delete user'
                })
            }
        }
    }

    const handleEdit = (user: User) => {
        setEditingUser(user)
        setEmail(user.email)
        setName(user.name)
        setEmployeeId(user.employee_id || '');
        setJobTitle(user.job_title || '');
        setDepartment(user.department || '');
        setRole(user.role ?? 'user');
        setPassword('');
        setShowModal(true)
    }

    const handleAdd = () => {
        setEditingUser(null);
        setEmail('');
        setName('');
        setEmployeeId('');
        setJobTitle('');
        setDepartment('');
        setPassword('');
        setRole('user');
        setShowModal(true);
    }

    if (!isAdmin) {
        return <div className="p-8 text-center text-xl text-yellow-200">คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (Restricted)</div>
    }

    return (
        <div className="container mx-auto px-1 sm:px-4 text-gray-800 w-full max-w-full overflow-hidden">
            <h1 className="text-2xl sm:text-4xl font-extrabold mb-4 sm:mb-6 text-blue-900 tracking-tight text-center sm:text-left drop-shadow-sm">
                จัดการบัญชีผู้ใช้
            </h1>
            <div className="flex justify-center sm:justify-start mb-6">
                <button
                    className="bg-green-600 text-white hover:bg-green-700 px-4 py-3 sm:px-5 sm:py-3 rounded-lg transition-all font-bold shadow-md text-base w-full sm:w-auto flex items-center justify-center"
                    onClick={handleAdd}>
                    <i className="fas fa-user-plus mr-2 text-lg"></i> สร้างบัญชีใหม่
                </button>
            </div>

            <div className="bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden border border-white/20">
                <div className="overflow-x-auto w-full">
                    <table className="w-full min-w-max text-left border-collapse">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-100 to-indigo-50 border-b border-blue-200">
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50 w-[120px]">รหัสพนักงาน</th>
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50">Email</th>
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50 w-[200px]">ชื่อพนักงาน</th>
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50 w-[150px]">ตำแหน่ง</th>
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50 w-[150px]">หน่วยงาน</th>
                                <th className="p-4 font-semibold text-blue-900 border-r border-blue-200/50 w-[100px]">Role</th>
                                <th className="p-4 text-center font-semibold text-blue-900 w-[120px]">
                                    จัดการ
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {users.map((user, index) => (
                                <tr key={user.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50 hover:bg-blue-50/50 transition-colors'}>
                                    <td className="p-4 text-gray-700">{user.employee_id || '-'}</td>
                                    <td className="p-4 text-sm text-gray-500">{user.email}</td>
                                    <td className="p-4 font-medium text-gray-900">{user.name}</td>
                                    <td className="p-4 text-sm text-gray-500">{user.job_title || '-'}</td>
                                    <td className="p-4 text-sm text-gray-800">{user.department || '-'}</td>
                                    <td className="p-4">
                                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${user.role === 'moderator' ? 'bg-purple-100 text-purple-700' :
                                            user.role === 'assistant_moderator' ? 'bg-indigo-100 text-indigo-700' :
                                                user.role === 'operator' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-green-100 text-green-700'
                                            }`}>
                                            {
                                                user.role === 'moderator' ? 'Moderator' :
                                                    user.role === 'assistant_moderator' ? 'Assistant Moderator' :
                                                        user.role === 'operator' ? 'Operator' : 'User'
                                            }
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <button
                                            onClick={() => handleEdit(user)}
                                            className="text-white bg-indigo-500 hover:bg-indigo-600 p-2.5 rounded-xl transition-colors shadow-md hover:shadow-lg mr-2"
                                            title="แก้ไข"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(user)}
                                            className="text-white bg-red-500 hover:bg-red-600 p-2.5 rounded-xl transition-colors shadow-md hover:shadow-lg"
                                            title="ลบ"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500 italic">No users found.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {showModal && (
                <Modal
                    id="user-modal"
                    title={editingUser ? 'แก้ไขผู้ใช้งาน' : 'เพิ่มผู้ใช้งาน'}
                    onClose={() => setShowModal(false)}
                    size="md">
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">Email</label>
                            <input
                                type="email"
                                className={`w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300 ${editingUser ? '!bg-gray-100' : ''}`}
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                disabled={!!editingUser}
                                required />
                            {editingUser && <small className="text-gray-500 mt-1 block">อีเมลไม่สามารถแก้ไขได้</small>}
                        </div>

                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">ชื่อพนักงาน</label>
                            <input
                                type="text"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                required />
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">รหัสพนักงาน</label>
                                <input
                                    type="text"
                                    className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                    value={employeeId}
                                    placeholder="เช่น 0001"
                                    onChange={e => setEmployeeId(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block mb-2 font-semibold text-gray-700">ตำแหน่งงาน</label>
                                <input
                                    type="text"
                                    className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                    value={jobTitle}
                                    placeholder="โปรดกรอกตำแหน่งงาน"
                                    onChange={e => setJobTitle(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">หน่วยงาน</label>
                            <input
                                type="text"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={department}
                                placeholder="เช่น ฝ่ายผลิต"
                                onChange={e => setDepartment(e.target.value)}
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">
                                {editingUser ? 'ตั้งรหัสผ่านใหม่ (ไม่บังคับ)' : 'Password'}
                            </label>
                            <input
                                type="password"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={password}
                                placeholder={editingUser ? 'ปล่อยว่างไว้หากไม่ต้องการเปลี่ยนรหัสผ่าน' : 'รหัสผ่านสำหรับเข้าสู่ระบบ'}
                                onChange={e => setPassword(e.target.value)}
                                required={!editingUser} />
                        </div>

                        <div className="mb-6">
                            <label className="block mb-2 font-semibold text-gray-700">ระดับสิทธิ์ (Role)</label>
                            <select className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300" value={role}
                                onChange={e => setRole(e.target.value)}>
                                <option value="moderator">Moderator</option>
                                <option value="assistant_moderator">Assistant Moderator</option>
                                <option value="operator">Operator</option>
                                <option value="user">User</option>
                            </select>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                type="button"
                                onClick={() => setShowModal(false)}
                                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors">
                                <X className="mr-2 w-4 h-4" /> ยกเลิก
                            </button>
                            <button
                                type="submit"
                                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-lg shadow-lg transition-transform hover:scale-105">
                                <Check className="mr-2 w-4 h-4" /> บันทึก
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
