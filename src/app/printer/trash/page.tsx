'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { Trash2, Undo, RefreshCcw, Clock, AlertTriangle, ShieldOff } from 'lucide-react';
import TrashSkeleton from './skeleton-loading-trash';

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

const ALLOWED_ROLES = ['moderator', 'assistant_moderator']

// ─── Access Denied UI ────────────────────────────────────────────────────────
function AccessDenied() {
    const router = useRouter()
    return (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
            <div className="bg-white border border-[#C8102E]/20 rounded-2xl p-10 max-w-md w-full shadow-2xl backdrop-blur-xl">
                <div className="w-16 h-16 bg-[#FCEAEC] border border-[#C8102E]/20 rounded-2xl flex items-center justify-center mx-auto mb-5">
                    <ShieldOff className="w-8 h-8 text-[#C8102E]" />
                </div>
                <h2 className="text-2xl font-black text-[#101820] mb-2">ไม่มีสิทธิ์เข้าถึง</h2>
                <p className="text-[#5F6B70] text-sm mb-1">
                    หน้านี้สงวนไว้สำหรับ{' '}
                    <span className="font-bold text-[#C8102E]">Moderator</span> และ{' '}
                    <span className="font-bold text-[#C8102E]">Assistant Moderator</span> เท่านั้น
                </p>
                <p className="text-[#101820]/30 text-xs mb-7">
                    กรุณาติดต่อผู้ดูแลระบบหากคิดว่าเป็นข้อผิดพลาด
                </p>
                <button
                    onClick={() => router.push('/printer/dashboard')}
                    className="bg-[#FCEAEC]0 hover:bg-rose-500 text-[#101820] font-bold px-6 py-2.5 rounded-xl transition-all duration-200 text-sm border border-rose-400/30 shadow-lg shadow-rose-900/30 active:scale-95"
                >
                    กลับหน้าหลัก
                </button>
            </div>
        </div>
    )
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function TrashPage() {
    const [deletedOrders, setDeletedOrders] = useState<DeletedOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [accessStatus, setAccessStatus] = useState<'checking' | 'allowed' | 'denied'>('checking');
    const router = useRouter();

    const getCurrentUserIdentifier = () =>
        employeeId ? `${userName} (${employeeId})` : userName;

    // ─── Guard: moderator และ assistant_moderator เท่านั้น ──────────────────────
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
                    .select('role, name, employee_id')
                    .eq('id', session.user.id)
                    .single()

                if (!data || !ALLOWED_ROLES.includes(data.role)) {
                    setAccessStatus('denied')
                    return
                }

                setRole(data.role)
                setUserName(data.name)
                setEmployeeId(data.employee_id || '')
                setAccessStatus('allowed')
                loadDeletedOrders()
            } catch (error) {
                console.error('Access check error:', error)
                router.push('/login')
            }
        }

        checkAccess()
    }, [])

    async function loadDeletedOrders() {
        setLoading(true);
        try {
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            await supabase
                .from('orders')
                .delete()
                .eq('is_deleted', true)
                .lt('deleted_at', sevenDaysAgo.toISOString());

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
    }

    const getDaysRemaining = (deletedAt: string): number => {
        const deleted = new Date(deletedAt);
        const expiry = new Date(deleted);
        expiry.setDate(expiry.getDate() + 7);
        const now = new Date();
        const diff = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        return Math.max(0, diff);
    };

    const restoreOrder = async (order: DeletedOrder) => {
        if (!ALLOWED_ROLES.includes(role)) return

        const result = await Swal.fire({
            title: 'กู้คืนคำสั่งพิมพ์?',
            html: `
        <div class="text-sm text-gray-600 text-left space-y-1">
          <p>📦 <b>สินค้า:</b> ${order.product_name}</p>
          <p>🔢 <b>ลอต:</b> ${order.lot_number}</p>
        </div>
      `,
            icon: 'question', showCancelButton: true,
            confirmButtonColor: '#00B398', cancelButtonColor: '#5F6B70',
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
                    is_cancelled: false,
                    is_printed: false,
                    is_verified: false,
                    updated_at: now,
                    updated_by: restoredBy,
                    edit_summary: `กู้คืนจากถังขยะโดย ${restoredBy}`
                }).eq('id', order.id);

                if (error) throw error;

                setDeletedOrders(prev => prev.filter(o => o.id !== order.id));
                Swal.fire({ icon: 'success', title: 'กู้คืนสำเร็จ', text: 'คำสั่งพิมพ์กลับมาใน Dashboard แล้ว', timer: 2000, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'กู้คืนไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const permanentDelete = async (order: DeletedOrder) => {
        if (role !== 'moderator') return

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
            confirmButtonColor: '#C8102E', cancelButtonColor: '#5F6B70',
            confirmButtonText: 'ลบถาวรเลย', cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').delete().eq('id', order.id);
                if (error) throw error;


                setDeletedOrders(prev => prev.filter(o => o.id !== order.id));
                Swal.fire({ icon: 'success', title: 'ลบถาวรสำเร็จ', timer: 1500, showConfirmButton: false });
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const emptyTrash = async () => {
        if (deletedOrders.length === 0 || role !== 'moderator') return

        const result = await Swal.fire({
            title: 'ล้างถังขยะทั้งหมด?',
            text: `จะลบถาวร ${deletedOrders.length} รายการ ไม่สามารถกู้คืนได้`,
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#C8102E', cancelButtonColor: '#5F6B70',
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

    // ─── Render states ────────────────────────────────────────────────────────
    if (accessStatus === 'checking') {
        return (
            <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4">
                <div className="w-12 h-12 rounded-full border-2 border-[#D9E1E2] border-t-blue-400 animate-spin" />
                <p className="text-[#5F6B70] text-sm font-medium">กำลังตรวจสอบสิทธิ์...</p>
            </div>
        )
    }

    if (accessStatus === 'denied') {
        return <AccessDenied />
    }

    const isModerator = role === 'moderator'
    const hasUrgent = deletedOrders.some(o => getDaysRemaining(o.deleted_at) <= 2)

    const formatNameWithoutCode = (name: string | null | undefined): string => {
    if (!name) return 'ไม่ระบุ';
    const withoutParentheses = name.replace(/\s*\([^)]*\)/g, '').trim();
    return withoutParentheses || name;
};

    return (
        <div className="text-[#101820] min-h-full">

            {/* ── Main header card ─────────────────────────────────────────── */}
            <div className="bg-gradient-to-b from-[#00263A]/80 to-[#F5F7F8]/80 backdrop-blur-xl rounded-2xl shadow-2xl p-5 md:p-7 mb-6 border border-[#D9E1E2] relative overflow-hidden">

                <div className="pointer-events-none absolute -top-16 -right-16 w-56 h-56 bg-[#FCEAEC] rounded-full blur-3xl" />
                <div className="pointer-events-none absolute -bottom-12 -left-12 w-40 h-40 bg-[#EAF3FC] rounded-full blur-3xl" />

                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative">
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-[#FCEAEC] border border-[#C8102E]/20 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                            <Trash2 className="w-4.5 h-4.5 text-[#C8102E]" />
                        </div>
                        <div>
                            <h1 className="text-xl md:text-2xl font-black text-[#101820] tracking-tight leading-tight">ถังขยะ</h1>
                            <p className="text-[11px] md:text-xs text-[#5F6B70] font-medium mt-0.5">
                                รายการที่ถูกลบจะถูกเก็บไว้ 7 วัน หลังจากนั้นจะถูกลบถาวรอัตโนมัติ
                            </p>
                        </div>
                    </div>

                    <div className="flex gap-2 w-full sm:w-auto">
                        <button
                            onClick={loadDeletedOrders}
                            className="flex items-center gap-2 px-4 py-2 bg-[#F0F3F4] hover:bg-white border border-[#D9E1E2] hover:border-[#D9E1E2] text-[#101820]/80 hover:text-[#101820] rounded-xl font-semibold transition-all duration-200 text-sm flex-1 sm:flex-none justify-center"
                        >
                            <RefreshCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                            รีเฟรช
                        </button>

                        {isModerator && deletedOrders.length > 0 && (
                            <button
                                onClick={emptyTrash}
                                className="flex items-center gap-2 px-4 py-2 bg-[#FCEAEC] hover:bg-rose-500/35 border border-[#C8102E]/20 hover:border-rose-400/50 text-[#C8102E] hover:text-[#9B0B23] rounded-xl font-semibold transition-all duration-200 text-sm flex-1 sm:flex-none justify-center"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                ล้างถังขยะ
                            </button>
                        )}
                    </div>
                </div>

                {hasUrgent && (
                    <div className="mt-4 bg-[#FFF8D6] border border-[#F1C400]/30 rounded-xl p-3 flex items-start gap-2.5 relative">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-100 font-medium">
                            มีรายการที่จะถูกลบถาวรในอีก 1–2 วัน กรุณากู้คืนหากต้องการ
                        </p>
                    </div>
                )}
            </div>

            {/* ── Content area ─────────────────────────────────────────────── */}
            {loading ? (
                <TrashSkeleton />
            ) : deletedOrders.length === 0 ? (
                <div className="bg-gradient-to-b from-[#00263A]/60 to-[#F5F7F8]/60 border border-[#D9E1E2] border-dashed rounded-2xl p-16 text-center">
                    <div className="w-16 h-16 bg-white border border-[#D9E1E2] rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <Trash2 className="w-8 h-8 text-[#101820]/20" />
                    </div>
                    <h2 className="text-lg font-black text-[#5F6B70]">ถังขยะว่างเปล่า</h2>
                    <p className="text-sm text-gray-400 mt-1">ไม่มีคำสั่งพิมพ์ที่ถูกลบ</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {deletedOrders.map(order => {
                        const daysLeft = getDaysRemaining(order.deleted_at);
                        const isUrgent = daysLeft <= 2;

                        return (
                            <div
                                key={order.id}
                                className={`flex flex-col rounded-2xl border overflow-hidden transition-all duration-200 backdrop-blur-xl
                                    ${isUrgent
                                        ? 'bg-rose-950/80 border-[#C8102E]/25 shadow-lg shadow-rose-900/30'
                                        : 'bg-white border-[#D9E1E2] hover:bg-white'
                                    }`}
                            >
                                <div className={`px-4 pt-4 pb-3 border-b ${isUrgent ? 'border-[#C8102E]/20' : 'border-[#D9E1E2]'}`}>
                                    <div className="flex justify-between items-start gap-2">
                                        <div className="min-w-0 flex-1">
                                            <h3 className="font-black text-[#101820] text-sm leading-snug truncate">{order.product_name}</h3>
                                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                                <span className="text-[10px] text-[#5F6B70] bg-[#F0F3F4] border border-[#D9E1E2] px-1.5 py-0.5 rounded font-mono">{order.product_id}</span>
                                                <span className="text-[10px] text-[#0057B8] bg-[#EAF3FC] border border-[#0057B8]/20 px-1.5 py-0.5 rounded font-bold">
                                                    LOT {order.lot_number}
                                                </span>
                                            </div>
                                        </div>

                                        <div className={`text-center px-2.5 py-1.5 rounded-xl shrink-0 border
                                            ${isUrgent
                                                ? 'bg-rose-500/30 border-rose-400/40 text-rose-100'
                                                : 'bg-[#F0F3F4] border-[#D9E1E2] text-[#5F6B70]'
                                            }`}>
                                            <Clock className="w-3 h-3 mx-auto mb-0.5" />
                                            <div className="text-xs font-black tabular-nums leading-none">
                                                {daysLeft > 0 ? `${daysLeft}วัน` : 'วันนี้!'}
                                            </div>
                                            <div className="text-[9px] font-medium opacity-80 mt-0.5 whitespace-nowrap">ก่อนลบถาวร</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="px-4 py-3 flex-1 space-y-2 text-xs">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[#5F6B70] font-medium">ผู้สั่ง</span>
                                        <span className="font-bold text-[#101820]">{formatNameWithoutCode(order.created_by)}</span>
                                    </div>
                                    {order.order_type !== 'Stability Feed' && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5F6B70] font-medium">จำนวน</span>
                                            <span className="font-black text-[#008C78] text-base tabular-nums">{order.quantity}</span>
                                        </div>
                                    )}
                                    {order.order_type && (
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5F6B70] font-medium">ประเภท</span>
                                            <span className="font-semibold text-[#101820]">{order.order_type}</span>
                                        </div>
                                    )}

                                    <div className={`pt-2 mt-1 border-t space-y-1.5 ${isUrgent ? 'border-[#C8102E]/20' : 'border-[#D9E1E2]'}`}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5F6B70]">ลบเมื่อ</span>
                                            <span className="text-[#9B0B23] font-semibold">{formatThaiDateTime(order.deleted_at)}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-[#5F6B70]">ลบโดย</span>
                                            <span className="font-semibold text-[#101820]">{formatNameWithoutCode(order.deleted_by)}</span>
                                        </div>
                                    </div>
                                </div>

                                <div className={`px-3 pb-3 pt-2 border-t flex gap-2 ${isUrgent ? 'border-[#C8102E]/20' : 'border-[#D9E1E2]'}`}>
                                    <button
                                        onClick={() => restoreOrder(order)}
                                        className="flex-1 flex items-center justify-center gap-1.5 bg-[#E6F8F4] hover:bg-emerald-500/35 border border-[#00B398]/20 hover:border-emerald-400/50 text-[#008C78] hover:text-[#008C78] py-2 rounded-xl font-bold text-xs transition-all duration-200 active:scale-95"
                                    >
                                        <Undo className="w-3.5 h-3.5" />
                                        กู้คืน
                                    </button>

                                    {isModerator && (
                                        <button
                                            onClick={() => permanentDelete(order)}
                                            className="flex items-center justify-center gap-1.5 bg-[#FCEAEC] hover:bg-rose-500/35 border border-[#C8102E]/20 hover:border-rose-400/50 text-[#C8102E] hover:text-[#9B0B23] px-3 py-2 rounded-xl font-bold text-xs transition-all duration-200 active:scale-95"
                                            title="ลบถาวร"
                                        >
                                            <Trash2 className="w-3.5 h-3.5" />
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
