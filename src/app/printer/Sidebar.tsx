'use client'

import { useState, useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import Swal from "sweetalert2"
import { supabase } from "@/lib/supabase"
import { X, Printer, UserCircle, LogOut, LineChart, Package, ShoppingCart, Users, History, ShieldAlert } from "lucide-react"

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
                // AUTO RECOVERY: If a user was created directly in Supabase Dashboard,
                // their public.users row will be missing. Let's create it automatically.
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = fallbackName.toLowerCase().includes('admin') ? 'moderator' : 'user';

                // Insert missing profile
                await supabase.from('users').insert({
                    id: session.user.id,
                    email: session.user.email,
                    name: fallbackName,
                    role: fallbackRole,
                    department: 'Admin'
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

        // Listen for changes to the user's role in real-time
        const channel = supabase.channel('sidebar-roles')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'users'
                },
                (payload) => {
                    // Update role immediately if it's the current user
                    supabase.auth.getSession().then(({ data: { session } }) => {
                        if (session?.user.id === payload.new.id) {
                            setRole(payload.new.role);
                        }
                    });
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);



    const handleLogout = async () => {
        try {
            const button = await Swal.fire({
                icon: 'warning',
                title: 'ยืนยันลงชื่อออก',
                text: 'คุณแน่ใจที่จะลงชื่อออกจากระบบหรือไม่ ?',
                showCancelButton: true,
                showConfirmButton: true
            })

            if (button.isConfirmed) {
                await supabase.auth.signOut();
                router.push('/login');
            }
        } catch (err) {
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: 'ไม่สามารถลงชื่อออกได้' + err
            })
        }
    }

    const navigate = (path: string) => {
        router.push(path);
        setIsOpen(false); // Close sidebar on mobile after navigation
    }

    return (
        <>
            {/* Mobile Overlay */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 z-40 md:hidden backdrop-blur-sm transition-opacity"
                    onClick={() => setIsOpen(false)}
                />
            )}

            {/* Sidebar container with sliding animation for mobile */}
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
                            {/* Close button for mobile */}
                        </div>
                        {/* Mobile close button inside sidebar */}
                        <button
                            className="md:hidden absolute -top-2 -right-2 p-2 text-white/70 hover:text-white bg-white/10 rounded-full"
                            onClick={() => setIsOpen(false)}
                        >
                            <X size={20} />
                        </button>
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
                                <span className={`uppercase tracking-wider font-bold ${role === 'moderator' ? 'text-purple-400' :
                                    role === 'assistant_moderator' ? 'text-indigo-400' :
                                        role === 'operator' ? 'text-blue-400' :
                                            'text-emerald-400'
                                    }`}>
                                    {
                                        role === 'moderator' ? 'Moderator' :
                                            role === 'assistant_moderator' ? 'Asst. Moderator' :
                                                role === 'operator' ? 'Operator' : 'User'
                                    }
                                </span>
                            </div>
                        </div>
                        <div className="flex gap-1 justify-center">
                            <button className="bg-red-500/80 hover:bg-red-600 text-white px-4 py-2 rounded w-full font-semibold transition" onClick={handleLogout}>
                                <LogOut className="mr-2 w-4 h-4" />Logout
                            </button>
                        </div>
                    </div>
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
                                </li>
                            )}
                        </ul>
                    </nav>
                </div>
            </div>
        </>
    );
}
