'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { Check, Undo, Edit2, Trash2, UserCircle, CheckCircle2, Clock, X, Printer, FileQuestion } from 'lucide-react';
import EditHistory from '../components/EditHistory';

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
}

export default function DashboardPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [editingOrder, setEditingOrder] = useState<OrderInterface | null>(null);
    const [role, setRole] = useState('');
    const [userName, setUserName] = useState('');
    const [employeeId, setEmployeeId] = useState('');
    const [currentUserId, setCurrentUserId] = useState(''); // ✅ เก็บ UUID ของ user ปัจจุบัน
    const [timeFilter, setTimeFilter] = useState<'week' | 'month'>('week');
    const router = useRouter();

    useEffect(() => {
        fetchUserInfo();
        loadOrders();

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
                (payload) => {
                    const nowTS = Date.now();
                    if (payload.eventType === 'INSERT') {
                        playNotificationSound();
                        Swal.fire({
                            toast: true, position: 'top-end', icon: 'info',
                            title: '🔔 มีคำสั่งพิมพ์ฉลากมาใหม่!',
                            showConfirmButton: false, timer: 4000, timerProgressBar: true,
                            background: '#eff6ff', color: '#1e3a8a'
                        });
                    } else if (payload.eventType === 'UPDATE' && payload.new) {
                        const newData = payload.new as any;
                        if (newData.updated_at) {
                            const updateTS = new Date(newData.updated_at).getTime();
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
                    }
                    loadOrders();
                }
            ).subscribe();

        return () => { supabase.removeChannel(channel); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
            } else {
                setRole('user');
                setUserName(session.user.email?.split('@')[0] || 'User');
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
                    .from('orders').select('*')
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

            const { data: fgcodeData } = await supabase.from('fgcode').select('id, name');
            if (fgcodeData && fgcodeData.length > 0) {
                const productMap = Object.fromEntries(
                    fgcodeData.map((p: { id: string; name: string }) => [p.id, p.name])
                );
                allOrders = allOrders.map(order => {
                    const currentName = productMap[order.product_id];
                    const nameChanged = currentName && currentName !== order.product_name;
                    return {
                        ...order,
                        product_name: currentName ?? order.product_name,
                        original_product_name: nameChanged ? order.product_name : undefined,
                    };
                });
            }

            setOrders(allOrders);
        } catch (error) {
            console.error('Error loading orders:', error);
            Swal.fire({ icon: 'error', title: 'โหลดข้อมูลไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

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

    const logAuditTrail = async (orderId: number, action: string, summary: string, changes?: any) => {
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
                const { error } = await supabase.from('orders').delete().eq('id', id);
                if (error) throw error;
                setOrders(prev => prev.filter(order => order.id !== id));
                Swal.fire({ icon: 'success', title: 'ลบสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch (error) {
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
                const displayVal = (val: any) =>
                    (val === null || val === undefined || String(val).trim() === '' || val === '-') ? 'ไม่มี' : String(val).trim();
                const oldLot = displayVal(original.lot_number); const newLot = displayVal(editingOrder.lot_number);
                if (oldLot !== newLot) changeDetails.push(`เลขลอต: ${oldLot} ➡️ ${newLot}`);
                const oldQty = Number(original.quantity) || 0; const newQty = Number(editingOrder.quantity) || 0;
                if (oldQty !== newQty) changeDetails.push(`จำนวน: ${oldQty} ➡️ ${newQty}`);
                const oldDateRaw = original.production_date || ''; const newDateRaw = editingOrder.production_date || '';
                if (oldDateRaw !== newDateRaw) {
                    const formatDate = (d: string) => d ? d.split('-').reverse().join('/') : 'ไม่มี';
                    changeDetails.push(`วันที่ผลิต: ${formatDate(oldDateRaw)} ➡️ ${formatDate(newDateRaw)}`);
                }
                const oldNotes = displayVal(original.notes); const newNotes = displayVal(editingOrder.notes);
                if (oldNotes !== newNotes) changeDetails.push(`หมายเหตุ: ${oldNotes} ➡️ ${newNotes}`);
            }

            const summary = changeDetails.length > 0 ? `แก้ไข: ${changeDetails.join(' | ')}` : 'อัปเดตข้อมูล';
            const editorName = getCurrentUserIdentifier();
            const updateData = {
                lot_number: editingOrder.lot_number, quantity: editingOrder.quantity,
                production_date: editingOrder.production_date, expiry_date: editingOrder.expiry_date,
                notes: editingOrder.notes, updated_at: now, updated_by: editorName, edit_summary: summary
            };

            const { error } = await supabase.from('orders').update(updateData).eq('id', editingOrder.id);
            if (error) throw error;

            await logAuditTrail(editingOrder.id, 'UPDATE', summary);
            setOrders(prev => prev.map(o => o.id === editingOrder.id ? { ...o, ...updateData } : o));
            setEditingOrder(null);
            Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', timer: 1500, showConfirmButton: false });
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'แก้ไขไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
        }
    };

    const startEdit = (order: OrderInterface) => setEditingOrder({ ...order });

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
            } catch (error) {
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
            } catch (error) {
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
            } catch (error) {
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
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'ยกเลิกไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const handleCancelOrder = async (order: OrderInterface) => {
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
            } catch (error) {
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
            } catch (error) {
                Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
            }
        }
    };

    const unmarkNoFile = async (order: OrderInterface) => {
        try {
            const { error } = await supabase.from('orders').update({ is_no_file: false }).eq('id', order.id);
            if (error) throw error;
            setOrders(prev => prev.map(o => o.id === order.id ? { ...o, is_no_file: false } : o));
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'ดำเนินการไม่สำเร็จ', text: 'กรุณาลองใหม่อีกครั้ง' });
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
            } catch (error) {
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
                const urlParts = order.image_url.split('/order-images/');
                if (urlParts.length > 1) {
                    const { error: storageError } = await supabase.storage.from('order-images').remove([urlParts[1]]);
                    if (storageError) throw storageError;
                }
                const { error: dbError } = await supabase.from('orders').update({ image_url: null }).eq('id', order.id);
                if (dbError) throw dbError;
                setOrders(prev => prev.map(o => o.id === order.id ? { ...o, image_url: null } : o));
                Swal.fire({ icon: 'success', title: 'ลบรูปภาพสำเร็จ!', timer: 1500, showConfirmButton: false });
            } catch (error) {
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

    return (
        <div className="text-gray-800">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 md:p-8 mb-8 border border-white/20">
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-4xl font-bold text-gray-800 mb-2 gradient-title tracking-tight pt-2 leading-relaxed">
                        📊 Dashboard คำสั่งฉลากสินค้า
                    </h1>
                </div>
                <div className="mb-2 max-w-md">
                    <label className="block text-sm font-semibold text-gray-700 mb-2">🔍 ค้นหาเลขลอตสินค้า</label>
                    <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
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
                            <div className={`p-5 border-b flex justify-between items-start ${order.is_cancelled ? 'bg-red-100 border-red-200' : index % 2 === 0 ? 'bg-blue-100/80 border-blue-100' : 'bg-indigo-100/80 border-blue-100'}`}>
                                <div className="pr-4 pointer-events-none">
                                    <div className="flex gap-2 items-center mb-1 flex-wrap">
                                        <h3 className="text-lg font-bold text-gray-900 line-clamp-1 break-all flex items-center gap-2">
                                            {order.product_name}
                                            <span className="text-[11px] font-bold text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 tracking-wider">{order.product_id}</span>
                                        </h3>
                                        {order.original_product_name && (
                                            <div className="mt-1 flex items-center gap-1.5 text-[11px] bg-orange-50 border border-orange-200 text-orange-700 px-2.5 py-1 rounded-lg w-fit max-w-full flex-wrap">
                                                <span className="shrink-0">🔄 ชื่อเปลี่ยน:</span>
                                                <span className="line-through text-orange-400 truncate max-w-[120px]" title={order.original_product_name}>{order.original_product_name}</span>
                                                <span className="shrink-0">→</span>
                                                <span className="font-bold truncate max-w-[120px]" title={order.product_name}>{order.product_name}</span>
                                            </div>
                                        )}
                                        {order.order_type && (
                                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider shrink-0 shadow-sm border ${order.is_cancelled ? 'bg-red-200 text-red-800 border-red-300' : order.order_type === 'พิมพ์ฉลาก' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-purple-50 text-purple-700 border-purple-200'}`}>
                                                {order.order_type}
                                            </span>
                                        )}
                                        {order.is_cancelled && <span className="bg-red-600 text-white text-[10px] px-3 py-0.5 rounded-full font-bold uppercase tracking-widest shrink-0 shadow-md">ยกเลิกแล้ว</span>}
                                        {order.updated_at && !order.is_verified && !order.is_cancelled && (
                                            <span className="bg-amber-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-pulse">แก้ไขแล้ว</span>
                                        )}
                                        {(() => {
                                            const isPending = !order.is_printed && !order.is_verified && !order.is_cancelled;
                                            const isRecent = new Date().getTime() - new Date(order.created_at).getTime() < 5 * 60 * 1000;
                                            return isPending && isRecent && (
                                                <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0 shadow-sm animate-bounce">New</span>
                                            );
                                        })()}
                                    </div>
                                    <h4 className="text-base font-extrabold text-indigo-700 tracking-tight flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest bg-indigo-50 px-1 py-0.5 rounded border border-indigo-100 italic">LOT</span>
                                        {order.lot_number}
                                    </h4>
                                </div>
                                <div className="flex gap-1 shrink-0">
                                    {isAdmin && !order.is_cancelled && (
                                        <>
                                            {!order.is_verified ? (
                                                <>
                                                    {!order.is_printed ? (
                                                        <>
                                                            <button onClick={() => markPrinted(order)} className="w-9 h-9 rounded-xl text-white bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="พิมพ์แล้ว">
                                                                <Printer className="w-4 h-4" />
                                                            </button>
                                                            {!order.is_no_file ? (
                                                                <button onClick={() => markNoFile(order)} className="w-9 h-9 rounded-xl text-white bg-slate-500 hover:bg-slate-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ไม่มีไฟล์">
                                                                    <FileQuestion className="w-5 h-5" />
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => unmarkNoFile(order)} className="w-9 h-9 rounded-xl text-white bg-amber-500 hover:bg-amber-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการแจ้งเตือนไม่มีไฟล์">
                                                                    <Undo className="w-4 h-4" />
                                                                </button>
                                                            )}
                                                        </>
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
                                    {!order.is_cancelled && !order.is_verified && (
                                        <button onClick={() => startEdit(order)} className="w-9 h-9 rounded-xl text-white bg-indigo-500 hover:bg-indigo-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="แก้ไข">
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                    )}
                                    {!order.is_cancelled && !order.is_verified && (
                                        <button onClick={() => handleCancelOrder(order)} className="w-9 h-9 rounded-xl text-white bg-red-600 hover:bg-red-700 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ยกเลิกการสั่งพิมพ์">
                                            <X className="w-5 h-5" />
                                        </button>
                                    )}
                                    {isAdmin && order.is_cancelled && (
                                        <button onClick={() => restoreOrder(order)} className="w-9 h-9 rounded-xl text-white bg-green-600 hover:bg-green-700 flex items-center justify-center transition-colors shadow-md hover:shadow-lg animate-bounce" title="กู้คืนคำสั่งพิมพ์">
                                            <Undo className="w-4 h-4" />
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button onClick={() => deleteOrder(order.id)} className="w-9 h-9 rounded-xl text-white bg-red-500 hover:bg-red-600 flex items-center justify-center transition-colors shadow-md hover:shadow-lg" title="ลบ">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            </div>

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

                                <EditHistory orderId={order.id} updatedAt={order.updated_at} />

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
                                                <button onClick={() => deleteImage(order)} className="text-xs bg-red-100 text-red-600 hover:bg-red-200 px-2 py-1 rounded border border-red-200 transition-colors flex items-center gap-1">
                                                    <Trash2 className="w-3 h-3" /> ลบรูป
                                                </button>
                                            )}
                                        </div>
                                        <div className="w-full rounded-xl overflow-hidden border border-gray-200 bg-gray-50 flex justify-center">
                                            <img src={order.image_url} alt={`ตัวอย่างฉลาก ${order.lot_number}`}
                                                className="max-h-48 object-contain w-full hover:scale-105 transition-transform duration-300 cursor-pointer"
                                                onClick={() => window.open(order.image_url || '', '_blank')}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ✅ Card Footer */}
                            <div className={`p-4 text-center tracking-wide font-bold 
                                ${order.is_cancelled ? 'bg-red-600 text-white shadow-inner animate-pulse'
                                    : order.is_verified ? 'bg-emerald-600 text-white shadow-inner'
                                        : order.is_no_file ? 'bg-amber-500 text-white shadow-inner'
                                            : order.is_printed ? 'bg-blue-500 text-white shadow-inner'
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
                                ) : order.is_no_file ? (
                                    <span className="flex items-center justify-center gap-2 text-sm">
                                        <FileQuestion className="w-5 h-5 inline mr-1" /> แจ้งเตือน: ไม่มีไฟล์ฉลากสินค้ารายการนี้
                                    </span>
                                ) : order.is_printed ? (
                                    // ✅ แสดงชื่อผู้พิมพ์และเวลาด้านล่าง
                                    <div className="flex flex-col items-center justify-center gap-1.5 py-1">
                                        <span className="flex items-center justify-center gap-2 text-sm tracking-wider">
                                            <Printer className="w-5 h-5" /> พิมพ์ฉลากแล้ว รอตัดชิ้นงาน
                                        </span>
                                        {order.printed_by && (
                                            <div className="flex flex-wrap justify-center items-center gap-x-2 gap-y-1 mt-0.5">
                                                <span className="flex items-center gap-1 text-xs text-blue-100">
                                                    ชื่อผู้พิมพ์ชิ้นงาน:
                                                    {order.printed_by.includes('(') ? (
                                                        <>
                                                            <span>{order.printed_by.substring(0, order.printed_by.indexOf('(')).trim()}</span>
                                                            <span className="bg-blue-700/60 px-2 py-0.5 rounded-lg border border-blue-400/40 font-bold tracking-widest text-[11px]">
                                                                รหัสพนักงาน: {order.printed_by.substring(order.printed_by.indexOf('(') + 1, order.printed_by.indexOf(')'))}
                                                            </span>
                                                        </>
                                                    ) : (
                                                        <span>{order.printed_by}</span>
                                                    )}
                                                </span>
                                                {order.printed_at && (
                                                    <span className="text-[11px] text-blue-100 bg-blue-700/40 px-2 py-0.5 rounded-full">
                                                        วันที่และเวลาที่พิมพ์ชิ้นงาน: {formatThaiDateTimeFromISO(order.printed_at)}
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
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
                                <input type="text" value={editingOrder.lot_number} onChange={(e) => setEditingOrder({ ...editingOrder, lot_number: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">จำนวน</label>
                                <input type="number" value={editingOrder.quantity} onChange={(e) => setEditingOrder({ ...editingOrder, quantity: parseInt(e.target.value) || 0 })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm" />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">วันที่ผลิต</label>
                                <input type="date" value={editingOrder.production_date || ''}
                                    onChange={(e) => {
                                        const newDate = e.target.value;
                                        setEditingOrder({ ...editingOrder, production_date: newDate, expiry_date: calculateExpiryDate(newDate, editingOrder.product_exp) });
                                    }}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-sm"
                                />
                                {editingOrder.expiry_date && (
                                    <p className="mt-1 text-xs text-red-500 font-medium">💡 วันหมดอายุใหม่: {formatToThaiDate(editingOrder.expiry_date)}</p>
                                )}
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-1">หมายเหตุ</label>
                                <textarea value={editingOrder.notes || ''} onChange={(e) => setEditingOrder({ ...editingOrder, notes: e.target.value })} className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none transition resize-none shadow-sm" rows={3} />
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