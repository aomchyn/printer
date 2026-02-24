'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { BarChart3, PieChart as PieChartIcon, Check, Undo, Edit2, Trash2, UserCircle, CheckCircle2, Clock, X } from 'lucide-react';

export interface OrderInterface {
    id: number;
    order_date: string;
    order_time: string;
    order_datetime: string;
    lot_number: string;
    product_id: string;
    product_name: string;
    product_exp: string;
    production_date: string;
    expiry_date: string;
    quantity: number;
    notes?: string;
    created_by: string;
    created_by_department?: string;
    is_verified: boolean;
    verified_by?: string | null;
    verified_at?: string | null;
    created_at: string;
}

export default function DashboardPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingOrder, setEditingOrder] = useState<OrderInterface | null>(null);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const router = useRouter();

    useEffect(() => {
        fetchUserInfo();
        loadOrders();

        // Optional: you can turn on real-time subscriptions here with Supabase:
        const channel = supabase.channel('schema-db-changes')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'orders',
                },
                (payload) => {
                    // Refresh orders on any change
                    loadOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            const { data, error } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (data) {
                setRole(data.role);
                setUserName(data.name);
                setEmployeeId(data.employee_id || '');
            } else {
                // Auto-recovery to sync with Sidebar's recovery
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = fallbackName.toLowerCase().includes('aom') || fallbackName.toLowerCase().includes('admin') ? 'admin' : 'user';
                setRole(fallbackRole);
                setUserName(fallbackName);
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            router.push('/login');
        }
    };

    const loadOrders = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setOrders(data as OrderInterface[]);
            }
        } catch (error) {
            console.error('Error loading orders:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'กรุณาลองใหม่อีกครั้ง'
            });
        }
    };

    const filteredOrders = orders.filter(order => {
        return searchTerm.trim() === '' ||
            order.lot_number.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const deleteOrder = async (id: number) => {
        if (!role?.includes('admin')) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะ Admin เท่านั้น' });
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันการลบ?',
            text: 'คุณต้องการลบคำสั่งพิมพ์ฉลากหรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').delete().eq('id', id);
                if (error) throw error;

                setOrders(prev => prev.filter(order => order.id !== id));

                Swal.fire({
                    icon: 'success',
                    title: 'ลบสำเร็จ!',
                    timer: 1500,
                    showConfirmButton: false
                });
            } catch (error) {
                console.error('Error deleting order:', error);
                Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const saveEdit = async () => {
        if (!editingOrder) return;
        try {
            const { error } = await supabase.from('orders').update({
                lot_number: editingOrder.lot_number,
                quantity: editingOrder.quantity,
                notes: editingOrder.notes
            }).eq('id', editingOrder.id);

            if (error) throw error;

            setOrders(prev => prev.map(order =>
                order.id === editingOrder.id ? editingOrder : order
            ));
            setEditingOrder(null);

            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                timer: 1500,
                showConfirmButton: false
            });
        } catch (error) {
            console.error('Error updating order:', error);
            Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const startEdit = (order: OrderInterface) => {
        if (!role?.includes('admin')) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะ Admin เท่านั้นที่สามารถแก้ไขข้อมูลได้' });
            return;
        }
        setEditingOrder({ ...order });
    };

    const verifyOrder = async (order: OrderInterface) => {
        if (!role?.includes('admin')) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะ Admin เท่านั้น' });
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันการตรวจสอบ',
            text: `คุณต้องการยืนยันว่าได้ตรวจสอบคำสั่งพิมพ์ฉลากนี้แล้วหรือไม่?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#6b7280',
            confirmButtonText: '✓ ยืนยันการตรวจสอบ',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const verifierName = employeeId ? `${userName} (${employeeId})` : userName;

                const { error } = await supabase.from('orders').update({
                    is_verified: true,
                    verified_by: verifierName,
                    verified_at: now
                }).eq('id', order.id);

                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_verified: true, verified_by: verifierName, verified_at: now } : o
                ));

                Swal.fire({
                    icon: 'success',
                    title: 'ตรวจสอบสำเร็จ!',
                    html: `ผู้ตรวจสอบ: <strong>${verifierName}</strong>`,
                    timer: 2000,
                    showConfirmButton: false
                });
            } catch (error) {
                console.error('Error verifying order:', error);
                Swal.fire({ icon: 'error', title: 'ตรวจสอบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const unverifyOrder = async (order: OrderInterface) => {
        if (!role?.includes('admin')) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะ Admin เท่านั้น' });
            return;
        }

        const result = await Swal.fire({
            title: 'ยกเลิกการตรวจสอบ?',
            text: 'คุณต้องการยกเลิกการตรวจสอบคำสั่งพิมพ์ฉลากนี้หรือไม่?',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ใช่, ยกเลิก',
            cancelButtonText: 'ปิด'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').update({
                    is_verified: false,
                    verified_by: null,
                    verified_at: null
                }).eq('id', order.id);

                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_verified: false, verified_by: null, verified_at: null } : o
                ));

                Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch (error) {
                console.error('Error unverifying order:', error);
                Swal.fire({ icon: 'error', title: 'ยกเลิกไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const formatThaiDateTimeFromISO = (isoString?: string | null): string => {
        if (!isoString) return 'ไม่ระบุ';
        try {
            const hasTimezone = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString);
            const normalized = hasTimezone ? isoString : isoString + '+07:00';
            const date = new Date(normalized);
            if (isNaN(date.getTime())) return isoString;

            const thaiDate = date.toLocaleDateString('th-TH', {
                timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric',
            });
            const thaiTime = date.toLocaleTimeString('th-TH', {
                timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false,
            });
            return `${thaiDate}, ${thaiTime}`;
        } catch {
            return isoString;
        }
    };

    const formatToThaiDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const year = date.getFullYear() + 543;
            return `${day}/${month}/${year}`;
        } catch (error) {
            return dateString;
        }
    };

    const getChartData = () => {
        const departmentOrders: { [key: string]: number } = {};
        orders.forEach(order => {
            const dept = order.created_by_department || 'ไม่ระบุหน่วยงาน';
            departmentOrders[dept] = (departmentOrders[dept] || 0) + 1;
        });
        return Object.entries(departmentOrders).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };

    const chartData = getChartData();
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658'];

    return (
        <div className="text-gray-800">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 md:p-8 mb-8 border border-white/20">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800 mb-2 gradient-title tracking-tight pt-2 leading-relaxed">
                            📊 Dashboard คำสั่งฉลากสินค้า
                        </h1>
                        {userName && (
                            <p className="text-gray-600">
                                ผู้ใช้งาน: <span className="font-semibold">{userName}</span>
                                {role?.includes('admin') && (
                                    <span className="ml-3 bg-purple-100/80 text-purple-800 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                        Admin
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                        <p className="text-sm font-semibold text-blue-800/70 mb-1 uppercase tracking-wider relative z-10">คำสั่งทั้งหมด</p>
                        <p className="text-5xl font-extrabold text-blue-600 relative z-10">{orders.length}</p>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                        <p className="text-sm font-semibold text-green-800/70 mb-1 uppercase tracking-wider relative z-10">จำนวนหน่วยงานที่สั่ง</p>
                        <p className="text-5xl font-extrabold text-green-600 relative z-10">{chartData.length}</p>
                    </div>
                    <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-100 shadow-sm relative overflow-hidden group">
                        <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                        <p className="text-sm font-semibold text-orange-800/70 mb-1 uppercase tracking-wider relative z-10">หน่วยงานที่สั่งมากที่สุด</p>
                        <p className="text-3xl font-extrabold text-orange-600 truncate relative z-10">{chartData[0]?.name || '-'}</p>
                        <p className="text-sm font-medium text-orange-700/80 mt-1 relative z-10">({chartData[0]?.count || 0} คำสั่ง)</p>
                    </div>
                </div>

                {chartData.length > 0 && (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <i className="fas fa-chart-bar text-blue-500"></i> ยอดการสั่งแบ่งตามหน่วยงาน
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                                    <YAxis axisLine={false} tickLine={false} />
                                    <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                            <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                <i className="fas fa-chart-pie text-purple-500"></i> สัดส่วนการสั่งตามหน่วยงาน
                            </h3>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={chartData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="count"
                                    >
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                                    <Legend iconType="circle" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                )}

                <div className="mb-2 max-w-md">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                        🔍 ค้นหาเลขลอตสินค้า
                    </label>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="พิมพ์เพื่อค้นหาเลขลอต..."
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all shadow-sm"
                    />
                    {searchTerm && (
                        <div className="mt-2 text-sm text-gray-600 flex justify-between items-center">
                            <span>พบ {filteredOrders.length} รายการ</span>
                            <button onClick={() => setSearchTerm('')} className="text-red-500 hover:text-red-700 font-medium">ล้างการค้นหา</button>
                        </div>
                    )}
                </div>
            </div>

            {filteredOrders.length === 0 ? (
                <div className="bg-white/95 rounded-2xl shadow-lg p-12 text-center border border-white/20">
                    <div className="text-6xl mb-4 opacity-50">📦</div>
                    <h2 className="text-2xl font-semibold text-gray-600">
                        {searchTerm ? `ไม่พบเลขลอต "${searchTerm}"` : 'ไม่มีคำสั่งฉลากในขณะนี้'}
                    </h2>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredOrders.map((order, index) => (
                        <div key={order.id} className={`
                            ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50/70'}
                            rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border border-blue-200/50 overflow-hidden flex flex-col group relative
                        `}>
                            {/* Card Header */}
                            <div className={`p-5 border-b border-blue-100 flex justify-between items-start ${index % 2 === 0 ? 'bg-blue-100/80' : 'bg-indigo-100/80'}`}>
                                <div className="pr-4 pointer-events-none">
                                    <div className="flex gap-2 items-center mb-1">
                                        <h3 className="text-lg font-bold text-gray-900 line-clamp-1">{order.product_name}</h3>
                                        {index === 0 && <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm">New</span>}
                                    </div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{order.product_id} • ลอต {order.lot_number}</p>
                                </div>
                                {/* Admin Actions */}
                                {role?.includes('admin') && (
                                    <div className="flex gap-1 shrink-0">
                                        {!order.is_verified ? (
                                            <button onClick={() => verifyOrder(order)} className="w-9 h-9 rounded-xl text-white bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ตรวจสอบ">
                                                <Check className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <button onClick={() => unverifyOrder(order)} className="w-9 h-9 rounded-xl text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการตรวจสอบ">
                                                <Undo className="w-4 h-4" />
                                            </button>
                                        )}
                                        <button onClick={() => startEdit(order)} className="w-9 h-9 rounded-xl text-white bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="แก้ไข">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button onClick={() => deleteOrder(order.id)} className="w-9 h-9 rounded-xl text-white bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ลบ">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Card Body */}
                            <div className="p-5 flex-1 space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">เวลาสั่ง:</span>
                                    <span className="font-semibold text-gray-900">{formatThaiDateTimeFromISO(order.created_at)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">ผู้สั่ง:</span>
                                    <span className="font-semibold text-gray-900 flex items-center gap-1 text-right">
                                        <UserCircle className="w-4 h-4 text-gray-400 inline" /> {order.created_by || '-'}
                                        <span className="text-xs text-gray-500 ml-1">({order.created_by_department || 'ไม่ระบุ'})</span>
                                    </span>
                                </div>
                                <div className="my-3 border-t border-gray-100"></div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">วันที่ผลิต:</span>
                                    <span className="font-medium text-gray-700">{formatToThaiDate(order.production_date)}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">วันหมดอายุ:</span>
                                    <span className="font-bold text-red-500">{formatToThaiDate(order.expiry_date)}</span>
                                </div>
                                <div className="my-3 border-t border-gray-100"></div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">อายุผลิตภัณฑ์:</span>
                                    <span className="font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded text-xs">{order.product_exp}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">จำนวน:</span>
                                    <span className="font-bold text-xl text-green-600">{order.quantity}</span>
                                </div>

                                {order.notes && order.notes !== '-' && (
                                    <div className="mt-3 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm">
                                        <span className="font-semibold text-yellow-800 block mb-1">หมายเหตุ:</span>
                                        <span className="text-yellow-900">{order.notes}</span>
                                    </div>
                                )}
                            </div>

                            {/* Card Footer Status */}
                            <div className={`p-4 text-center tracking-wide ${order.is_verified ? 'bg-emerald-600 text-white shadow-inner' : 'bg-gray-100 text-gray-400 font-bold uppercase tracking-widest'}`}>
                                {order.is_verified ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-1">
                                        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 text-base font-bold text-center">
                                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-5 h-5 shrink-0" /> ผู้ปฏิบัติงาน:</span>
                                            {order.verified_by && order.verified_by.includes('(') ? (
                                                <div className="flex items-center gap-2">
                                                    <span>{order.verified_by.substring(0, order.verified_by.indexOf('(')).trim()}</span>
                                                    <span className="bg-emerald-900/60 text-emerald-100 px-2.5 py-0.5 rounded-lg text-sm border border-emerald-400/40 shadow-inner tracking-widest">
                                                        รหัสพนักงาน: {order.verified_by.substring(order.verified_by.indexOf('(') + 1, order.verified_by.indexOf(')'))}
                                                    </span>
                                                </div>
                                            ) : (
                                                <span>{order.verified_by || '-'}</span>
                                            )}
                                        </div>
                                        <span className="text-sm font-medium text-emerald-100 bg-emerald-800/40 px-3 py-1.5 rounded-full shadow-inner mt-1">
                                            วันที่และเวลาที่ตรวจสอบ: {formatThaiDateTimeFromISO(order.verified_at)}
                                        </span>
                                    </div>
                                ) : (
                                    <span className="flex items-center justify-center gap-2 text-sm font-bold uppercase">
                                        <Clock className="w-4 h-4 inline mr-1" /> รอการจัดทำชิ้นงาน
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editingOrder && (
                <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md animate-slide-up">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold text-gray-800">✏️ แก้ไขคำสั่งพิมพ์ฉลาก</h2>
                            <button onClick={() => setEditingOrder(null)} className="text-gray-400 hover:text-gray-600"><X className="w-6 h-6" /></button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">เลขลอต</label>
                                <input
                                    type="text"
                                    value={editingOrder.lot_number}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, lot_number: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวน</label>
                                <input
                                    type="number"
                                    value={editingOrder.quantity}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
                                <textarea
                                    value={editingOrder.notes || ''}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none shadow-sm"
                                    rows={3}
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-8">
                            <button onClick={() => setEditingOrder(null)} className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-800 py-3 rounded-lg font-bold transition">ยกเลิก</button>
                            <button onClick={saveEdit} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg font-bold shadow-lg transition">💾 บันทึก</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
