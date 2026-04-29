'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { Trash2, Undo, RefreshCcw, Clock, AlertTriangle } from 'lucide-react';

interface DeletedOrder {
    id: number;
    lot_number: string;
    product_id: string;
    product_name: string;
    product_exp: string;
    quantity: number;
    production_date: string;
    expiry_date: string;
    order_type?: string;
    created_by: string;
    created_by_department?: string;
    deleted_at: string;
    deleted_by: string;
    notes?: string;
}

export default function TrashPage() {
    const [deletedOrders, setDeletedOrders] = useState<DeletedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const router = useRouter();

    const getCurrentUserIdentifier = () =>
        employeeId ? `${userName} (${employeeId})` : userName;

    useEffect(() => {
        fetchUserInfo();
        loadDeletedOrders();
    }, []);

    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/login'); return; }
            const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (data) {
                setRole(data.role);
                setUserName(data.name);
                setEmployeeId(data.employee_id || '');
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            router.push('/login');
        }
    };

    const loadDeletedOrders = async () => {
        setLoading(true);
        try {
            // ✅ ลบถาวรอัตโนมัติรายการที่เกิน 7 วัน
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            await supabase
                .from('orders')
                .delete()
                .eq('is_deleted', true)
                .lt('deleted_at', sevenDaysAgo.toISOString());

            // ✅ ดึงรายการที่ soft delete ไว้
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('is_deleted', true)
                .order('deleted_at', { ascending: false });

            if (error) throw error;
            setDeletedOrders((data || []) as DeletedOrder[]);
        } catch (error) {
            console.error('Error loading deleted orders:', error);
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        } finally {
            setLoading(false);
        }
    };

    // ✅ คำนวณวันที่เหลือก่อนลบถาวร
    const getDaysRemaining = (deletedAt: string): number => {
        const deleted = new Date(deletedAt);
        const expiry = new Date(deleted);
        expiry.setDate(expiry.getDate() + 7);
        const now = new Date();
        const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
    };

    const restoreOrder = async (order: DeletedOrder) => {
        const result = await Swal.fire({
            title: 'กู้คืนคำสั่งพิมพ์?',
            html: `
                <div class="text-sm text-gray-600 text-left space-y-1">
                    <p>📦 <b>สินค้า:</b> ${order.product_name}</p>
                    <p>🔢 <b>ลอต:</b> ${order.lot_number}</p>
                </div>
            `,
            icon: 'question', showCancelButton: true,
            confirmButtonColor: '#10b981', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันกู้คืน', cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const restoredBy = getCurrentUserIdentifier();

                const { error } = await supabase.from('orders').update({
                    is_deleted: false,
                    deleted_at: null,
                    deleted_by: null,
                    // ✅ reset สถานะกลับเป็นปกติ
                    is_cancelled: false,
                    is_printed: false,
                    is_verified: false,
                    updated_at: now,
                    updated_by: restoredBy,
                    edit_summary: `กู้คืนจากถังขยะโดย ${restoredBy}`
                }).eq('id', order.id);

                if (error) throw error;

                // ✅ บันทึกลง audit_logs เพื่อแสดงในประวัติ EditHistory
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                await supabase.from('audit_logs').insert([{
                    order_id: order.id,
                    action: 'RESTORE_FROM_TRASH',
                    user_name: restoredBy,
                    summary: `กู้คืนจากถังขยะโดย ${restoredBy}`,
                    changes: {
                        restored_by: restoredBy,
                        restored_at: now,
                        product_name: order.product_name,
                        lot_number: order.lot_number,
                    },
                    created_at: now
                }]);
            }


                setDeletedOrders(prev => prev.filter(o => o.id !== order.id));
                Swal.fire({ icon: 'success', title: 'กู้คืนสำเร็จ', text: 'คำสั่งพิมพ์กลับมาใน Dashboard แล้ว', timer: 2000, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'กู้คืนไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const permanentDelete = async (order: DeletedOrder) => {
        const result = await Swal.fire({
            title: 'ลบถาวร?',
            html: `
                <div class="text-sm text-red-600 text-left space-y-1">
                    <p>⚠️ การลบถาวรไม่สามารถกู้คืนได้</p>
                    <p>📦 <b>สินค้า:</b> ${order.product_name}</p>
                    <p>🔢 <b>ลอต:</b> ${order.lot_number}</p>
                </div>
            `,
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ลบถาวรเลย', cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').delete().eq('id', order.id);
                if (error) throw error;

                // ✅ Log การลบถาวร
                const { data: { session } } = await supabase.auth.getSession();
                if (session) {
                    await supabase.from('audit_logs').insert([{
                        user_id: session.user.id,
                        action: 'PERMANENT_DELETE_ORDER',
                        details: {
                            order_id: order.id,
                            lot_number: order.lot_number,
                            product_id: order.product_id,
                            product_name: order.product_name,
                            quantity: order.quantity,
                            created_by: order.created_by,
                            deleted_by: getCurrentUserIdentifier(),
                            deleted_at: new Date().toISOString(),
                        },
                        created_at: new Date().toISOString()
                    }]);
                }

                setDeletedOrders(prev => prev.filter(o => o.id !== order.id));
                Swal.fire({ icon: 'success', title: 'ลบถาวรสำเร็จ', timer: 1500, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const emptyTrash = async () => {
        if (deletedOrders.length === 0) return;

        const result = await Swal.fire({
            title: 'ล้างถังขยะทั้งหมด?',
            text: `จะลบถาวร ${deletedOrders.length} รายการ ไม่สามารถกู้คืนได้`,
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#dc2626', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ล้างถังขยะ', cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').delete().eq('is_deleted', true);
                if (error) throw error;
                setDeletedOrders([]);
                Swal.fire({ icon: 'success', title: 'ล้างถังขยะสำเร็จ', timer: 1500, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const formatThaiDateTime = (isoString?: string | null): string => {
        if (!isoString) return 'ไม่ระบุ';
        try {
            const hasTimezone = isoString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(isoString);
            const normalized = hasTimezone ? isoString : isoString + '+07:00';
            const date = new Date(normalized);
            if (isNaN(date.getTime())) return isoString;
            const thaiDate = date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' });
            const thaiTime = date.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
            return `${thaiDate}, ${thaiTime}`;
        } catch { return isoString; }
    };

    const isAdmin = role === 'moderator' || role === 'assistant_moderator';

    return (
        <div className="text-gray-800">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 md:p-8 mb-6 border border-white/20">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-3">
                            <Trash2 className="w-8 h-8 text-red-500" />
                            ถังขยะ
                        </h1>
                        <p className="text-sm text-gray-500 mt-1">
                            รายการที่ถูกลบจะถูกเก็บไว้ 7 วัน หลังจากนั้นจะถูกลบถาวรอัตโนมัติ
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <button onClick={loadDeletedOrders}
                            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition text-sm">
                            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> รีเฟรช
                        </button>
                        {isAdmin && deletedOrders.length > 0 && (
                            <button onClick={emptyTrash}
                                className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition text-sm shadow-md">
                                <Trash2 className="w-4 h-4" /> ล้างถังขยะ
                            </button>
                        )}
                    </div>
                </div>

                {/* ✅ แจ้งเตือนรายการที่ใกล้ถูกลบถาวร */}
                {deletedOrders.some(o => getDaysRemaining(o.deleted_at) <= 2) && (
                    <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2">
                        <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700">
                            มีรายการที่จะถูกลบถาวรในอีก 1-2 วัน กรุณากู้คืนหากต้องการ
                        </p>
                    </div>
                )}
            </div>

            {loading ? (
                <div className="bg-white/95 rounded-2xl shadow-lg p-12 text-center border border-white/20">
                    <RefreshCcw className="w-10 h-10 text-gray-300 animate-spin mx-auto mb-3" />
                    <p className="text-gray-500">กำลังโหลด...</p>
                </div>
            ) : deletedOrders.length === 0 ? (
                <div className="bg-white/95 rounded-2xl shadow-lg p-12 text-center border border-white/20">
                    <Trash2 className="w-16 h-16 text-gray-200 mx-auto mb-4" />
                    <h2 className="text-xl font-semibold text-gray-400">ถังขยะว่างเปล่า</h2>
                    <p className="text-sm text-gray-400 mt-1">ไม่มีคำสั่งพิมพ์ที่ถูกลบ</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                    {deletedOrders.map(order => {
                        const daysLeft = getDaysRemaining(order.deleted_at);
                        const isUrgent = daysLeft <= 2;

                        return (
                            <div key={order.id} className={`bg-white rounded-2xl shadow-md border overflow-hidden flex flex-col ${isUrgent ? 'border-red-300' : 'border-gray-200'}`}>
                                {/* Header */}
                                <div className={`p-4 border-b ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <h3 className="font-bold text-gray-800">{order.product_name}</h3>
                                            <span className="text-[11px] text-gray-400 bg-white px-1.5 py-0.5 rounded border border-gray-100">{order.product_id}</span>
                                            <p className="text-sm font-extrabold text-indigo-700 mt-1">
                                                <span className="text-[9px] font-bold text-indigo-400 uppercase bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 mr-1">LOT</span>
                                                {order.lot_number}
                                            </p>
                                        </div>
                                        {/* ✅ countdown วันที่เหลือ */}
                                        <div className={`text-center px-3 py-1.5 rounded-xl text-xs font-bold ${isUrgent ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 border border-gray-200'}`}>
                                            <Clock className="w-3.5 h-3.5 mx-auto mb-0.5" />
                                            {daysLeft > 0 ? `${daysLeft} วัน` : 'วันนี้!'}
                                            <div className="text-[10px] font-normal">ก่อนลบถาวร</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Body */}
                                <div className="p-4 flex-1 space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">ผู้สั่ง:</span>
                                        <span className="font-medium text-gray-800">{order.created_by}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">จำนวน:</span>
                                        <span className="font-bold text-green-600 text-base">{order.quantity}</span>
                                    </div>
                                    {order.order_type && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-500">ประเภท:</span>
                                            <span className="font-medium text-gray-700">{order.order_type}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-gray-100 mt-2">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-gray-400">ลบเมื่อ:</span>
                                            <span className="text-red-500 font-medium">{formatThaiDateTime(order.deleted_at)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs mt-0.5">
                                            <span className="text-gray-400">ลบโดย:</span>
                                            <span className="font-medium text-gray-700">{order.deleted_by || 'ไม่ระบุ'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Footer Actions */}
                                <div className="p-3 border-t border-gray-100 flex gap-2">
                                    <button onClick={() => restoreOrder(order)}
                                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-lg font-semibold text-sm transition shadow-sm">
                                        <Undo className="w-4 h-4" /> กู้คืน
                                    </button>
                                    {isAdmin && (
                                        <button onClick={() => permanentDelete(order)}
                                            className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg font-semibold text-sm transition shadow-sm"
                                            title="ลบถาวร">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}