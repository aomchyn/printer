'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { Check, Undo, Edit2, Trash2, UserCircle, CheckCircle2, Clock, X, Printer, FileQuestion, Search, Copy } from 'lucide-react';
import EditHistory from '../components/EditHistory';
import { JetBrains_Mono } from 'next/font/google';
import { DashboardSkeleton } from './loading-skeleton';

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['800'],
});
const processingOrderIds = new Set<number>();

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
    is_no_file?: boolean;
    original_product_name?: string;
    printed_by?: string | null;         // ✅ ชื่อผู้พิมพ์
    printed_by_user_id?: string | null; // ✅ UUID ผู้พิมพ์ (ใช้เช็คสิทธิ์)
    printed_at?: string | null;         // ✅ เวลาที่พิมพ์
    previous_product_name?: string | null;
}

export default function DashboardPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingOrder, setEditingOrder] = useState<OrderInterface | null>(null);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [currentUserId, setCurrentUserId] = useState(''); // ✅ เก็บ UUID ของ user ปัจจุบัน
    const [copiedId, setCopiedId] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
    const [countdown, setCountdown] = useState(240);
    const [visibleCount, setVisibleCount] = useState(10)

    const sentinelRef = useRef<HTMLDivElement>(null)

    const router = useRouter();


    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) { router.push('/login'); return; }

            // ✅ เก็บ UUID ของ user ปัจจุบันไว้ใช้เช็คสิทธิ์
            setCurrentUserId(session.user.id);

            const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single();
            if (data) {
                setRole(data.role);
                setUserName(data.name);
                setEmployeeId(data.employee_id || '');
                const identifier = data.employee_id ? `${data.name} (${data.employee_id})` : data.name;
                loadOrders(identifier);
            } else {
                setRole('user');
                setUserName(session.user.email?.split('@')[0] || 'User');
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
            router.push('/login');
        }
    };

    const [auditKey, setAuditKey] = useState(0);

    const loadOrders = async (userIdentifier?: string) => {
        try {

            setIsLoading(true);
            let allOrders: OrderInterface[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('orders').select('*')
                    .eq('is_deleted', false)
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

            const { data: fgcodeData } = await supabase.from('fgcode').select('id, name');
            if (fgcodeData && fgcodeData.length > 0) {
                const productMap = Object.fromEntries(
                    fgcodeData.map((p: { id: string; name: string }) => [p.id, p.name])
                );

                const updatesNeeded: { id: number; newName: string; oldName: string }[] = [];

                allOrders = allOrders.map(order => {
                    const currentName = productMap[order.product_id];
                    const nameChanged = currentName &&
                        currentName !== order.product_name &&
                        !processingOrderIds.has(order.id);

                    if (nameChanged) {
                        processingOrderIds.add(order.id);
                        updatesNeeded.push({
                            id: order.id,
                            newName: currentName,
                            oldName: order.product_name,
                        });
                    }

                    return {
                        ...order,
                        product_name: currentName ?? order.product_name,
                        original_product_name: order.previous_product_name ?? (nameChanged ? order.product_name : undefined),
                    };
                });

                setOrders(allOrders);
                setIsLoading(false);

                if (updatesNeeded.length > 0) {
                    const now = new Date().toISOString();

                    Promise.all(
                        updatesNeeded.map(({ id, newName, oldName }) =>
                            Promise.all([
                                supabase.from('orders').update({
                                    product_name: newName,
                                    previous_product_name: oldName,
                                    updated_at: now,
                                }).eq('id', id),

                                supabase.from('audit_logs').insert([{
                                    order_id: id,
                                    action: 'UPDATE',
                                    user_name: userIdentifier,
                                    summary: `ชื่อสินค้าเปลี่ยน: ${oldName} ➡️ ${newName}`,
                                    created_at: now,
                                }]),
                            ])
                        )
                    ).then(() => {
                        // อัปเดต updated_at ใน state หลัง sync เสร็จ
                        setOrders(prev =>
                            prev.map(o =>
                                updatesNeeded.some(u => u.id === o.id)
                                    ? { ...o, updated_at: now }
                                    : o
                            )
                        );
                        setAuditKey(prev => prev + 1);
                    });
                }

            } else {
                // กรณีไม่มี fgcode (ไม่เปลี่ยนแปลง logic เดิม)
                setOrders(allOrders);
                setIsLoading(false);
            }

        } catch {
            setIsLoading(false);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'กรุณาลองใหม่อีกครั้ง',
            });
        }
    };
    useEffect(() => {
        fetchUserInfo();


        const playNotificationSound = () => {
            try {
                const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
                if (!AudioContext) return;
                const audioCtx = new AudioContext();

                const playTone = (freq: number, startTime: number, duration: number) => {
                    const oscillator = audioCtx.createOscillator();
                    const gainNode = audioCtx.createGain();
                    oscillator.connect(gainNode);
                    gainNode.connect(audioCtx.destination);
                    oscillator.type = 'sine';
                    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime + startTime);
                    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime + startTime);
                    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + startTime + duration);
                    oscillator.start(audioCtx.currentTime + startTime);
                    oscillator.stop(audioCtx.currentTime + startTime + duration);
                };

                playTone(880, 0, 0.3);
                playTone(1108.73, 0.15, 0.5);
            } catch (e) {
                console.error('Audio playback failed', e);
            }
        };

        const channel = supabase.channel('schema-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' },
                (payload: { eventType: string; new?: Record<string, unknown>; old?: Record<string, unknown> }) => {
                    const nowTS = Date.now();
                    if (payload.eventType === 'INSERT') {
                        playNotificationSound();
                        Swal.fire({
                            toast: true, position: 'top-end', icon: 'info',
                            title: '🔔 มีคำสั่งพิมพ์ฉลากมาใหม่!',
                            showConfirmButton: false, timer: 4000, timerProgressBar: true,
                            background: '#eff6ff', color: '#1e3a8a'
                        });
                        loadOrders();
                    } else if (payload.eventType === 'UPDATE' && payload.new) {
                        const newData = payload.new as Record<string, unknown>;
                        if (newData.updated_at) {
                            const updateTS = new Date(newData.updated_at as string).getTime();
                            if (nowTS - updateTS < 10000) {
                                playNotificationSound();
                                const isCancelled = newData.is_cancelled;
                                Swal.fire({
                                    toast: true, position: 'top-end',
                                    icon: isCancelled ? 'warning' : 'info',
                                    title: isCancelled ? '❌ มีคำสั่งพิมพ์ถูกยกเลิก!' : '📝 มีการแก้ไขคำสั่งพิมพ์!',
                                    text: newData.product_name ? `สินค้า: ${newData.product_name}` : '',
                                    showConfirmButton: false, timer: 4000, timerProgressBar: true,
                                    background: isCancelled ? '#fef2f2' : '#eff6ff',
                                    color: isCancelled ? '#991b1b' : '#1e3a8a'
                                });
                            }
                        }
                        // Update local state without fetching to prevent refresh flickers on status changes
                        setOrders(prev => prev.map(o => o.id === newData.id ? { ...o, ...newData } : o));
                    } else if (payload.eventType === 'DELETE' && payload.old) {
                        const oldId = payload.old.id;
                        setOrders(prev => prev.filter(o => o.id !== oldId));
                    }
                }
            ).subscribe();

        return () => { supabase.removeChannel(channel); };
    }, []);


    const sortedOrders = useMemo(() => {
        return [...orders].sort((a, b) => {
            const timeA = new Date(a.updated_at || a.created_at).getTime();
            const timeB = new Date(b.updated_at || b.created_at).getTime();
            return timeB - timeA;
        });
    }, [orders]);

    const filteredOrders = sortedOrders.filter(order =>
        searchTerm.trim() === '' ||
        order.lot_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        order.product_name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAdmin = role === 'moderator' || role === 'assistant_moderator';
    const getCurrentUserIdentifier = () => employeeId ? `${userName} (${employeeId})` : userName;

    const logAuditTrail = async (orderId: number, action: string, summary: string, changes?: Record<string, unknown>) => {
        try {
            const userIdentifier = getCurrentUserIdentifier();
            const { error } = await supabase.from('audit_logs').insert([{
                order_id: orderId, action, user_name: userIdentifier,
                summary, changes: changes || null, created_at: new Date().toISOString()
            }]);
            if (error) {
                console.warn('audit_logs insert failed, falling back:', error);
                await supabase.from('orders').update({ edit_summary: summary, updated_by: userIdentifier }).eq('id', orderId);
            }
        } catch (err) {
            console.error('logAuditTrail error:', err);
        }
    };

    const deleteOrder = async (id: number) => {
        if (!isAdmin) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
            return;
        }
        const result = await Swal.fire({
            title: 'ยืนยันการลบ?', text: 'คุณต้องการลบคำสั่งพิมพ์ฉลากหรือไม่?', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก'
        });
        if (result.isConfirmed) {
            try {
                // ✅ เก็บข้อมูล order ไว้ก่อนลบ
                const orderToDelete = orders.find(o => o.id === id);

                const { error } = await supabase.from('orders').update({
                    is_deleted: true,
                    deleted_at: new Date().toISOString(),
                    deleted_by: getCurrentUserIdentifier(),
                }).eq('id', id);
                if (error) throw error;

                // ✅ Log การลบพร้อมรายละเอียด order ที่ถูกลบ
                const { data: { session } } = await supabase.auth.getSession();
                if (session && orderToDelete) {
                    await supabase.from('audit_logs').insert([{
                        user_id: session.user.id,
                        action: 'DELETE_ORDER',
                        details: {
                            order_id: orderToDelete.id,
                            lot_number: orderToDelete.lot_number,
                            product_id: orderToDelete.product_id,
                            product_name: orderToDelete.product_name,
                            quantity: orderToDelete.quantity,
                            created_by: orderToDelete.created_by,
                            deleted_by: getCurrentUserIdentifier(),
                            deleted_at: new Date().toISOString(),
                        },
                        created_at: new Date().toISOString()
                    }]);
                }
                setOrders(prev => prev.filter(order => order.id !== id));
                Swal.fire({ icon: 'success', title: 'ลบสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'ลบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const saveEdit = async () => {
        if (!editingOrder) return;
        try {
            const now = new Date().toISOString();
            const original = orders.find(o => o.id === editingOrder.id);
            const changeDetails: string[] = [];

            if (original) {
                const displayVal = (val: unknown) =>
                    (val === null || val === undefined || String(val).trim() === '' || val === '-') ? 'ไม่มี' : String(val).trim();

                // ประเภทคำสั่ง
                const oldType = displayVal(original.order_type);
                const newType = displayVal(editingOrder.order_type);
                if (oldType !== newType) changeDetails.push(`ประเภท: ${oldType} ➡️ ${newType}`);

                // เลขลอต
                const oldLot = displayVal(original.lot_number);
                const newLot = displayVal(editingOrder.lot_number);
                if (oldLot !== newLot) changeDetails.push(`เลขลอต: ${oldLot} ➡️ ${newLot}`);

                // จำนวน
                const oldQty = Number(original.quantity) || 0;
                const newQty = Number(editingOrder.quantity) || 0;
                if (oldQty !== newQty) changeDetails.push(`จำนวน: ${oldQty} ➡️ ${newQty}`);

                // วันที่ผลิต
                const oldDateRaw = original.production_date || '';
                const newDateRaw = editingOrder.production_date || '';
                if (oldDateRaw !== newDateRaw) {
                    const formatDate = (d: string) => d ? d.split('-').reverse().join('/') : 'ไม่มี';
                    changeDetails.push(`วันที่ผลิต: ${formatDate(oldDateRaw)} ➡️ ${formatDate(newDateRaw)}`);
                }

                // หมายเหตุ
                const oldNotes = displayVal(original.notes);
                const newNotes = displayVal(editingOrder.notes);
                if (oldNotes !== newNotes) changeDetails.push(`หมายเหตุ: ${oldNotes} ➡️ ${newNotes}`);
            }

            if (changeDetails.length === 0) {
                Swal.fire({
                    icon: 'info',
                    title: 'ไม่มีการเปลี่ยนแปลง',
                    text: 'คุณยังไม่ได้แก้ไขข้อมูลใดๆ ของคำสั่งพิมพ์นี้',
                    confirmButtonText: 'รับทราบ',
                    confirmButtonColor: '#6b7280',
                });
                return;
            }

            const summary = `แก้ไข: ${changeDetails.join(' | ')}`;
            const editorName = getCurrentUserIdentifier();
            const updateData = {
                order_type: editingOrder.order_type,         // ✅ เพิ่มตรงนี้
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

            await logAuditTrail(editingOrder.id, 'UPDATE', summary);
            setOrders(prev => prev.map(o => o.id === editingOrder.id ? { ...o, ...updateData } : o));
            setEditingOrder(null);
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch {
            Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const startEdit = (order: OrderInterface) => {
        // ✅ ตรวจสอบสิทธิ์การแก้ไข
        if (!isAdmin && order.created_by !== userName) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่มีสิทธิ์แก้ไข',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกสั่งโดย <b>${order.created_by}</b></p>
                        <p class="mt-2 text-red-500 font-medium">คุณสามารถแก้ไขได้เฉพาะคำสั่งของตนเองเท่านั้น</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#6b7280',
            });
            return;
        }
        setEditingOrder({ ...order });
    };

    const verifyOrder = async (order: OrderInterface) => {
        if (!isAdmin) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
            return;
        }
        if (order.is_verified) {
            Swal.fire({
                icon: 'warning', title: 'ตรวจสอบไปแล้ว',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งรายการนี้ได้รับการตรวจสอบและตัดชิ้นงานเสร็จแล้ว</p>
                        <p class="mt-2">✅ <b>ผู้ตรวจสอบ:</b> ${order.verified_by || 'ไม่ระบุ'}</p>
                        <p>🕐 <b>เวลา:</b> ${formatThaiDateTimeFromISO(order.verified_at)}</p>
                        <p class="mt-2 text-orange-500 font-medium">เฉพาะผู้ที่ตรวจสอบเท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280',
            });
            return;
        }
        const result = await Swal.fire({
            title: 'ยืนยันการตรวจสอบ', text: 'คุณต้องการยืนยันว่าได้ตรวจสอบคำสั่งพิมพ์ฉลากนี้แล้วหรือไม่?',
            icon: 'question', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#6b7280',
            confirmButtonText: '✓ ยืนยันการตรวจสอบ', cancelButtonText: 'ยกเลิก'
        });
        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const verifierName = getCurrentUserIdentifier();
                const { error } = await supabase.from('orders').update({
                    is_verified: true, verified_by: verifierName, verified_at: now
                }).eq('id', order.id);
                if (error) throw error;
                await logAuditTrail(order.id, 'VERIFY', 'ตรวจสอบและยืนยันคำสั่งพิมพ์');
                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_verified: true, verified_by: verifierName, verified_at: now } : o
                ));
                Swal.fire({ icon: 'success', title: 'ตรวจสอบสำเร็จ!', html: `ผู้ตรวจสอบ: <strong>${verifierName}</strong>`, timer: 2000, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'ตรวจสอบไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    // ✅ markPrinted — ดึง DB ก่อน + บันทึก printed_by, printed_by_user_id, printed_at
    const markPrinted = async (order: OrderInterface) => {
        if (!isAdmin) return;

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: freshOrder, error: fetchError } = await supabase
            .from('orders').select('is_printed, printed_by, printed_by_user_id').eq('id', order.id).single();

        if (fetchError || !freshOrder) {
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: 'กรุณาลองใหม่' });
            return;
        }

        // ✅ ดักซ้ำด้วย UUID
        if (freshOrder.is_printed) {
            Swal.fire({
                icon: 'warning', title: 'พิมพ์ฉลากไปแล้ว!',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ได้รับการยืนยันพิมพ์ฉลากแล้ว</p>
                        <p class="mt-2">🖨️ <b>ผู้พิมพ์:</b> ${freshOrder.printed_by || 'ไม่ระบุ'}</p>
                        <p class="mt-2 text-orange-500 font-medium">เฉพาะผู้ที่พิมพ์เท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280',
            });
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันพิมพ์ฉลากแล้ว?',
            text: `คุณต้องการยืนยันว่าได้พิมพ์ฉลากของ ${order.product_name} เสร็จแล้วหรือไม่?`,
            icon: 'question', showCancelButton: true,
            confirmButtonColor: '#3b82f6', cancelButtonColor: '#6b7280',
            confirmButtonText: '✓ ยืนยันพิมพ์แล้ว', cancelButtonText: 'ยกเลิก'
        });

        if (result.isConfirmed) {
            try {
                const printerName = getCurrentUserIdentifier();
                const now = new Date().toISOString();

                const { error } = await supabase.from('orders').update({
                    is_printed: true,
                    is_no_file: false,
                    printed_by: printerName,           // ✅ ชื่อผู้พิมพ์
                    printed_by_user_id: session.user.id, // ✅ UUID ผู้พิมพ์
                    printed_at: now,                   // ✅ เวลาที่พิมพ์
                }).eq('id', order.id);

                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_printed: true, is_no_file: false, printed_by: printerName, printed_by_user_id: session.user.id, printed_at: now } : o
                ));
                Swal.fire({ icon: 'success', title: 'อัปเดตสถานะเป็น "พิมพ์แล้ว"', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    // ✅ unmarkPrinted — เปรียบเทียบ UUID จาก DB กับ session โดยตรง
    const unmarkPrinted = async (order: OrderInterface) => {
        if (!isAdmin) return;

        const [{ data: freshOrder, error: fetchError }, { data: { session } }] = await Promise.all([
            supabase.from('orders').select('is_printed, printed_by, printed_by_user_id').eq('id', order.id).single(),
            supabase.auth.getSession()
        ]);

        if (fetchError || !freshOrder || !session) {
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: 'กรุณาลองใหม่' });
            return;
        }

        // ✅ เปรียบเทียบ UUID ตรงๆ ไม่มีปัญหา format
        if (freshOrder.printed_by_user_id && freshOrder.printed_by_user_id !== session.user.id) {
            Swal.fire({
                icon: 'error', title: 'ไม่มีสิทธิ์ยกเลิก',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกยืนยันพิมพ์โดย <b>${freshOrder.printed_by || 'ไม่ระบุ'}</b></p>
                        <p class="mt-2 text-red-500 font-medium">เฉพาะผู้ที่พิมพ์เท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280',
            });
            return;
        }

        const result = await Swal.fire({
            title: 'ยกเลิกการพิมพ์?', text: 'คุณต้องการยกเลิกสถานะ "พิมพ์ฉลากแล้ว" ใช่หรือไม่?',
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ใช่, ยกเลิกการพิมพ์', cancelButtonText: 'ปิด'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').update({
                    is_printed: false,
                    printed_by: null,
                    printed_by_user_id: null, // ✅ เคลียร์ UUID
                    printed_at: null,          // ✅ เคลียร์เวลา
                }).eq('id', order.id);
                if (error) throw error;

                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_printed: false, printed_by: null, printed_by_user_id: null, printed_at: null } : o
                ));
                Swal.fire({ icon: 'success', title: 'ยกเลิกการพิมพ์สำเร็จ', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'เปลี่ยนสถานะไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const unverifyOrder = async (order: OrderInterface) => {
        if (!isAdmin) {
            Swal.fire({ icon: 'error', title: 'ไม่มีสิทธิ์', text: 'เฉพาะผู้ดูแลระบบ (Moderator / Assistant Moderator) เท่านั้น' });
            return;
        }
        const currentUserIdentifier = getCurrentUserIdentifier();
        if (order.verified_by && order.verified_by !== currentUserIdentifier) {
            Swal.fire({
                icon: 'error', title: 'ไม่มีสิทธิ์ยกเลิก',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกตรวจสอบโดย <b>${order.verified_by}</b> แล้ว</p>
                        <p class="mt-2 text-red-500 font-medium">เฉพาะผู้ที่ตรวจสอบเท่านั้นที่สามารถยกเลิกได้</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280',
            });
            return;
        }
        const result = await Swal.fire({
            title: 'ยกเลิกการตรวจสอบ?', text: 'คุณต้องการยกเลิกการตรวจสอบคำสั่งพิมพ์ฉลากนี้หรือไม่?',
            icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ใช่, ยกเลิก', cancelButtonText: 'ปิด'
        });
        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').update({
                    is_verified: false, verified_by: null, verified_at: null
                }).eq('id', order.id);
                if (error) throw error;
                setOrders(prev => prev.map(o =>
                    o.id === order.id ? { ...o, is_verified: false, verified_by: null, verified_at: null } : o
                ));
                Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'ยกเลิกไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const handleCancelOrder = async (order: OrderInterface) => {
        // ✅ ตรวจสอบสิทธิ์การยกเลิก
        if (!isAdmin && order.created_by !== userName) {
            Swal.fire({
                icon: 'error',
                title: 'ไม่มีสิทธิ์ยกเลิก',
                html: `
                    <div class="text-sm text-gray-600 space-y-1 text-left">
                        <p>คำสั่งนี้ถูกสั่งโดย <b>${order.created_by}</b></p>
                        <p class="mt-2 text-red-500 font-medium">คุณสามารถยกเลิกได้เฉพาะคำสั่งของตนเองเท่านั้น</p>
                    </div>
                `,
                confirmButtonText: 'รับทราบ',
                confirmButtonColor: '#6b7280',
            });
            return;
        }

        const result = await Swal.fire({
            title: 'ยืนยันการยกเลิกสั่งพิมพ์?', text: 'กรุณาระบุเหตุผลที่ต้องการยกเลิกคำสั่งนี้',
            icon: 'warning', input: 'text', inputPlaceholder: 'ใส่เหตุผลการยกเลิกที่นี่...',
            showCancelButton: true, confirmButtonColor: '#ef4444', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันยกเลิก', cancelButtonText: 'ไม่ยกเลิก',
            inputValidator: (value) => { if (!value) return 'คุณต้องระบุเหตุผลในการยกเลิก!'; }
        });
        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const editorName = getCurrentUserIdentifier();
                const summary = `ยกเลิกเพราะ: ${result.value}`;
                const updateData = {
                    is_printed: false, is_verified: false, is_cancelled: true,
                    updated_at: now, updated_by: editorName, edit_summary: summary
                };
                const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);
                if (error) throw error;
                await logAuditTrail(order.id, 'CANCEL', summary);
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...updateData } : o));
                Swal.fire({ icon: 'success', title: 'ยกเลิกสำเร็จ', text: 'รายการถูกยกเลิกและบันทึกเหตุผลเรียบร้อยแล้ว', timer: 1500 });
            } catch {
                Swal.fire({ icon: 'error', title: 'ยกเลิกไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const markNoFile = async (order: OrderInterface) => {
        const result = await Swal.fire({
            title: 'แจ้งเตือนไม่มีไฟล์?', text: 'ระบบจะแจ้งสถานะว่า "ไม่มีไฟล์" ให้ทราบ (คำสั่งนี้จะไม่ถูกยกเลิก)',
            icon: 'warning', showCancelButton: true, confirmButtonColor: '#eab308', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยัน', cancelButtonText: 'ยกเลิก'
        });
        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').update({ is_no_file: true }).eq('id', order.id);
                if (error) throw error;
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, is_no_file: true } : o));
                Swal.fire({ icon: 'success', title: 'ทำเครื่องหมายสำเร็จ', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const unmarkNoFile = async (order: OrderInterface) => {
        const result = await Swal.fire({
            title: 'ยกเลิกการแจ้งเตือนไม่มีไฟล์?',
            text: 'สถานะ "ไม่มีไฟล์" จะถูกยกเลิก และคำสั่งจะกลับสู่ปกติ',
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#10b981',
            cancelButtonColor: '#6b7280',
            confirmButtonText: 'ใช่, ยกเลิก',
            cancelButtonText: 'ปิด'
        });

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('orders').update({ is_no_file: false }).eq('id', order.id);
                if (error) throw error;
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, is_no_file: false } : o));
                Swal.fire({ icon: 'success', title: 'ยกเลิกการแจ้งเตือนสำเร็จ', timer: 1500, showConfirmButton: false });
            } catch {
                Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const restoreOrder = async (order: OrderInterface) => {
        const result = await Swal.fire({
            title: 'กู้คืนคำสั่งผลิต?', text: 'รายการนี้จะถูกดึงกลับมาเป็นรายการใหม่เพื่อให้ดำเนินการต่อได้',
            icon: 'question', showCancelButton: true, confirmButtonColor: '#10b981', cancelButtonColor: '#6b7280',
            confirmButtonText: 'ยืนยันกู้คืน', cancelButtonText: 'ยกเลิก'
        });
        if (result.isConfirmed) {
            try {
                const now = new Date().toISOString();
                const editorName = getCurrentUserIdentifier();
                const updateData = {
                    is_cancelled: false, is_printed: false, is_verified: false,
                    updated_at: now, updated_by: editorName, edit_summary: 'กู้คืนคำสั่งพิมพ์ฉลาก (จากสถานะยกเลิก)'
                };
                const { error } = await supabase.from('orders').update(updateData).eq('id', order.id);
                if (error) throw error;
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...updateData } : o));
                Swal.fire({ icon: 'success', title: 'กู้คืนสำเร็จ', text: 'รายการกลับมาเป็นปกติแล้ว', timer: 1500 });
            } catch {
                Swal.fire({ icon: 'error', title: 'กู้คืนไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const deleteImage = async (order: OrderInterface) => {
        if (!isAdmin || !order.image_url) return;
        const result = await Swal.fire({
            title: 'ยืนยันการลบรูปภาพ?', text: 'รูปภาพนี้จะถูกลบออกจากระบบเป็นการถาวร', icon: 'warning',
            showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
            confirmButtonText: 'ใช่, ลบเลย!', cancelButtonText: 'ยกเลิก'
        });
        if (result.isConfirmed) {
            try {
                const urlObj = new URL(order.image_url);
                const marker = '/order-images/';
                const markerIdx = urlObj.pathname.indexOf(marker);

                if (markerIdx === -1) {
                    throw new Error(`ไม่สามารถระบุ path ของไฟล์ได้: ${order.image_url}`);
                }

                const filePath = urlObj.pathname.substring(markerIdx + marker.length);

                const { error: storageError } = await supabase.storage
                    .from('order-images')
                    .remove([filePath]);

                if (storageError) throw storageError;

                const { error: dbError } = await supabase.from('orders')
                    .update({ image_url: null })
                    .eq('id', order.id);

                if (dbError) throw dbError;

                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, image_url: null } : o));
                Swal.fire({ icon: 'success', title: 'ลบรูปภาพสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch {
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
            const thaiDate = date.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: '2-digit', month: '2-digit', year: 'numeric' });
            const thaiTime = date.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hour12: false });
            return `${thaiDate}, ${thaiTime}`;
        } catch { return isoString; }
    };

    const formatToThaiDate = (dateString: string) => {
        if (!dateString) return '';
        try {
            const date = new Date(dateString);
            const day = date.getDate().toString().padStart(2, '0');
            const month = (date.getMonth() + 1).toString().padStart(2, '0');
            const yearCE = date.getFullYear();
            return (<>{day}/{month}/{yearCE + 543}<br /><span className="text-sm opacity-75">{day}/{month}/{yearCE}</span></>);
        } catch { return dateString; }
    };

    const formatLastRefreshed = (date: Date): string => {
        return date.toLocaleTimeString('th-TH', {
            timeZone: 'Asia/Bangkok',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
        });
    };

    const calculateExpiryDate = (manufactureDate: string, shelfLife: string): string => {
        if (!manufactureDate || !shelfLife) return '';
        try {
            const mfgDate = new Date(manufactureDate);
            if (isNaN(mfgDate.getTime())) return '';
            const trimmed = shelfLife.trim();
            const spaceIdx = trimmed.indexOf(' ');
            const numValue = parseInt(spaceIdx === -1 ? trimmed : trimmed.substring(0, spaceIdx));
            const unit = spaceIdx === -1 ? 'months' : trimmed.substring(spaceIdx + 1).toLowerCase();
            if (isNaN(numValue) || numValue <= 0) return '';
            const newDate = new Date(mfgDate);
            if (unit.includes('day') || unit.includes('วัน')) newDate.setDate(newDate.getDate() + numValue);
            else if (unit.includes('month') || unit.includes('mon') || unit.includes('เดือน')) newDate.setMonth(newDate.getMonth() + numValue);
            else if (unit.includes('year') || unit.includes('yr') || unit.includes('ปี')) newDate.setFullYear(newDate.getFullYear() + numValue);
            else newDate.setMonth(newDate.getMonth() + numValue);
            return newDate.toISOString().split('T')[0];
        } catch { return ''; }
    };
    useEffect(() => {
        const sentinel = sentinelRef.current
        if (!sentinel) return

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    setVisibleCount(prev => prev + 10)
                }
            },
            { threshold: 0.1 }
        )

        observer.observe(sentinel)
        return () => observer.disconnect()
    }, [filteredOrders])

    // เพิ่มใน useEffect ที่ฟัง searchTerm หรือ filter
    useEffect(() => {
        setVisibleCount(10)
    }, [searchTerm]) // ใส่ตัวแปร filter ที่มีด้วย

    useEffect(() => {
        // รีเฟรชทุก 2 นาที
        const refreshInterval = setInterval(() => {
            loadOrders();
            setLastRefreshed(new Date());
            setCountdown(240);
        }, 240_000);

        // นับถอยหลังทุก 1 วินาที
        const countdownInterval = setInterval(() => {
            setCountdown(prev => (prev <= 1 ? 240 : prev - 1));
        }, 1000);

        return () => {
            clearInterval(refreshInterval);
            clearInterval(countdownInterval);
        };
    }, []);

    if (isLoading) return <DashboardSkeleton />;

    return (
        <div className="text-gray-800">
            {/* Header Block */}
            <div className="bg-gradient-to-br from-[#0f1e3d] via-[#152a54] to-[#1e3a8a] rounded-3xl shadow-xl p-6 md:p-8 mb-8 border border-blue-900/10 relative overflow-hidden">
                {/* Background decorative glowing circles */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -mr-16 -mt-16" />
                <div className="absolute bottom-0 left-0 w-60 h-60 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none -ml-12 -mb-12" />

                <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-6">
                    {/* Title */}
                    <div>
                        <div className="flex items-center gap-3 mb-1.5">
                            <div className="w-2 h-7 bg-gradient-to-b from-blue-400 to-indigo-500 rounded-full" />
                            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                                Dashboard
                                <span className="text-blue-200/80 ml-3 font-medium text-lg md:text-xl">คำสั่งพิมพ์ชิ้นงาน</span>
                            </h1>
                        </div>
                        <p className="text-[12.5px] text-slate-300/90 font-bold uppercase tracking-wider ml-5">
                            Label & Bag Stamp Production Control Center
                        </p>
                    </div>

                    {/* Search */}
                    <div className="w-full md:w-80 shrink-0">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="ค้นหาเลขลอต หรือชื่อสินค้า..."
                                className="w-full pl-9 pr-4 py-3 bg-white/10 hover:bg-white/15 focus:bg-white border border-white/15 focus:border-white rounded-2xl text-white focus:text-[#0f1e3d] placeholder-blue-200/50 focus:placeholder-slate-400 focus:outline-none focus:ring-4 focus:ring-blue-500/10 text-sm font-semibold transition-all duration-300 shadow-inner"
                            />
                        </div>
                        {searchTerm && (
                            <div className="mt-2 text-xs text-blue-200 flex justify-between items-center px-1">
                                <span className="font-medium">พบ {filteredOrders.length} รายการ</span>
                                <button type="button" onClick={() => setSearchTerm('')} className="text-rose-300 hover:text-rose-400 font-bold underline transition-colors">ล้างการค้นหา</button>
                            </div>
                        )}
                    </div>
                    {/* Auto-refresh status bar */}
                    <div className="relative mt-4 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <span className="text-[11px] text-slate-300/80 font-medium flex items-center gap-1.5">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            รีเฟรชล่าสุด: <span className="text-white font-bold">{formatLastRefreshed(lastRefreshed)}</span>
                        </span>

                        <div className="flex items-center gap-2">
                            {/* Progress bar */}
                            <div className="w-24 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full transition-all duration-1000"
                                    style={{ width: `${(countdown / 240) * 100}%` }}
                                />
                            </div>
                            <span className="text-[11px] font-bold text-blue-200/90 tabular-nums whitespace-nowrap">
                                รีเฟรชในอีก {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
                            </span>
                            {/* ปุ่ม refresh ทันที */}
                            <button
                                type="button"
                                onClick={() => { loadOrders(); setLastRefreshed(new Date()); setCountdown(240); }}
                                className="text-[10px] font-bold text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-2.5 py-1 rounded-lg border border-white/10 transition-all duration-200"
                                title="รีเฟรชทันที"
                            >
                                ↻ รีเฟรชเลย
                            </button>
                        </div>
                    </div>
                </div>

            </div>



            {
                filteredOrders.length === 0 ? (
                    <div className="bg-white/95 rounded-2xl shadow-lg p-12 text-center border border-slate-200/80">
                        <div className="text-6xl mb-4 opacity-50">📦</div>
                        <h2 className="text-2xl font-bold text-slate-500 tracking-tight">
                            {searchTerm ? `ไม่พบเลขลอต "${searchTerm}"` : 'ไม่มีคำสั่งฉลากในขณะนี้'}
                        </h2>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                        {filteredOrders.slice(0, visibleCount).map((order, index) => {
                            // Status classes
                            let borderLeftCls = 'border-l-4 border-l-slate-300';
                            let headerBgCls = 'bg-slate-50/50 border-b border-slate-100 px-5 py-4.5 flex flex-col gap-3.5';
                            if (order.is_cancelled) {
                                borderLeftCls = 'border-l-4 border-l-rose-500';
                                headerBgCls = 'bg-rose-50/60 border-b border-rose-100/80 px-5 py-4.5 flex flex-col gap-3.5';
                            } else if (order.is_verified) {
                                borderLeftCls = 'border-l-4 border-l-emerald-500';
                                headerBgCls = 'bg-emerald-50/30 border-b border-emerald-100/50 px-5 py-4.5 flex flex-col gap-3.5';
                            } else if (order.is_no_file) {
                                borderLeftCls = 'border-l-4 border-l-amber-500';
                                headerBgCls = 'bg-amber-50/30 border-b border-amber-100/50 px-5 py-4.5 flex flex-col gap-3.5';
                            } else if (order.is_printed) {
                                borderLeftCls = 'border-l-4 border-l-blue-500';
                                headerBgCls = 'bg-blue-50/30 border-b border-blue-100/50 px-5 py-4.5 flex flex-col gap-3.5';
                            }

                            return (
                                <div key={order.id} className={`
                                bg-white border border-slate-200/85 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 rounded-2xl overflow-hidden flex flex-col group relative ${borderLeftCls}
                                ${order.is_cancelled ? 'opacity-85' : ''}
                            `}>
                                    <div className={headerBgCls}>
                                        <div className="w-full">
                                            <div className="flex flex-col gap-1.5 mb-2.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-mono text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 shrink-0 tracking-wider">
                                                        {order.product_id}
                                                    </span>
                                                    {order.order_type && (
                                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider shrink-0 shadow-sm border ${order.is_cancelled ? 'bg-rose-50 text-rose-700 border-rose-200' : order.order_type === 'พิมพ์ฉลาก' ? 'bg-sky-50 text-sky-700 border-sky-200' : 'bg-indigo-50 text-indigo-700 border-indigo-200'}`}>
                                                            {order.order_type === 'พิมพ์ฉลาก' ? '🖨️ พิมพ์ฉลาก' : '🔖 ปั๊มถุง'}
                                                        </span>
                                                    )}
                                                    {order.is_cancelled && <span className="bg-rose-600 text-white text-[9px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest shrink-0 shadow-sm">ยกเลิกแล้ว</span>}
                                                    {order.updated_at && !order.is_verified && !order.is_cancelled && (
                                                        <span className="bg-amber-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-pulse">แก้ไขแล้ว</span>
                                                    )}
                                                    {(() => {
                                                        const isPending = !order.is_printed && !order.is_verified && !order.is_cancelled;
                                                        const isRecent = new Date().getTime() - new Date(order.created_at).getTime() < 5 * 60 * 1000;
                                                        return isPending && isRecent && (
                                                            <span className="bg-rose-500 text-white text-[9px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-bounce">New</span>
                                                        );
                                                    })()}
                                                </div>
                                                <h3 className="text-[16px] md:text-[17px] font-black text-[#0f1e3d] leading-snug break-words">
                                                    {order.product_name}
                                                </h3>
                                            </div>
                                            <h4 className="text-[14px] font-black text-indigo-950 tracking-tight flex items-center gap-2.5 mt-2.5">
                                                <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider bg-indigo-100/50 px-2 py-0.5 rounded-lg border border-indigo-200/60 shrink-0">LOT NO.</span>
                                                <span className="text-indigo-950 font-black text-[16px] tracking-wide">{order.lot_number}</span>
                                                {isAdmin && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            navigator.clipboard.writeText(order.lot_number);
                                                            setCopiedId(order.id);
                                                            setTimeout(() => setCopiedId(null), 2000);
                                                        }}
                                                        className="ml-1 w-6 h-6 flex items-center justify-center rounded-md text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100 transition-all duration-200"
                                                        title="คัดลอกเลขลอต"
                                                    >
                                                        {copiedId === order.id
                                                            ? <Check className="w-3.5 h-3.5 text-emerald-500" />
                                                            : <Copy className="w-3.5 h-3.5" />
                                                        }
                                                    </button>
                                                )}
                                            </h4>
                                        </div>
                                        <div className="flex gap-1.5 items-center flex-wrap w-full bg-slate-100/60 border border-slate-200/40 rounded-xl p-1 shrink-0 justify-center">
                                            {isAdmin && !order.is_cancelled && (
                                                <>
                                                    {!order.is_verified ? (
                                                        <>
                                                            {!order.is_printed ? (
                                                                <>
                                                                    <button type="button" onClick={() => markPrinted(order)} className="w-8 h-8 rounded-lg bg-transparent text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100/80 flex items-center justify-center transition-all duration-200" title="พิมพ์แล้ว">
                                                                        <Printer className="w-3.5 h-3.5" />
                                                                    </button>
                                                                    {!order.is_no_file ? (
                                                                        <button type="button" onClick={() => markNoFile(order)} className="w-8 h-8 rounded-lg bg-transparent text-slate-600 hover:bg-slate-200/60 border border-transparent hover:border-slate-300/50 flex items-center justify-center transition-all duration-200" title="ไม่มีไฟล์">
                                                                            <FileQuestion className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    ) : (
                                                                        <button type="button" onClick={() => unmarkNoFile(order)} className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200/60 flex items-center justify-center transition-all duration-200 shadow-sm" title="ยกเลิกการแจ้งเตือนไม่มีไฟล์">
                                                                            <Undo className="w-3.5 h-3.5" />
                                                                        </button>
                                                                    )}
                                                                </>
                                                            ) : (
                                                                <button type="button" onClick={() => unmarkPrinted(order)} className="w-8 h-8 rounded-lg bg-transparent text-slate-600 hover:bg-slate-200/60 border border-transparent hover:border-slate-300/50 flex items-center justify-center transition-all duration-200" title="ยกเลิกการพิมพ์">
                                                                    <Undo className="w-3.5 h-3.5" />
                                                                </button>
                                                            )}
                                                            <button type="button" onClick={() => verifyOrder(order)} className="w-8 h-8 rounded-lg bg-transparent text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100/80 flex items-center justify-center transition-all duration-200" title="ตรวจสอบเสร็จและตัดงานจบ">
                                                                <Check className="w-3.5 h-3.5" />
                                                            </button>
                                                        </>
                                                    ) : (
                                                        <button type="button" onClick={() => unverifyOrder(order)} className="w-8 h-8 rounded-lg bg-transparent text-amber-600 hover:bg-amber-50 border border-transparent hover:border-amber-100/85 flex items-center justify-center transition-all duration-200" title="ยกเลิกการตรวจสอบ">
                                                            <Undo className="w-3.5 h-3.5" />
                                                        </button>
                                                    )}
                                                </>
                                            )}
                                            {!order.is_cancelled && !order.is_verified && (isAdmin || order.created_by === userName) && (
                                                <button type="button" onClick={() => startEdit(order)} className="w-8 h-8 rounded-lg bg-transparent text-indigo-600 hover:bg-indigo-50 border border-transparent hover:border-indigo-100/80 flex items-center justify-center transition-all duration-200" title="แก้ไข">
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {!order.is_cancelled && !order.is_verified && (isAdmin || order.created_by === userName) && (
                                                <button type="button" onClick={() => handleCancelOrder(order)} className="w-8 h-8 rounded-lg bg-transparent text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100/80 flex items-center justify-center transition-all duration-200" title="ยกเลิกการสั่งพิมพ์">
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {isAdmin && order.is_cancelled && (
                                                <button type="button" onClick={() => restoreOrder(order)} className="w-8 h-8 rounded-lg bg-transparent text-emerald-600 hover:bg-emerald-50 border border-transparent hover:border-emerald-100/80 flex items-center justify-center transition-all duration-200" title="กู้คืนคำสั่งพิมพ์">
                                                    <Undo className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                            {isAdmin && (
                                                <button type="button" onClick={() => deleteOrder(order.id)} className="w-8 h-8 rounded-lg bg-transparent text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100/80 flex items-center justify-center transition-all duration-200" title="ลบ">
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    <div className="p-5 flex-1 space-y-4">
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">เวลาสั่ง (Order Time):</span>
                                            <span className="font-bold text-slate-700 sm:text-right">{formatThaiDateTimeFromISO(order.created_at)}</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">ผู้สั่ง (Created By):</span>
                                            <span className="font-bold text-slate-700 flex items-center gap-1.5 flex-wrap sm:justify-end">
                                                <UserCircle className="w-4 h-4 text-slate-400 inline" /> {order.created_by || '-'}
                                                <span className="text-[10px] font-bold text-slate-400">
                                                    ({order.created_by_department
                                                        ? order.created_by_department.split(' ')[0]
                                                        : 'ไม่ระบุ'})
                                                </span>
                                            </span>
                                        </div>
                                        <div className="my-3 border-t border-slate-100"></div>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">วันที่ผลิต (Mfg Date):</span>
                                            <span className="font-bold text-slate-700 sm:text-right">{formatToThaiDate(order.production_date)}</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">วันหมดอายุ (Exp Date):</span>
                                            <span className="font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-100/40 sm:text-right shrink-0">{formatToThaiDate(order.expiry_date)}</span>
                                        </div>
                                        <div className="my-3 border-t border-slate-100"></div>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">อายุผลิตภัณฑ์ (Shelf Life):</span>
                                            <span className="font-bold text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded-lg border border-blue-100/40 shrink-0">{order.product_exp} เดือน</span>
                                        </div>
                                        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-1 sm:gap-4 text-[13px]">
                                            <span className="text-slate-400 font-bold uppercase tracking-wider text-[11px] tracking-wider shrink-0">จำนวน (Quantity):</span>
                                            <span className="font-black text-xl text-emerald-600 bg-emerald-50 px-3 py-1 rounded-xl border border-emerald-100/60 shadow-sm shrink-0">{order.quantity}</span>
                                        </div>

                                        <EditHistory orderId={order.id} updatedAt={order.updated_at} auditKey={auditKey} />

                                        {order.notes && order.notes !== '-' && (
                                            <div className="mt-3 bg-amber-50/50 p-3 rounded-xl border border-amber-200/50 text-[12.5px] text-amber-800 shadow-inner">
                                                <span className="font-bold text-amber-900 block mb-1">📝 หมายเหตุ:</span>
                                                <span className="text-amber-800 font-medium">{order.notes}</span>
                                            </div>
                                        )}

                                        {order.image_url && (
                                            <div className="mt-4 pt-4 border-t border-slate-100 relative">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider">📷 ภาพตัวอย่างฉลาก:</span>
                                                    {isAdmin && (
                                                        <button type="button" onClick={() => deleteImage(order)} className="text-[10px] font-bold bg-rose-50 text-rose-600 hover:bg-rose-600 hover:text-white px-2 py-1 rounded-lg border border-rose-200/60 transition-all duration-300 flex items-center gap-1 shadow-sm">
                                                            <Trash2 className="w-3 h-3" /> ลบรูป
                                                        </button>
                                                    )}
                                                </div>
                                                <div className="w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-50 flex justify-center group/img relative shadow-sm">
                                                    <img src={order.image_url} alt={`ตัวอย่างฉลาก ${order.lot_number}`}
                                                        className="max-h-48 object-contain w-full hover:scale-105 transition-transform duration-500 cursor-pointer"
                                                        onClick={() => window.open(order.image_url || '', '_blank')}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* ✅ Card Footer */}
                                    <div className={`p-4 text-center tracking-wide font-bold 
                                    ${order.is_cancelled ? 'bg-gradient-to-r from-rose-500 to-rose-600 text-white shadow-inner animate-pulse'
                                            : order.is_verified ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-inner'
                                                : order.is_no_file ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-inner'
                                                    : order.is_printed ? 'bg-gradient-to-r from-blue-500 to-indigo-600 text-white shadow-inner'
                                                        : 'bg-slate-100 text-slate-400 border-t border-slate-200/80'}`}
                                    >
                                        {order.is_cancelled ? (
                                            <span className="flex items-center justify-center gap-2 text-sm tracking-widest uppercase">
                                                <X className="w-5 h-5 inline mr-1" /> คำสั่งพิมพ์นี้ถูกยกเลิกแล้ว
                                            </span>
                                        ) : order.is_verified ? (
                                            <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                                                <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 text-sm text-center">
                                                    <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 shrink-0" /> ผู้ปฏิบัติงาน:</span>
                                                    {order.verified_by && order.verified_by.includes('(') ? (
                                                        <div className="flex items-center gap-2">
                                                            <span>{order.verified_by.substring(0, order.verified_by.indexOf('(')).trim()}</span>
                                                        </div>
                                                    ) : (
                                                        <span>{order.verified_by || '-'}</span>
                                                    )}
                                                </div>
                                                <span className="text-[11px] font-medium text-emerald-100 bg-emerald-800/40 px-3 py-1 rounded-full shadow-inner">
                                                    วันที่และเวลาตรวจสอบ: {formatThaiDateTimeFromISO(order.verified_at)}
                                                </span>
                                            </div>
                                        ) : order.is_no_file ? (
                                            <span className="flex items-center justify-center gap-2 text-sm">
                                                <FileQuestion className="w-5 h-5 inline mr-1" /> แจ้งเตือน: ไม่มีไฟล์ฉลากสินค้ารายการนี้
                                            </span>
                                        ) : order.is_printed ? (
                                            <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                                                <span className="flex items-center justify-center gap-2 text-sm tracking-wider">
                                                    <Printer className="w-4 h-4" /> พิมพ์ฉลากแล้ว รอตัดชิ้นงาน
                                                </span>
                                                {order.printed_by && (
                                                    <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1">
                                                        <span className="flex items-center gap-1 text-[11px] text-blue-100">
                                                            ชื่อผู้พิมพ์ชิ้นงาน:
                                                            {order.printed_by.includes('(') ? (
                                                                <>
                                                                    <span>{order.printed_by.substring(0, order.printed_by.indexOf('(')).trim()}</span>
                                                                </>
                                                            ) : (
                                                                <span>{order.printed_by}</span>
                                                            )}
                                                        </span>
                                                        {order.printed_at && (
                                                            <span className="text-[10px] text-blue-100 bg-blue-700/40 px-2 py-0.5 rounded-full">
                                                                วันที่และเวลาพิมพ์: {formatThaiDateTimeFromISO(order.printed_at)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <span className="flex items-center justify-center gap-2 text-[12.5px] uppercase tracking-wider font-bold">
                                                <Clock className="w-4 h-4 inline mr-1" /> กำลังรอการจัดทำชิ้นงาน
                                            </span>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}

            {visibleCount < filteredOrders.length && (
                <div ref={sentinelRef} className="flex justify-center py-8 col-span-full">
                    <div className="flex items-center gap-2">
                        {[0, 1, 2].map(i => (
                            <div key={i} className="w-2 h-2 rounded-full bg-blue-400 animate-bounce"
                                style={{ animationDelay: `${i * 0.15}s` }} />
                        ))}
                        <span className="text-slate-400 text-xs font-medium ml-1">
                            กำลังโหลด {Math.min(10, filteredOrders.length - visibleCount)} รายการถัดไป...
                        </span>
                    </div>
                </div>
            )}

            {visibleCount >= filteredOrders.length && filteredOrders.length > 10 && (
                <div className="text-center py-6 text-slate-400 text-xs col-span-full">
                    แสดงครบทั้ง {filteredOrders.length} รายการแล้ว
                </div>
            )}


            {/* Editing Dialog Modal */}
            {editingOrder && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl p-6 w-full max-w-md animate-slide-up relative overflow-hidden">
                        <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                            <div className="flex items-center gap-2">
                                <span className="p-2 rounded-xl bg-blue-50 text-blue-600">
                                    <Edit2 className="w-5 h-5" />
                                </span>
                                <h2 className="text-lg font-black text-[#0f1e3d] tracking-tight">แก้ไขข้อมูลคำสั่งชิ้นงาน</h2>
                            </div>
                            <button type="button" onClick={() => setEditingOrder(null)} className="text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 p-1.5 rounded-full transition-colors">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">เลขลอตสินค้า (Lot Number)</label>
                                <input type="text" value={editingOrder.lot_number}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, lot_number: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-sm" />
                            </div>

                            {/* ประเภทคำสั่ง */}
                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">ประเภทคำสั่ง (Order Type)</label>
                                <div className="flex gap-3">
                                    <label className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-bold transition-all text-xs gap-2 ${editingOrder.order_type === 'พิมพ์ฉลาก' ? 'bg-[#0f1e3d] text-white border-[#0f1e3d] shadow-md shadow-blue-900/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50'}`}>
                                        <input
                                            type="radio"
                                            name="edit_orderType"
                                            value="พิมพ์ฉลาก"
                                            checked={editingOrder.order_type === 'พิมพ์ฉลาก'}
                                            onChange={(e) => setEditingOrder({ ...editingOrder, order_type: e.target.value })}
                                            className="hidden"
                                        />
                                        🖨️ พิมพ์ฉลาก
                                    </label>
                                    <label className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-bold transition-all text-xs gap-2 ${editingOrder.order_type === 'ปั๊มถุง' ? 'bg-indigo-950 text-white border-indigo-950 shadow-md shadow-indigo-900/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50'}`}>
                                        <input
                                            type="radio"
                                            name="edit_orderType"
                                            value="ปั๊มถุง"
                                            checked={editingOrder.order_type === 'ปั๊มถุง'}
                                            onChange={(e) => setEditingOrder({ ...editingOrder, order_type: e.target.value })}
                                            className="hidden"
                                        />
                                        🔖 ปั๊มถุง
                                    </label>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">จำนวนสั่งทำ (Quantity)</label>
                                <input type="number" value={editingOrder.quantity}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, quantity: parseInt(e.target.value) || 0 })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-sm" />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">วันที่ผลิต (Production Date)</label>
                                <input type="date" value={editingOrder.production_date || ''}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        setEditingOrder({ ...editingOrder, production_date: newDate, expiry_date: calculateExpiryDate(newDate, editingOrder.product_exp) });
                                    }}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-sm"
                                />
                                {editingOrder.expiry_date && (
                                    <p className="mt-2 text-xs text-rose-500 font-bold flex items-center gap-1">
                                        <span>💡</span> วันหมดอายุใหม่: {editingOrder.expiry_date.split('-').reverse().join('/')}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">หมายเหตุ (Notes)</label>
                                <textarea value={editingOrder.notes || ''}
                                    onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })}
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 resize-none shadow-sm" rows={3} />
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6 border-t border-slate-100 pt-4">
                            <button type="button" onClick={() => setEditingOrder(null)} className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl font-bold text-xs transition duration-300">ยกเลิก</button>
                            <button type="button" onClick={saveEdit} className="flex-1 bg-[#0f1e3d] hover:bg-[#152a54] text-white py-3 rounded-xl font-bold text-xs shadow-md shadow-blue-900/10 hover:shadow-lg transition duration-300">💾 บันทึกการแก้ไข</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}