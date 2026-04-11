'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Check, Undo, Edit2, Trash2, UserCircle, CheckCircle2, Clock, X, Printer } from 'lucide-react';

export interface OrderInterface {
    id: number;
    order_date: string;
    order_time: string;
    order_datetime: string;
    order_type?: string;
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
    is_printed?: boolean;
    verified_by?: string | null;
    verified_at?: string | null;
    image_url?: string | null;
    created_at: string;
    updated_at?: string | null;
    updated_by?: string | null;
    edit_summary?: string | null;
    is_cancelled?: boolean;
}

export default function DashboardPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingOrder, setEditingOrder] = useState<OrderInterface | null>(null);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [timeFilter, setTimeFilter] = useState<'week' | 'month'>('week');
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
                () => {
                    // Refresh orders on any change
                    loadOrders();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (data) {
                setRole(data.role);
                setUserName(data.name);
                setEmployeeId(data.employee_id || '');
            } else {
                // Auto-recovery: always default to 'user' role for safety
                const fallbackName = session.user.email?.split('@')[0] || 'User';
                const fallbackRole = 'user'; // SECURITY: Never auto-grant admin
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
            const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
            const startOfMonthIso = startOfMonth.toISOString();

            let allOrders: OrderInterface[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('orders')
                    .select('*')
                    .gte('created_at', startOfMonthIso)
                    .order('created_at', { ascending: false })
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allOrders = [...allOrders, ...(data as OrderInterface[])];
                    from += pageSize;
                    hasMore = data.length === pageSize;
                } else {
                    hasMore = false;
                }
            }

            setOrders(allOrders);
        } catch (error) {
            console.error('Error loading orders:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'กรุณาลองใหม่อีกครั้ง'
            });
        }
    };

    const sortedOrders = React.useMemo(() => {
        return [...orders].sort((a, b) => {
            const getPriority = (order: OrderInterface) => {
                // Priority 0: Active/Updated items (New, Edited, or Cancelled)
                if (!order.is_verified) {
                    if (order.is_cancelled || order.updated_at || (!order.is_printed && !order.is_verified)) {
                        return 0;
                    }
                }

                if (order.is_printed && !order.is_verified) return 1; // Printed
                if (order.is_verified) return 2;                       // Verified
                return 3;
            };

            const pA = getPriority(a);
            const pB = getPriority(b);

            if (pA !== pB) return pA - pB;

            // Same priority? Sort by latest timestamp
            const timeA = new Date(a.updated_at || a.created_at).getTime();
            const timeB = new Date(b.updated_at || b.created_at).getTime();
            return timeB - timeA;
        });
    }, [orders]);

    const filteredOrders = sortedOrders.filter(order => {
        return searchTerm.trim() === '' ||
            order.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            order.product_name.toLowerCase().includes(searchTerm.toLowerCase());
    });

    const deleteOrder = async (id: number) => {
        if (role !== 'moderator' && role !== 'assistant_moderator') {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
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

    const isAdmin = role === 'moderator' || role === 'assistant_moderator';

    const saveEdit = async () => {
        if (!editingOrder) return;
        try {
            const now = new Date().toISOString();
            const original = orders.find(o => o.id === editingOrder.id);

            // Determine what fields were changed with robust comparison
            const changeDetails: string[] = [];
            if (original) {
                // Helper to get presentable value
                const displayVal = (val: any) => (val === null || val === undefined || String(val).trim() === '' || val === '-') ? 'ไม่มี' : String(val).trim();

                // 1. เลขลอต
                const oldLot = displayVal(original.lot_number);
                const newLot = displayVal(editingOrder.lot_number);
                if (oldLot !== newLot) {
                    changeDetails.push(`เลขลอต: ${oldLot} ➡️ ${newLot}`);
                }

                // 2. จำนวน
                const oldQty = Number(original.quantity) || 0;
                const newQty = Number(editingOrder.quantity) || 0;
                if (oldQty !== newQty) {
                    changeDetails.push(`จำนวน: ${oldQty} ➡️ ${newQty}`);
                }

                // 3. วันที่ผลิต
                const oldDateRaw = original.production_date || '';
                const newDateRaw = editingOrder.production_date || '';
                if (oldDateRaw !== newDateRaw) {
                    const formatDate = (dateStr: string) => dateStr ? dateStr.split('-').reverse().join('/') : 'ไม่มี';
                    changeDetails.push(`วันที่ผลิต: ${formatDate(oldDateRaw)} ➡️ ${formatDate(newDateRaw)}`);
                }

                // 4. หมายเหตุ
                const oldNotes = displayVal(original.notes);
                const newNotes = displayVal(editingOrder.notes);
                if (oldNotes !== newNotes) {
                    changeDetails.push(`หมายเหตุ: ${oldNotes} ➡️ ${newNotes}`);
                }
            }

            const summary = changeDetails.length > 0 ? `แก้ไข: ${changeDetails.join(' | ')}` : 'อัปเดตข้อมูล';
            const editorName = employeeId ? `${userName} (${employeeId})` : userName;

            const updateData = {
                lot_number: editingOrder.lot_number,
                quantity: editingOrder.quantity,
                production_date: editingOrder.production_date,
                expiry_date: editingOrder.expiry_date,
                notes: editingOrder.notes,
                updated_at: now,
                updated_by: editorName,
                edit_summary: summary
            };

            const { error } = await supabase.from('orders').update(updateData).eq('id', editingOrder.id);

            if (error) throw error;

            setOrders(prev => prev.map(order =>
                order.id === editingOrder.id ? { ...order, ...updateData } : order
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
        setEditingOrder({ ...order });
    };

    const verifyOrder = async (order: OrderInterface) => {
        if (role !== 'moderator' && role !== 'assistant_moderator') {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
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

    const markPrinted = async (order: OrderInterface) => {
        if (!isAdmin) return;
        try {
            const { error } = await supabase.from('orders').update({
                is_printed: true
            }).eq('id', order.id);

            if (error) throw error;

            setOrders(prev => prev.map(o =>
                o.id === order.id ? { ...o, is_printed: true } : o
            ));
        } catch (error) {
            console.error('Error marking printed:', error);
            Swal.fire({ icon: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const handleCancelOrder = async (order: OrderInterface) => {
        const result = await Swal.fire({
            title: 'ยืนยันการยกเลิกสั่งพิมพ์?',
            text: 'กรุณาระบุเหตุผลที่ต้องการยกเลิกคำสั่งนี้',
            icon: 'warning',
            input: 'text',
            inputPlaceholder: 'ใส่เหตุผลการยกเลิกที่นี่...',
            showCancelButton: true,
            confirmButtonColor: '#ef4444',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันยกเลิก',
            cancelButtonText: 'ไม่ยกเลิก',
            inputValidator: (value) => {
                if (!value) {
                    return 'คุณต้องระบุเหตุผลในการยกเลิก!';
                }
            }
        });

        if (result.isConfirmed) {
            try {
                const reason = result.value;
                const now = new Date().toISOString();
                const editorName = employeeId ? `${userName} (${employeeId})` : userName;
                const summary = `ยกเลิกเพราะ: ${reason}`;

                const updateData = {
                    is_printed: false,
                    is_verified: false,
                    is_cancelled: true,
                    updated_at: now,
                    updated_by: editorName,
                    edit_summary: summary
                };

                const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);

                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, ...updateData } : o
                ));

                Swal.fire({
                    icon: 'success',
                    title: 'ยกเลิกสำเร็จ',
                    text: 'รายการถูกยกเลิกและบันทึกเหตุผลเรียบร้อยแล้ว',
                    timer: 1500
                });
            } catch (error) {
                console.error('Error cancelling order:', error);
                Swal.fire({ icon: 'error', title: 'ยกเลิกไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const restoreOrder = async (order: OrderInterface) => {
        const result = await Swal.fire({
            title: 'กู้คืนคำสั่งผลิต?',
            text: 'รายการนี้จะถูกดึงกลับมาเป็นรายการใหม่เพื่อให้ดำเนินการต่อได้',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันกู้คืน',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const editorName = employeeId ? `${userName} (${employeeId})` : userName;
                const summary = 'กู้คืนคำสั่งผลิต (จากสถานะยกเลิก)';

                const updateData = {
                    is_cancelled: false,
                    is_printed: false,
                    is_verified: false,
                    updated_at: now,
                    updated_by: editorName,
                    edit_summary: summary
                };

                const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);

                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, ...updateData } : o
                ));

                Swal.fire({
                    icon: 'success',
                    title: 'กู้คืนสำเร็จ',
                    text: 'รายการกลับมาเป็นปกติแล้ว',
                    timer: 1500
                });
            } catch (error) {
                console.error('Error restoring order:', error);
                Swal.fire({ icon: 'error', title: 'กู้คืนไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const unmarkPrinted = async (order: OrderInterface) => {
        if (!isAdmin) return;
        try {
            const { error } = await supabase.from('orders').update({
                is_printed: false
            }).eq('id', order.id);

            if (error) throw error;

            setOrders(prev => prev.map(o =>
                o.id === order.id ? { ...o, is_printed: false } : o
            ));
        } catch (error) {
            console.error('Error unmarking printed:', error);
            Swal.fire({ icon: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const unverifyOrder = async (order: OrderInterface) => {
        if (role !== 'moderator' && role !== 'assistant_moderator') {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
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

    const deleteImage = async (order: OrderInterface) => {
        if (!isAdmin || !order.image_url) return;

        const result = await Swal.fire({
            title: 'ยืนยันการลบรูปภาพ?',
            text: 'รูปภาพนี้จะถูกลบออกจากระบบเป็นการถาวร',
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!',
            cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                // Extract file path from URL
                // URL format: .../storage/v1/object/public/order-images/labels/170062_test.jpg
                const urlParts = order.image_url.split('/order-images/');
                if (urlParts.length > 1) {
                    const filePath = urlParts[1];
                    const { error: storageError } = await supabase.storage.from('order-images').remove([filePath]);
                    if (storageError) throw storageError;
                }

                // Update database
                const { error: dbError } = await supabase.from('orders').update({
                    image_url: null
                }).eq('id', order.id);

                if (dbError) throw dbError;

                // Update local state
                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, image_url: null } : o
                ));

                Swal.fire({ icon: 'success', title: 'ลบรูปภาพสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch (error) {
                console.error('Error deleting image:', error);
                Swal.fire({ icon: 'error', title: 'ลบรูปภาพไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
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
            const yearCE = date.getFullYear();
            const yearBE = yearCE + 543;
            return (
                <>
                    {day}/{month}/{yearBE}
                    <br />
                    <span className="text-sm opacity-75">{day}/{month}/{yearCE}</span>
                </>
            );
        } catch {
            return dateString;
        }
    };

    const calculateExpiryDate = (manufactureDate: string, shelfLife: string): string => {
        if (!manufactureDate || !shelfLife) return '';
        try {
            const mfgDate = new Date(manufactureDate);
            if (isNaN(mfgDate.getTime())) return '';

            const trimmedShelfLife = shelfLife.trim();
            const spaceIndex = trimmedShelfLife.indexOf(' ');
            let numValue: number;
            let unit: string;

            if (spaceIndex === -1) {
                numValue = parseInt(trimmedShelfLife);
                unit = 'months';
            } else {
                const valueStr = trimmedShelfLife.substring(0, spaceIndex);
                unit = trimmedShelfLife.substring(spaceIndex + 1).toLowerCase();
                numValue = parseInt(valueStr);
            }

            if (isNaN(numValue) || numValue <= 0) return '';

            const newDate = new Date(mfgDate);

            if (unit.includes('day') || unit.includes('วัน')) {
                newDate.setDate(newDate.getDate() + numValue);
            } else if (unit.includes('month') || unit.includes('mon') || unit.includes('เดือน')) {
                newDate.setMonth(newDate.getMonth() + numValue);
            } else if (unit.includes('year') || unit.includes('yr') || unit.includes('ปี')) {
                newDate.setFullYear(newDate.getFullYear() + numValue);
            } else {
                newDate.setMonth(newDate.getMonth() + numValue);
            }

            return newDate.toISOString().split('T')[0];
        } catch {
            return '';
        }
    };

    const getChartData = () => {
        const departmentOrders: { [key: string]: number } = {};

        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

        orders.forEach(order => {
            const orderDate = new Date(order.created_at);
            let include = true;
            if (timeFilter === 'week') {
                include = orderDate >= startOfWeek;
            } else if (timeFilter === 'month') {
                include = orderDate >= startOfMonth;
            }

            if (include) {
                const dept = order.created_by_department || 'ไม่ระบุหน่วยงาน';
                departmentOrders[dept] = (departmentOrders[dept] || 0) + 1;
            }
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
                                {(role === 'moderator' || role === 'assistant_moderator') && (
                                    <span className="ml-3 bg-purple-100/80 text-purple-800 border border-purple-200 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                                        {role === 'moderator' ? 'Moderator' : 'Assistant Moderator'}
                                    </span>
                                )}
                            </p>
                        )}
                    </div>
                </div>

                {role !== 'user' && (
                    <>
                        <div className="flex flex-col sm:flex-row justify-between items-center bg-gray-50/80 p-2 rounded-2xl border border-gray-100 mb-6 gap-2">
                            <h2 className="text-xl font-bold text-gray-700 px-4 flex items-center gap-2">
                                <i className="fas fa-chart-line text-blue-500"></i> สรุปยอดการสั่งพิมพ์ฉลาก
                            </h2>
                            <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-1 w-full sm:w-auto">
                                <button
                                    onClick={() => setTimeFilter('week')}
                                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${timeFilter === 'week'
                                        ? 'bg-blue-600 text-white shadow-md'
                                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                        }`}
                                >
                                    ประจำสัปดาห์
                                </button>
                                <button
                                    onClick={() => setTimeFilter('month')}
                                    className={`flex-1 sm:flex-none px-6 py-2.5 rounded-lg text-sm font-bold transition-all duration-300 ${timeFilter === 'month'
                                        ? 'bg-purple-600 text-white shadow-md'
                                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
                                        }`}
                                >
                                    ประจำเดือน
                                </button>
                            </div>
                        </div>

                        <div className="w-full bg-transparent p-4 -m-4 rounded-2xl">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                    <p className="text-sm font-semibold text-blue-800/70 mb-1 tracking-wider relative z-10">คำสั่งทั้งหมด ({timeFilter === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'})</p>
                                    <p className="text-5xl font-extrabold text-blue-600 relative z-10">{chartData.reduce((sum, item) => sum + item.count, 0)}</p>
                                </div>
                                <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                    <p className="text-sm font-semibold text-green-800/70 mb-1 tracking-wider relative z-10">จำนวนหน่วยงานที่สั่ง ({timeFilter === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'})</p>
                                    <p className="text-5xl font-extrabold text-green-600 relative z-10">{chartData.length}</p>
                                </div>
                                <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-100 shadow-sm relative overflow-hidden group">
                                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                    <p className="text-sm font-semibold text-orange-800/70 mb-1 tracking-wider relative z-10">หน่วยงานที่สั่งมากที่สุด ({timeFilter === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'})</p>
                                    <p className="text-3xl font-extrabold text-orange-600 truncate relative z-10">{chartData.length > 0 ? chartData[0]?.name : '-'}</p>
                                    <p className="text-sm font-medium text-orange-700/80 mt-1 relative z-10">{chartData.length > 0 ? `(${chartData[0]?.count || 0} คำสั่ง)` : 'ยังไม่มีข้อมูล'}</p>
                                </div>
                            </div>

                            {chartData.length > 0 && (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                    <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                        <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                            <i className="fas fa-chart-bar text-blue-500"></i> ยอดการสั่งแบ่งตามหน่วยงาน ({timeFilter === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'})
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
                                            <i className="fas fa-chart-pie text-purple-500"></i> สัดส่วนการสั่งตามหน่วยงาน ({timeFilter === 'week' ? 'สัปดาห์นี้' : 'เดือนนี้'})
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
                        </div>
                    </>
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
                            ${order.is_cancelled ? 'bg-red-50/80 border-red-300 opacity-80' : index % 2 === 0 ? 'bg-white' : 'bg-blue-50/70'}
                            rounded-2xl shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 border overflow-hidden flex flex-col group relative
                        `}>
                            {/* Card Header */}
                            <div className={`p-5 border-b flex justify-between items-start ${order.is_cancelled ? 'bg-red-100 border-red-200' : index % 2 === 0 ? 'bg-blue-100/80 border-blue-100' : 'bg-indigo-100/80 border-blue-100'}`}>
                                <div className="pr-4 pointer-events-none">
                                    <div className="flex gap-2 items-center mb-1 flex-wrap">
                                        <h3 className="text-lg font-bold text-gray-900 line-clamp-1 break-all">{order.product_name}</h3>
                                        {order.order_type && (
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider shrink-0 shadow-sm border ${order.is_cancelled ? 'bg-red-200 text-red-800 border-red-300' : order.order_type === 'พิมพ์ฉลาก' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                {order.order_type}
                                            </span>
                                        )}
                                        {order.is_cancelled && (
                                            <span className="bg-red-600 text-white text-[10px] px-3 py-0.5 rounded-full font-bold uppercase tracking-widest shrink-0 shadow-md">
                                                ยกเลิกแล้ว
                                            </span>
                                        )}
                                        {order.updated_at && !order.is_verified && !order.is_cancelled && (
                                            <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-pulse">
                                                แก้ไขแล้ว
                                            </span>
                                        )}
                                        {(() => {
                                            const isPending = !order.is_printed && !order.is_verified && !order.is_cancelled;
                                            const isRecent = new Date().getTime() - new Date(order.created_at).getTime() < 5 * 60 * 1000;
                                            return isPending && isRecent && (
                                                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-bounce">
                                                    New
                                                </span>
                                            );
                                        })()}
                                    </div>
                                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest">{order.product_id} • ลอต {order.lot_number}</p>
                                </div>
                                {/* Actions */}
                                <div className="flex gap-1 shrink-0">
                                    {/* Admin-only: Verify actions (only if not cancelled) */}
                                    {isAdmin && !order.is_cancelled && (
                                        <>
                                            {!order.is_verified ? (
                                                <>
                                                    {!order.is_printed ? (
                                                        <button onClick={() => markPrinted(order)} className="w-9 h-9 rounded-xl text-white bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="พิมพ์แล้ว">
                                                            <Printer className="w-4 h-4" />
                                                        </button>
                                                    ) : (
                                                        <button onClick={() => unmarkPrinted(order)} className="w-9 h-9 rounded-xl text-white bg-gray-400 hover:bg-gray-500 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการพิมพ์">
                                                            <Undo className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                    <button onClick={() => verifyOrder(order)} className="w-9 h-9 rounded-xl text-white bg-green-500 hover:bg-green-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ตรวจสอบเสร็จและตัดงานจบ">
                                                        <Check className="w-4 h-4" />
                                                    </button>
                                                </>
                                            ) : (
                                                <button onClick={() => unverifyOrder(order)} className="w-9 h-9 rounded-xl text-white bg-orange-500 hover:bg-orange-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการตรวจสอบ">
                                                    <Undo className="w-4 h-4" />
                                                </button>
                                            )}
                                        </>
                                    )}
                                    {/* All roles: Edit button (only if not cancelled) */}
                                    {!order.is_cancelled && (
                                        <button onClick={() => startEdit(order)} className="w-9 h-9 rounded-xl text-white bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="แก้ไข">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    {/* User-only/Cancel feature for all: Cancel order button (only if not cancelled) */}
                                    {!order.is_cancelled && (
                                        <button onClick={() => handleCancelOrder(order)} className="w-9 h-9 rounded-xl text-white bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการสั่งพิมพ์">
                                            <X className="w-5 h-5" />
                                        </button>
                                    )}
                                    {/* Admin-only: Restore button for cancelled orders */}
                                    {isAdmin && order.is_cancelled && (
                                        <button
                                            onClick={() => restoreOrder(order)}
                                            className="w-9 h-9 rounded-xl text-white bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors shadow-md hover:shadow-lg animate-bounce"
                                            title="กู้คืนคำสั่งพิมพ์"
                                        >
                                            <Undo className="w-4 h-4" />
                                        </button>
                                    )}
                                    {/* Admin-only: Delete */}
                                    {isAdmin && (
                                        <button onClick={() => deleteOrder(order.id)} className="w-9 h-9 rounded-xl text-white bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ลบ">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
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

                                {order.updated_at && (
                                    <div className="mt-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-[11px] space-y-1 shadow-sm">
                                        <div className="flex justify-between items-center">
                                            <span className="font-bold text-blue-800 flex items-center gap-1">
                                                ✏️ แก้ไขล่าสุด:
                                            </span>
                                            <span className="text-blue-700 font-medium">{formatThaiDateTimeFromISO(order.updated_at)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-500">โดย:</span>
                                            <span className="font-bold text-gray-800">{order.updated_by || 'ไม่ระบุ'}</span>
                                        </div>
                                        {order.edit_summary && (
                                            <div className="pt-1 border-t border-blue-100/50 mt-1">
                                                <span className="text-blue-600 font-semibold italic">{order.edit_summary}</span>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {order.notes && order.notes !== '-' && (
                                    <div className="mt-3 bg-yellow-50 p-3 rounded-lg border border-yellow-100 text-sm">
                                        <span className="font-semibold text-yellow-800 block mb-1">หมายเหตุ:</span>
                                        <span className="text-yellow-900">{order.notes}</span>
                                    </div>
                                )}

                                {order.image_url && (
                                    <div className="mt-4 pt-4 border-t border-gray-100 relative">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="text-sm font-semibold text-gray-700">📷 ภาพตัวอย่างฉลาก:</span>
                                            {isAdmin && (
                                                <button
                                                    onClick={() => deleteImage(order)}
                                                    className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded border border-red-200 transition-colors flex items-center gap-1"
                                                >
                                                    <Trash2 className="w-3 h-3" /> ลบรูป
                                                </button>
                                            )}
                                        </div>
                                        <div className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex justify-center">
                                            <img
                                                src={order.image_url}
                                                alt={`ตัวอย่างฉลาก ${order.lot_number}`}
                                                className="max-h-48 object-contain w-full hover:scale-105 transition-transform duration-300 cursor-pointer"
                                                onClick={() => window.open(order.image_url || '', '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Card Footer Status */}
                            <div className={`p-4 text-center tracking-wide font-bold 
                                ${order.is_cancelled ? 'bg-red-600 text-white shadow-inner animate-pulse'
                                    : order.is_verified ? 'bg-emerald-600 text-white shadow-inner'
                                        : order.is_printed ? 'bg-blue-500 text-white shadow-inner uppercase'
                                            : 'bg-gray-100 text-gray-400 uppercase tracking-widest'}`}
                            >
                                {order.is_cancelled ? (
                                    <span className="flex items-center justify-center gap-2 text-sm tracking-widest uppercase">
                                        <X className="w-5 h-5 inline mr-1" /> คำสั่งพิมพ์นี้ถูกยกเลิกแล้ว
                                    </span>
                                ) : order.is_verified ? (
                                    <div className="flex flex-col items-center justify-center gap-2 py-1">
                                        <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1.5 text-base text-center">
                                            <span className="flex items-center gap-1.5"><CheckCircle2 className="w-5 h-5 shrink-0" /> ผู้ปฏิบัติงาน:</span>
                                            {order.verified_by && order.verified_by.includes('(') ? (
                                                <div className="flex items-center gap-2">
                                                    <span>{order.verified_by.substring(0, order.verified_by.indexOf('(')).trim()}</span>
                                                    <span className="bg-emerald-900/60 text-emerald-100 px-2.5 py-0.5 rounded-lg text-sm border border-emerald-400/40 shadow-inner tracking-widest font-bold">
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
                                ) : order.is_printed ? (
                                    <span className="flex items-center justify-center gap-2 text-sm tracking-wider">
                                        <Printer className="w-5 h-5 inline mr-1" /> พิมพ์ฉลากแล้ว รอตัดชิ้นงาน
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2 text-sm">
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
                            {/* เลขลอต — ทุก role แก้ได้ */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">เลขลอต</label>
                                <input
                                    type="text"
                                    value={editingOrder.lot_number}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, lot_number: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                            </div>
                            {/* จำนวน — ทุก role แก้ได้ */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวน</label>
                                <input
                                    type="number"
                                    value={editingOrder.quantity}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                            </div>
                            {/* วันที่ผลิต — ทุก role แก้ได้ */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่ผลิต</label>
                                <input
                                    type="date"
                                    value={editingOrder.production_date || ''}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        const newExpiry = calculateExpiryDate(newDate, editingOrder.product_exp);
                                        setEditingOrder({
                                            ...editingOrder,
                                            production_date: newDate,
                                            expiry_date: newExpiry
                                        });
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                                {editingOrder.expiry_date && (
                                    <p className="mt-1 text-xs text-red-500 font-medium">
                                        💡 วันหมดอายุใหม่: {formatToThaiDate(editingOrder.expiry_date)}
                                    </p>
                                )}
                            </div>
                            {/* หมายเหตุ — ทุก role แก้ได้ */}
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
