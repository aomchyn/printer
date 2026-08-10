'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { logAction } from '@/lib/logger';
import { ImagePlus, X, ClipboardCheck } from 'lucide-react';
import { StabilitySkeleton } from './skeleton-loading-stability';

export interface OrderInterface {
    id?: number;
    orderDate: string;
    orderTime: string;
    orderDateTime: string;
    orderType: string;
    lotNumber: string;
    productId: string;
    productName: string;
    productExp: string;
    productionDate: string;
    expiryDate: string;
    quantity: number;
    notes?: string;
    createdBy?: string;
    createdByDepartment?: string;
    isVerified?: boolean;
    verifiedBy?: string | null;
    verifiedAt?: string | null;
    createdAt?: string;
}

export interface FgcodeInterface {
    id: string;
    name: string;
    exp: string;
}

const FormWrapper = ({ isModal, onClose, children }: { isModal: boolean, onClose: () => void, children: React.ReactNode }) => {
    if (isModal) {
        return (
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white rounded-2xl md:rounded-3xl shadow-xl w-full max-w-2xl md:max-w-3xl max-h-[90vh] overflow-y-auto p-4 md:p-8 relative">
                    <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                        <h2 className="text-xl font-bold text-[#0f1e3d]">แก้ไขข้อมูล Stability</h2>
                        <button type="button" onClick={onClose} className="p-2 bg-slate-100 text-slate-500 rounded-full hover:bg-slate-200 transition-colors">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                    {children}
                </div>
            </div>
        );
    }
    return (
        <div className="mt-8 border-t border-slate-100 pt-8 animate-in fade-in slide-in-from-top-4 duration-300">
            {children}
        </div>
    );
};

export default function StabilityPage() {
    // ✅ ใส่ค่า initial time ตรงนี้แทน useEffect เพื่อหลีกเลี่ยง setState in effect
    const [orderData, setOrderData] = useState<OrderInterface>(() => {
        const now = new Date();
        return {
            orderDate: now.toISOString().split('T')[0],
            orderTime: now.toTimeString().split(' ')[0].substring(0, 5),
            orderDateTime: now.toISOString(),
            orderType: 'พิมพ์ฉลาก',
            lotNumber: '',
            productId: '',
            productName: '',
            productExp: '',
            productionDate: '',
            expiryDate: '',
            quantity: 0,
            notes: '',
        };
    });
    const [products, setProducts] = useState<FgcodeInterface[]>([]);
    const [username, setUsername] = useState('Unknown User');
    const [department, setDepartment] = useState('');
    const [imageFile, setImageFile] = useState<File | null>(null);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [productSearch, setProductSearch] = useState('');
    const [showDropdown, setShowDropdown] = useState(false);
    const [stabilityLogs, setStabilityLogs] = useState<OrderInterface[]>([]);
    const [selectedIntervals, setSelectedIntervals] = useState<number[]>([0, 3, 6, 9, 12]);
    const [completedIntervals, setCompletedIntervals] = useState<number[]>([]);
    const [feedType, setFeedType] = useState('');
    const [remark, setRemark] = useState('');
    const [editOrderId, setEditOrderId] = useState<number | null>(null);
    const [globalSearch, setGlobalSearch] = useState('');
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);


    // ✅ ย้ายฟังก์ชันขึ้นก่อน useEffect
    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data } = await supabase
                    .from('users')
                    .select('name, department')
                    .eq('id', session.user.id)
                    .single();
                if (data?.name) setUsername(data.name);
                if (data?.department) setDepartment(data.department);
            }
        } catch {
            console.error('Error fetching user info');
        }
    };

    const fetchProducts = async () => {
        try {
            let allData: FgcodeInterface[] = [];
            let from = 0;
            const pageSize = 1000;
            let hasMore = true;

            while (hasMore) {
                const { data, error } = await supabase
                    .from('fgcode')
                    .select('*')
                    .range(from, from + pageSize - 1);

                if (error) throw error;

                if (data && data.length > 0) {
                    allData = [...allData, ...data];
                    from += pageSize;
                    hasMore = data.length === pageSize;
                } else {
                    hasMore = false;
                }
            }

            setProducts(allData);
        } catch (err) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า:', err);
        }
    };

    const fetchStabilityLogs = async () => {
        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('order_type', 'Stability Feed')
                .eq('is_deleted', false)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                const mappedData = data.map(item => ({
                    id: item.id,
                    orderDate: item.order_date,
                    orderTime: item.order_time,
                    orderDateTime: item.order_datetime,
                    orderType: item.order_type,
                    lotNumber: item.lot_number,
                    productId: item.product_id,
                    productName: item.product_name,
                    productExp: item.product_exp,
                    productionDate: item.production_date,
                    expiryDate: item.expiry_date,
                    quantity: item.quantity,
                    notes: item.notes,
                    createdBy: item.created_by,
                    createdAt: item.created_at,
                }));
                setStabilityLogs(mappedData);
            }
        } catch (err) {
            console.error('Error fetching stability logs:', err);
        }
    };

    // ✅ useEffect เดียว ไม่มี setState โดยตรง
    useEffect(() => {
        Promise.all([fetchUserInfo(), fetchProducts(), fetchStabilityLogs()]).finally(() => setIsLoading(false));
    }, []);


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
                numValue = parseInt(trimmedShelfLife.substring(0, spaceIndex));
                unit = trimmedShelfLife.substring(spaceIndex + 1).toLowerCase();
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

    const handleProductionDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!orderData.productId) return;

        const mfgDate = e.target.value;
        setOrderData(prev => ({
            ...prev,
            productionDate: mfgDate,
            expiryDate: calculateExpiryDate(mfgDate, prev.productExp),
        }));
    };

    const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!file.type.startsWith('image/')) {
            Swal.fire({ icon: 'error', title: 'ไฟล์ไม่ถูกต้อง', text: 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, WEBP)' });
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            Swal.fire({ icon: 'error', title: 'ไฟล์ใหญ่เกินไป', text: 'ขนาดไฟล์ต้องไม่เกิน 2 MB' });
            return;
        }

        setImageFile(file);
        setImagePreview(URL.createObjectURL(file));
    };

    const removeImage = () => {
        setImageFile(null);
        setImagePreview(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const confirm = await Swal.fire({
            icon: 'question',
            title: editOrderId ? 'ยืนยันการอัปเดตข้อมูล?' : 'ยืนยันการบันทึก?',
            html: `
                <div style="font-family: sans-serif;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; margin:auto;">
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">🔢 ลอต</td><td style="padding:4px 6px; font-weight:600;">${orderData.lotNumber}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">📝 ชื่อสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productName}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📅 เดือนที่ทดสอบ</td><td style="padding:4px 6px; font-weight:600; color:#059669;">${selectedIntervals.length > 0 ? selectedIntervals.map(m => m === 0 ? 'Initial' : m + ' เดือน').join(', ') : '-'}</td></tr>
                        ${feedType ? `<tr><td style="padding:4px 6px; color:#4b5563;">ประเภทอาหาร</td><td style="padding:4px 6px;"><span style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:#fffbeb; color:#b45309; border:1px solid #fde68a; font-size:12px; font-weight:600;"><svg style="width:12px; height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>${feedType}</span></td></tr>` : ''}
                        ${remark ? `<tr style="${feedType ? 'background:#f9fafb;' : ''}"><td style="padding:4px 6px; color:#4b5563;">หมายเหตุ</td><td style="padding:4px 6px;"><span style="display:inline-flex; align-items:center; gap:4px; padding:2px 6px; border-radius:4px; background:#f3f4f6; color:#4b5563; border:1px solid #e5e7eb; font-size:12px; font-weight:600;"><svg style="width:12px; height:12px;" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>${remark}</span></td></tr>` : ''}
                    </table>
                </div>
            `,
            showCancelButton: true,
            confirmButtonText: 'ยืนยัน',
            cancelButtonText: 'ยกเลิก',
            confirmButtonColor: '#2563eb',
            cancelButtonColor: '#6b7280',
            width: 'clamp(300px, 90vw, 500px)',
            heightAuto: true,
            customClass: {
                popup: 'rounded-xl text-sm !p-4',
                title: 'text-base',
                confirmButton: 'text-sm py-2 px-4',
                cancelButton: 'text-sm py-2 px-4',
            },
        });

        if (!confirm.isConfirmed) return;

        try {
            const requiredFields = ['lotNumber', 'productId', 'productionDate'];
            const missingFields = requiredFields.filter(field => !orderData[field as keyof OrderInterface]);
            if (missingFields.length > 0) {
                alert(`กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.join(', ')}`);
                return;
            }

            if (!orderData.productExp || orderData.productExp.trim() === '') {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่สามารถบันทึกได้',
                    text: 'สินค้านี้ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาเลือกสินค้าใหม่หรือตรวจสอบข้อมูลใน FG Code',
                    confirmButtonText: 'รับทราบ',
                    confirmButtonColor: '#dc2626',
                });
                return;
            }

            setUploading(true);

            const notesPayload = JSON.stringify({
                selected: selectedIntervals.sort((a, b) => a - b),
                completed: completedIntervals,
                feedType,
                remark
            });

            const payload = {
                order_date: orderData.orderDate,
                order_time: orderData.orderTime,
                order_datetime: orderData.orderDateTime,
                order_type: 'Stability Feed',
                lot_number: orderData.lotNumber,
                product_id: orderData.productId,
                product_name: orderData.productName,
                product_exp: orderData.productExp,
                production_date: orderData.productionDate,
                expiry_date: orderData.expiryDate,
                quantity: 1,
                notes: notesPayload,
                created_by: username,
                created_by_department: department || 'ไม่ระบุหน่วยงาน',
                is_verified: false,
                verified_by: null,
                verified_at: null,
                image_url: null
            };

            let submitError;
            if (editOrderId) {
                const { error } = await supabase.from('orders').update(payload).eq('id', editOrderId);
                submitError = error;
            } else {
                const { error } = await supabase.from('orders').insert(payload);
                submitError = error;
            }

            if (submitError) throw new Error(submitError.message);

            if (!editOrderId) {
                await logAction('CREATE_STABILITY_FEED', {
                    product_id: orderData.productId,
                    lot_number: orderData.lotNumber,
                    product_name: orderData.productName
                });
            } else {
                await logAction('UPDATE_STABILITY_FEED', {
                    order_id: editOrderId,
                    product_id: orderData.productId,
                    lot_number: orderData.lotNumber
                });
            }

            Swal.fire({ icon: 'success', title: 'สำเร็จ', text: editOrderId ? 'อัปเดตข้อมูลสำเร็จแล้ว' : 'บันทึกคำสั่งพิมพ์ชิ้นงานสำเร็จแล้ว' });

            fetchStabilityLogs();

            // Reset form
            setSelectedIntervals([0, 3, 6, 9, 12]);
            setCompletedIntervals([]);
            setFeedType('');
            setRemark('');
            setEditOrderId(null);
            setIsFormOpen(false);
            removeImage();
            setProductSearch('');
            const resetNow = new Date();
            setOrderData({
                orderDate: resetNow.toISOString().split('T')[0],
                orderTime: resetNow.toTimeString().split(' ')[0].substring(0, 5),
                orderDateTime: resetNow.toISOString(),
                orderType: 'พิมพ์ฉลาก',
                lotNumber: '',
                productId: '',
                productName: '',
                productExp: '',
                productionDate: '',
                expiryDate: '',
                quantity: 0,
                notes: '',
            });
        } catch {
            Swal.fire({ icon: 'error', title: 'เกิดข้อผิดพลาด', text: 'กรุณาลองใหม่อีกครั้ง' });
        } finally {
            setUploading(false);
        }
    };

    const formatThaiDateTime = () => {
        if (!orderData.orderDate || !orderData.orderTime) return 'กำลังโหลด...';
        try {
            const [year, month, day] = orderData.orderDate.split('-');
            const [hours, minutes] = orderData.orderTime.split(':');
            const thaiYear = parseInt(year) + 543;
            return `${day}/${month}/${thaiYear}, ${hours}:${minutes}`;
        } catch {
            return `${orderData.orderDate}, ${orderData.orderTime}`;
        }
    };

    const getRequiredFieldStyle = (value: string | number, isRequired: boolean = true) => {
        const base = 'w-full px-4 py-3 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium bg-slate-50/30 border focus:bg-white focus:outline-none transition-all duration-200 shadow-sm';
        if (!isRequired) return `${base} border-slate-200 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10`;
        const hasValue = typeof value === 'string' ? value.trim().length > 0 : value > 0;
        if (hasValue) return `${base} border-slate-200/80 focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10`;
        return `${base} border-rose-200 focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 bg-rose-50/20 text-rose-900 placeholder:text-rose-300`;
    };

    const renderDateLabels = (dateString: string) => {
        if (!dateString) return null;
        const [year, month, day] = dateString.split('-');
        const thaiYear = parseInt(year) + 543;
        return (
            <div className="mt-1 text-xs text-gray-500 space-y-0.5 md:hidden">
                <p>(ค.ศ.) : {day}/{month}/{year}</p>
                <p>(พ.ศ.) : {day}/{month}/{thaiYear}</p>
            </div>
        );
    };

    const handleMarkCompleted = async (logId: number, months: number, currentNotes: string | undefined) => {
        try {
            const confirm = await Swal.fire({
                title: 'ยืนยันการตรวจสอบ',
                text: `ยืนยันว่าได้ทำการทดสอบรอบ ${months === 0 ? 'Initial' : months + ' Months'} แล้วใช่หรือไม่?`,
                icon: 'question',
                showCancelButton: true,
                confirmButtonText: 'ยืนยัน',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#10b981',
            });

            if (!confirm.isConfirmed) return;

            let selected = [0, 3, 6, 9, 12];
            let completed: number[] = [];

            if (currentNotes) {
                try {
                    const parsed = JSON.parse(currentNotes);
                    if (Array.isArray(parsed)) {
                        selected = parsed;
                    } else if (parsed && typeof parsed === 'object') {
                        selected = parsed.selected || [];
                        completed = parsed.completed || [];
                    }
                } catch { }
            }

            if (!completed.includes(months)) {
                completed.push(months);
            }

            const newNotes = JSON.stringify({ selected, completed });

            const { error } = await supabase
                .from('orders')
                .update({ notes: newNotes })
                .eq('id', logId);

            if (error) throw error;

            Swal.fire({
                icon: 'success',
                title: 'สำเร็จ',
                text: 'บันทึกการตรวจสอบเรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false
            });

            fetchStabilityLogs();
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถบันทึกข้อมูลได้' });
        }
    };

    const handleEditLog = (log: OrderInterface) => {
        setOrderData({
            ...log,
            orderDate: log.orderDate || new Date().toISOString().split('T')[0],
            orderTime: log.orderTime || new Date().toTimeString().split(' ')[0].substring(0, 5),
            orderDateTime: log.orderDateTime || new Date().toISOString(),
            productName: log.productName || '',
            productId: log.productId || '',
            lotNumber: log.lotNumber || '',
            productExp: log.productExp || '',
            productionDate: log.productionDate || '',
            expiryDate: log.expiryDate || '',
        });
        setEditOrderId(log.id || null);
        setIsFormOpen(true);
        setProductSearch(log.productId || '');

        if (log.notes && (log.notes.startsWith('[') || log.notes.startsWith('{'))) {
            try {
                const parsed = JSON.parse(log.notes);
                if (Array.isArray(parsed)) {
                    setSelectedIntervals(parsed);
                    setCompletedIntervals([]);
                    setFeedType('');
                    setRemark('');
                } else if (parsed && typeof parsed === 'object') {
                    setSelectedIntervals(parsed.selected || []);
                    setCompletedIntervals(parsed.completed || []);
                    setFeedType(parsed.feedType || '');
                    setRemark(parsed.remark || '');
                }
            } catch {
                setSelectedIntervals([0, 3, 6, 9, 12]);
                setCompletedIntervals([]);
                setFeedType('');
                setRemark('');
            }
        } else {
            setSelectedIntervals([0, 3, 6, 9, 12]);
            setCompletedIntervals([]);
            setFeedType('');
            setRemark('');
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const handleDeleteLog = async (logId: number) => {
        try {
            const confirm = await Swal.fire({
                title: 'ยืนยันการลบ',
                text: 'คุณต้องการลบรายการนี้ใช่หรือไม่?',
                icon: 'warning',
                showCancelButton: true,
                confirmButtonText: 'ลบข้อมูล',
                cancelButtonText: 'ยกเลิก',
                confirmButtonColor: '#ef4444',
            });

            if (!confirm.isConfirmed) return;

            const { error } = await supabase
                .from('orders')
                .update({
                    is_deleted: true,
                    deleted_by: username,
                    deleted_at: new Date().toISOString()
                })
                .eq('id', logId);

            if (error) throw error;

            const deletedOrder = stabilityLogs.find(log => log.id === logId);
            if (deletedOrder) {
                await logAction('DELETE_STABILITY_FEED', {
                    product_id: deletedOrder.productId,
                    lot_number: deletedOrder.lotNumber,
                    product_name: deletedOrder.productName,
                    deleted_by: username
                });
            }

            Swal.fire({
                icon: 'success',
                title: 'ลบสำเร็จ',
                text: 'ลบรายการนี้เรียบร้อยแล้ว',
                timer: 1500,
                showConfirmButton: false
            });

            fetchStabilityLogs();
        } catch (err) {
            console.error(err);
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถลบข้อมูลได้' });
        }
    };

    const parseNotes = (notesStr: string | undefined | null) => {
        let intervals = [0, 3, 6, 9, 12];
        let completed: number[] = [];
        let feedType = '';
        let remark = '';
        if (notesStr && (notesStr.startsWith('[') || notesStr.startsWith('{'))) {
            try {
                const parsed = JSON.parse(notesStr);
                if (Array.isArray(parsed)) {
                    intervals = parsed;
                } else if (parsed && typeof parsed === 'object') {
                    intervals = parsed.selected || [];
                    completed = parsed.completed || [];
                    feedType = parsed.feedType || '';
                    remark = parsed.remark || '';
                }
            } catch { }
        }
        return { intervals, completed, feedType, remark };
    };

    const filteredLogs = stabilityLogs.filter(log => {
        const search = globalSearch.toLowerCase();
        return (log.productName || '').toLowerCase().includes(search) ||
            (log.lotNumber || '').toLowerCase().includes(search) ||
            (log.productId || '').toLowerCase().includes(search);
    });

    const upcomingTests = filteredLogs.flatMap(log => {
        if (!log.productionDate) return [];

        const { intervals: selected, completed } = parseNotes(log.notes);

        const upcoming: any[] = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        selected.forEach(months => {
            if (completed.includes(months)) return;

            const testDate = new Date(log.productionDate);
            testDate.setMonth(testDate.getMonth() + months);
            testDate.setHours(0, 0, 0, 0);

            const diffDays = Math.ceil((testDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            // แจ้งเตือนล่วงหน้า 1 วัน และเลยกำหนดไปแล้วไม่เกิน 30 วัน
            if (diffDays <= 1 && diffDays >= -30) {
                upcoming.push({
                    ...log,
                    intervalMonths: months,
                    testDate: testDate,
                    diffDays: diffDays
                });
            }
        });

        return upcoming;
    }).sort((a, b) => a.testDate.getTime() - b.testDate.getTime());

    if (isLoading) return <StabilitySkeleton />;


    return (
        <div className="min-h-screen bg-[#f4f7fc] py-6 md:py-8 px-3 md:px-6 flex flex-col items-center gap-8 text-gray-800" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>
            <div className="w-full max-w-2xl md:max-w-3xl bg-white border border-slate-200/80 rounded-2xl md:rounded-3xl shadow-xl shadow-blue-900/5 p-4 md:p-8 relative overflow-hidden transition-all duration-300">
                <div
                    className="flex flex-col items-center cursor-pointer group"
                    onClick={() => setIsFormOpen(!isFormOpen)}
                >
                    <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#0f1e3d] text-white flex items-center justify-center shadow-lg shadow-blue-900/20 mb-3 group-hover:scale-105 transition-transform ${isFormOpen ? 'opacity-100' : 'opacity-80'}`}>
                        <ClipboardCheck className="w-6 h-6" />
                    </div>
                    <h1 className="text-[20px] md:text-[22px] font-black text-[#0f1e3d] text-center tracking-tight flex items-center gap-2 group-hover:text-blue-600 transition-colors">
                        STABILITY FEED KPI
                        <svg className={`w-5 h-5 transition-transform duration-300 ${isFormOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                    </h1>
                    {!isFormOpen && (
                        <p className="text-[11.5px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            คลิกที่นี่เพื่อเพิ่มข้อมูลใหม่
                        </p>
                    )}
                </div>

                {isFormOpen && (
                    <FormWrapper isModal={!!editOrderId} onClose={() => { setIsFormOpen(false); setEditOrderId(null); }}>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                                {/* วันที่และเวลา */}
                                <div className="md:col-span-2">
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">วันที่และเวลาบันทึก (Order Date & Time)</label>
                                    <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-semibold shadow-inner flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                        {formatThaiDateTime()}
                                    </div>
                                </div>



                                {/* เลขลอต */}
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        เลขลอตสินค้า (Lot Number) <span className="text-rose-500 font-bold">*</span>
                                    </label>
                                    <input
                                        type="text"
                                        value={orderData.lotNumber}
                                        onChange={(e) => setOrderData(prev => ({ ...prev, lotNumber: e.target.value }))}
                                        placeholder="ป้อนเลขลอตสินค้า..."
                                        required
                                        className={getRequiredFieldStyle(orderData.lotNumber)}
                                    />
                                </div>

                                {/* รหัสสินค้า — custom dropdown */}
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        รหัสสินค้า (Product ID) <span className="text-rose-500 font-bold">*</span>
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="text"
                                            value={productSearch}
                                            onChange={(e) => {
                                                setProductSearch(e.target.value);
                                                setShowDropdown(true);
                                                if (!e.target.value) {
                                                    setOrderData(prev => ({ ...prev, productId: '', productName: '', productExp: '', expiryDate: '' }));
                                                }
                                            }}
                                            onFocus={() => setShowDropdown(true)}
                                            placeholder="ค้นหาด้วยรหัส หรือชื่อสินค้า..."
                                            required
                                            className={`${getRequiredFieldStyle(orderData.productId)} pr-10`}
                                        />

                                        {/* ปุ่มเคลียร์ */}
                                        {productSearch && (
                                            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
                                                <button type="button" tabIndex={-1}
                                                    onClick={() => {
                                                        setProductSearch('');
                                                        setShowDropdown(false);
                                                        setOrderData(prev => ({ ...prev, productId: '', productName: '', productExp: '', expiryDate: '' }));
                                                    }}
                                                    className="text-gray-400 hover:text-red-500 hover:bg-gray-100 rounded-full p-1 transition-colors">
                                                    <X className="w-4 h-4" />
                                                </button>
                                            </div>
                                        )}

                                        {/* Dropdown */}
                                        {showDropdown && productSearch.length > 0 && (
                                            <div className="absolute z-50 w-full mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-60 overflow-y-auto divide-y divide-slate-100"
                                                onMouseDown={(e) => e.preventDefault()}>
                                                {products
                                                    .filter(p =>
                                                        p.id.toLowerCase().includes(productSearch.toLowerCase()) ||
                                                        p.name.toLowerCase().includes(productSearch.toLowerCase())
                                                    )
                                                    .slice(0, 20)
                                                    .map(product => (
                                                        <button key={product.id} type="button"
                                                            onClick={() => {
                                                                setProductSearch(product.id);
                                                                setShowDropdown(false);
                                                                const hasExp = product.exp && product.exp.trim() !== '';
                                                                setOrderData(prev => ({
                                                                    ...prev,
                                                                    productId: product.id,
                                                                    productName: product.name,
                                                                    productExp: product.exp ?? '',
                                                                    expiryDate: hasExp ? calculateExpiryDate(prev.productionDate, product.exp) : '',
                                                                }));
                                                                if (!hasExp) {
                                                                    Swal.fire({
                                                                        icon: 'warning',
                                                                        title: 'ไม่มีอายุผลิตภัณฑ์',
                                                                        text: `รหัสสินค้า "${product.id}" ไม่มีข้อมูลอายุผลิตภัณฑ์ที่ถูกต้อง กรุณาตรวจสอบข้อมูลใน Product`,
                                                                        confirmButtonText: 'รับทราบ',
                                                                        confirmButtonColor: '#2563eb',
                                                                    });
                                                                }
                                                            }}
                                                            className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors">
                                                            <div className="font-mono font-bold text-blue-600 text-[12.5px]">{product.id}</div>
                                                            <div className="text-[#0f1e3d] font-bold text-[12px] mt-0.5 truncate">{product.name}</div>
                                                        </button>
                                                    ))}
                                                {products.filter(p =>
                                                    p.id.toLowerCase().includes(productSearch.toLowerCase()) ||
                                                    p.name.toLowerCase().includes(productSearch.toLowerCase())
                                                ).length === 0 && (
                                                        <div className="px-4 py-3 text-slate-400 text-[12.5px] text-center font-medium">ไม่พบสินค้า</div>
                                                    )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Overlay ปิด dropdown */}
                                    {showDropdown && (
                                        <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                                    )}
                                </div>

                                {/* ชื่อสินค้า */}
                                {orderData.productName && (
                                    <div className="md:col-span-2">
                                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">ชื่อสินค้า (Product Name)</label>
                                        <input type="text" value={orderData.productName} readOnly
                                            className="w-full px-4 py-3 bg-slate-50/70 border border-slate-200 rounded-xl text-slate-500 text-[13.5px] font-semibold cursor-not-allowed" />
                                    </div>
                                )}



                                {/* วันที่ผลิต */}
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                        วันที่ผลิต (Production Date) <span className="text-rose-500 font-bold">*</span>
                                    </label>
                                    <input
                                        type="date"
                                        value={orderData.productionDate}
                                        onChange={handleProductionDateChange}
                                        onKeyDown={(e) => {
                                            if (e.key !== 'Tab') e.preventDefault();
                                        }}
                                        disabled={!orderData.productId}
                                        required
                                        className={
                                            (!orderData.productId)
                                                ? 'w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner select-none'
                                                : getRequiredFieldStyle(orderData.productionDate)
                                        }
                                    />
                                </div>

                                {/* ประเภทอาหารสัตว์ */}
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">ประเภทอาหารสัตว์ (Feed Type)</label>
                                    <select
                                        value={feedType}
                                        onChange={(e) => setFeedType(e.target.value)}
                                        className="w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all shadow-sm"
                                    >
                                        <option value="">-- เลือกประเภทอาหารสัตว์ --</option>
                                        <option value="พรีมิกส์">พรีมิกส์</option>
                                        <option value="เสริมโปรตีน">เสริมโปรตีน</option>
                                        <option value="เสริมไขมัน">เสริมไขมัน</option>
                                        <option value="สำเร็จรูป">สำเร็จรูป</option>
                                        <option value="นม">นม</option>
                                        <option value="อื่นๆ">อื่นๆ</option>
                                    </select>
                                </div>

                                {/* หมายเหตุ */}
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">หมายเหตุ (Remark)</label>
                                    <input
                                        type="text"
                                        value={remark}
                                        onChange={(e) => setRemark(e.target.value)}
                                        placeholder="ระบุหมายเหตุ (ถ้ามี)"
                                        className="w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all shadow-sm"
                                    />
                                </div>

                                {/* ช่วงเวลา Stability */}
                                {orderData.productionDate && (
                                    <div className="md:col-span-2">
                                        <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">กำหนดทดสอบความคงตัว (Stability Test Schedule)</label>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                            {[
                                                { label: 'วันที่สั่ง (Initial)', months: 0 },
                                                { label: '3 Months', months: 3 },
                                                { label: '6 Months', months: 6 },
                                                { label: '9 Months', months: 9 },
                                                { label: '12 Months', months: 12 },
                                            ].map((interval) => {
                                                const d = new Date(orderData.productionDate);
                                                d.setMonth(d.getMonth() + interval.months);
                                                const dateStr = d.toISOString().split('T')[0];
                                                const [year, month, day] = dateStr.split('-');
                                                const thaiYear = parseInt(year) + 543;
                                                const isSelected = selectedIntervals.includes(interval.months);
                                                return (
                                                    <div
                                                        key={interval.label}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedIntervals(prev => prev.filter(m => m !== interval.months));
                                                            } else {
                                                                setSelectedIntervals(prev => [...prev, interval.months]);
                                                            }
                                                        }}
                                                        className={`p-3 border rounded-xl text-center shadow-sm cursor-pointer transition-all duration-200 select-none relative overflow-hidden ${isSelected
                                                            ? 'bg-emerald-50/50 border-emerald-400 ring-1 ring-emerald-400'
                                                            : 'bg-slate-50 border-slate-200 opacity-60 hover:opacity-100 hover:border-emerald-300'
                                                            }`}
                                                    >
                                                        <div className="absolute top-2 right-2">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 bg-white'}`}>
                                                                {isSelected && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>}
                                                            </div>
                                                        </div>
                                                        <div className={`text-[11.5px] font-bold mb-1.5 ${isSelected ? 'text-emerald-800' : 'text-slate-500'}`}>{interval.label}</div>
                                                        <div className={`text-[13px] font-black ${isSelected ? 'text-emerald-700' : 'text-slate-600'}`}>{day}/{month}/{thaiYear}</div>
                                                        <div className={`text-[10px] font-medium ${isSelected ? 'text-emerald-600/70' : 'text-slate-400'}`}>{day}/{month}/{year}</div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <p className="mt-2 text-[11px] text-slate-500">
                                            💡 คลิกที่กล่องเพื่อเลือก/ยกเลิก ช่วงเวลาที่ต้องการทดสอบสำหรับสินค้านี้
                                        </p>
                                    </div>
                                )}


                                {/* Submit */}
                                <div className="md:col-span-2 pt-4">
                                    <button type="submit"
                                        className="w-full bg-[#0f1e3d] hover:bg-[#152a54] text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-md shadow-blue-900/10 hover:shadow-lg disabled:opacity-40 disabled:hover:bg-[#0f1e3d] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 text-[14px]"
                                        disabled={!orderData.lotNumber || !orderData.productId || !orderData.productExp || !orderData.productionDate || uploading}>
                                        {uploading ? (
                                            <>
                                                <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                                </svg>
                                                กำลังบันทึก...
                                            </>
                                        ) : (
                                            <>
                                                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                </svg>
                                                บันทึกข้อมูล Stability
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </form>
                    </FormWrapper>
                )}
            </div>

            {/* ช่องค้นหา */}
            <div className="w-full max-w-5xl">
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input
                        type="text"
                        placeholder="ค้นหาสินค้า, รหัสสินค้า, หรือ ลอต..."
                        value={globalSearch}
                        onChange={(e) => setGlobalSearch(e.target.value)}
                        className="w-full pl-11 pr-12 py-3.5 bg-white border border-slate-200/80 rounded-xl md:rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all text-[14px] text-slate-700"
                    />
                    {globalSearch && (
                        <button
                            onClick={() => setGlobalSearch('')}
                            className="absolute inset-y-0 right-0 pr-4 flex items-center text-slate-400 hover:text-slate-600 transition-colors"
                            title="ล้างคำค้นหา"
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                            </svg>
                        </button>
                    )}
                </div>
            </div>

            {/* ตารางแจ้งเตือนใกล้ถึงกำหนด */}
            {upcomingTests.length > 0 && (
                <div className="w-full max-w-5xl bg-rose-50/50 rounded-2xl shadow-[0_8px_30px_rgb(225,29,72,0.06)] border border-rose-100 overflow-hidden">
                    <div className="bg-gradient-to-r from-rose-100 to-rose-50 px-6 py-4 border-b border-rose-100 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-rose-200 flex items-center justify-center animate-pulse">
                            <svg className="w-4 h-4 text-rose-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                        </div>
                        <h2 className="text-[16px] font-bold text-rose-900">แจ้งเตือน: ใกล้ครบกำหนดทดสอบความคงตัว (Upcoming Tests)</h2>
                    </div>

                    {/* Mobile View (Cards) */}
                    <div className="lg:hidden flex flex-col gap-4 p-4 bg-rose-50/30">
                        {upcomingTests.map((item, idx) => {
                            const d = item.testDate;
                            const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;
                            const intervalLabel = item.intervalMonths === 0 ? 'Initial (วันที่ผลิต)' : `${item.intervalMonths} Months`;

                            let statusBadge = null;
                            if (item.diffDays < 0) {
                                statusBadge = <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold">เลยกำหนด {Math.abs(item.diffDays)} วัน</span>;
                            } else if (item.diffDays === 0) {
                                statusBadge = <span className="px-2 py-1 bg-rose-500 text-white rounded-md text-[11px] font-bold">ครบกำหนดวันนี้</span>;
                            } else {
                                statusBadge = <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-[11px] font-bold">เหลืออีก {item.diffDays} วัน</span>;
                            }

                            return (
                                <div key={`mobile-upcoming-${item.id}-${item.intervalMonths}-${idx}`} className="bg-white p-4 rounded-xl border border-rose-200 shadow-sm flex flex-col gap-3">
                                    <div className="flex justify-between items-start gap-2">
                                        <div>
                                            <div className="text-[12px] text-slate-500 font-bold mb-1">ล็อต: {item.lotNumber}</div>
                                            <div className="font-semibold text-[#0f1e3d] text-[14px] leading-tight">{item.productName}</div>
                                            <div className="text-[11px] text-slate-400 mt-0.5">{item.productId}</div>
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <div className="text-[11px] font-bold px-2 py-1 bg-rose-100 text-rose-700 rounded-lg">{intervalLabel}</div>
                                            {statusBadge}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between pt-3 border-t border-rose-50 mt-1">
                                        <div className="text-[12px] font-bold text-slate-600">
                                            กำหนด: <span className="text-rose-600">{dateStr}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => handleMarkCompleted(item.id, item.intervalMonths, item.notes)}
                                                className="p-2 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                                title="ยืนยันการตรวจแล้ว"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </button>
                                            <button
                                                onClick={() => handleDeleteLog(item.id)}
                                                className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
                                                title="ลบรายการ"
                                            >
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Desktop View (Table) */}
                    <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-[13px] text-left">
                            <thead className="text-[11px] text-rose-600 uppercase bg-rose-50/80 border-b border-rose-100">
                                <tr>
                                    <th className="px-3 py-3 font-bold">ล็อต (Lot)</th>
                                    <th className="px-3 py-3 font-bold">สินค้า (Product)</th>
                                    <th className="px-3 py-3 font-bold">รอบทดสอบ</th>
                                    <th className="px-3 py-3 font-bold text-center">วันที่กำหนด</th>
                                    <th className="px-3 py-3 font-bold text-center">สถานะ</th>
                                    <th className="px-3 py-3 font-bold text-center">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rose-100">
                                {upcomingTests.map((item, idx) => {
                                    const d = item.testDate;
                                    const dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear() + 543}`;

                                    let statusBadge = null;
                                    if (item.diffDays < 0) {
                                        statusBadge = <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md text-[11px] font-bold">เลยกำหนด {Math.abs(item.diffDays)} วัน</span>;
                                    } else if (item.diffDays === 0) {
                                        statusBadge = <span className="px-2 py-1 bg-rose-500 text-white rounded-md text-[11px] font-bold">ครบกำหนดวันนี้</span>;
                                    } else {
                                        statusBadge = <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-md text-[11px] font-bold">เหลืออีก {item.diffDays} วัน</span>;
                                    }

                                    const intervalLabel = item.intervalMonths === 0 ? 'Initial (วันที่ผลิต)' : `${item.intervalMonths} Months`;

                                    return (
                                        <tr key={`${item.id}-${item.intervalMonths}-${idx}`} className="hover:bg-rose-50 transition-colors bg-white">
                                            <td className="px-3 py-3 font-bold text-slate-800">{item.lotNumber}</td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-slate-800">{item.productName}</div>
                                                <div className="text-[11px] text-slate-500">{item.productId}</div>
                                            </td>
                                            <td className="px-3 py-3 font-medium text-rose-700">{intervalLabel}</td>
                                            <td className="px-3 py-3 text-center font-bold text-slate-700">{dateStr}</td>
                                            <td className="px-3 py-3 text-center">{statusBadge}</td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex items-center justify-center gap-2">
                                                    <button
                                                        onClick={() => handleMarkCompleted(item.id, item.intervalMonths, item.notes)}
                                                        className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200"
                                                        title="ยืนยันการตรวจแล้ว"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteLog(item.id)}
                                                        className="p-1.5 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-lg transition-colors border border-rose-200"
                                                        title="ลบรายการ"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ตารางแสดงประวัติ Stability */}
            <div className="w-full max-w-5xl bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100/60 overflow-hidden">
                <div className="bg-gradient-to-r from-slate-50 to-white px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                        </svg>
                    </div>
                    <h2 className="text-[16px] font-bold text-[#0f1e3d]">รายการข้อมูล Stability (Recent Logs)</h2>
                </div>

                {/* Mobile View (Cards) */}
                <div className="xl:hidden flex flex-col gap-4 p-4 bg-slate-50/50">
                    {filteredLogs.length === 0 ? (
                        <div className="text-center text-slate-400 font-medium py-8 bg-white rounded-xl border border-slate-100">
                            ไม่พบข้อมูล
                        </div>
                    ) : (
                        filteredLogs.map((log) => {
                            const { intervals, completed, feedType, remark } = parseNotes(log.notes);
                            const calculateDate = (months: number) => {
                                if (!log.productionDate) return '-';

                                if (!intervals.includes(months)) return <span className="text-slate-300 font-normal">-</span>;

                                const d = new Date(log.productionDate);
                                d.setMonth(d.getMonth() + months);
                                const dateStr = d.toISOString().split('T')[0];
                                const [year, month, day] = dateStr.split('-');
                                const thaiYear = parseInt(year) + 543;
                                const formattedDate = `${day}/${month}/${thaiYear}`;

                                if (completed.includes(months)) {
                                    return (
                                        <span className="flex items-center gap-1 text-emerald-600 font-bold">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                            {formattedDate}
                                        </span>
                                    );
                                }
                                return <span className="font-medium">{formattedDate}</span>;
                            };

                            return (
                                <div key={`mobile-log-${log.id}`} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col relative">
                                    <div className="absolute top-4 right-4 flex items-center gap-1">
                                        <button onClick={() => handleEditLog(log)} className="p-2 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors" title="แก้ไขรายการ">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                            </svg>
                                        </button>
                                        <button onClick={() => handleDeleteLog(log.id!)} className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors" title="ลบรายการนี้">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                            </svg>
                                        </button>
                                    </div>
                                    <div className="border-b border-slate-100 pb-3 mb-3 pr-10">
                                        <div className="text-[11.5px] font-bold text-slate-500 mb-1.5 flex items-center gap-1.5">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                            {log.createdAt ? `${new Date(log.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })} ${new Date(log.createdAt).toLocaleTimeString('th-TH').slice(0, 5)} น.` : '-'}
                                        </div>
                                        <div className="font-bold text-[#0f1e3d] text-[14.5px] leading-tight mb-1">
                                            {(feedType || remark) && (
                                                <div className="flex flex-wrap gap-1.5 mb-1.5">
                                                    {feedType && (
                                                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 shadow-sm text-[10px] font-medium">
                                                            <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                                            {feedType}
                                                        </div>
                                                    )}
                                                    {remark && (
                                                        <div className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 shadow-sm text-[10px] font-medium">
                                                            <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                                            {remark}
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {log.productName}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2 text-[12px]">
                                            <span className="text-slate-500">{log.productId}</span>
                                            <span className="text-slate-300">|</span>
                                            <span className="font-bold text-blue-600">ลอต: {log.lotNumber}</span>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-[12.5px]">
                                        <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                            <div className="mb-1">
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Initial</span>
                                            </div>
                                            <span className="text-[13px] text-slate-700 font-bold">{calculateDate(0)}</span>
                                        </div>
                                        <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                            <div className="mb-1">
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">3 Months</span>
                                            </div>
                                            <span className="text-[13px] text-slate-700 font-bold">{calculateDate(3)}</span>
                                        </div>
                                        <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                            <div className="mb-1">
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">6 Months</span>
                                            </div>
                                            <span className="text-[13px] text-slate-700 font-bold">{calculateDate(6)}</span>
                                        </div>
                                        <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100">
                                            <div className="mb-1">
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">9 Months</span>
                                            </div>
                                            <span className="text-[13px] text-slate-700 font-bold">{calculateDate(9)}</span>
                                        </div>
                                        <div className="flex flex-col bg-slate-50/80 p-2.5 rounded-xl border border-slate-100 col-span-2">
                                            <div className="mb-1">
                                                <span className="text-[9px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">12 Months</span>
                                            </div>
                                            <span className="text-[13px] text-slate-700 font-bold">{calculateDate(12)}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Desktop View (Table) */}
                <div className="hidden xl:block overflow-x-auto">
                    <table className="w-full text-[13px] text-left">
                        <thead className="text-[11px] text-slate-500 uppercase bg-slate-50/50 border-b border-slate-200">
                            <tr>
                                <th className="px-3 py-3 font-bold">วันที่บันทึก (Recorded)</th>
                                <th className="px-3 py-3 font-bold">ล็อต (Lot)</th>
                                <th className="px-3 py-3 font-bold max-w-[200px]">สินค้า (Product)</th>
                                <th className="px-3 py-3 font-bold text-center">Initial (วันที่ผลิต)</th>
                                <th className="px-3 py-3 font-bold text-center">3 Months</th>
                                <th className="px-3 py-3 font-bold text-center">6 Months</th>
                                <th className="px-3 py-3 font-bold text-center">9 Months</th>
                                <th className="px-3 py-3 font-bold text-center">12 Months</th>
                                <th className="px-3 py-3 font-bold text-center">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan={9} className="px-6 py-12 text-center text-slate-400 font-medium bg-slate-50/30">
                                        ไม่พบข้อมูล
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.map((log) => {
                                    const { intervals, completed, feedType, remark } = parseNotes(log.notes);
                                    const calculateDate = (months: number) => {
                                        if (!log.productionDate) return '-';

                                        if (!intervals.includes(months)) return <span className="text-slate-300 font-normal">-</span>;

                                        const d = new Date(log.productionDate);
                                        d.setMonth(d.getMonth() + months);
                                        const dateStr = d.toISOString().split('T')[0];
                                        const [year, month, day] = dateStr.split('-');
                                        const thaiYear = parseInt(year) + 543;
                                        const formattedDate = `${day}/${month}/${thaiYear}`;

                                        if (completed.includes(months)) {
                                            return (
                                                <span className="flex items-center justify-center gap-1 text-emerald-600 bg-emerald-50 py-1 px-2 rounded-lg font-bold">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" /></svg>
                                                    {formattedDate}
                                                </span>
                                            );
                                        }
                                        return formattedDate;
                                    };

                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50/80 transition-colors group">
                                            <td className="px-3 py-3 whitespace-nowrap">
                                                <div className="font-semibold text-slate-700">
                                                    {log.createdAt ? new Date(log.createdAt).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-'}
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                    </svg>
                                                    {log.createdAt ? new Date(log.createdAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) + ' น.' : '-'}
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 font-bold text-[#0f1e3d] whitespace-nowrap">{log.lotNumber}</td>
                                            <td className="px-3 py-3">
                                                <div className="font-semibold text-[#0f1e3d]">
                                                    {(feedType || remark) && (
                                                        <div className="flex flex-wrap gap-1.5 mb-1">
                                                            {feedType && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/60 text-[10.5px] font-medium">
                                                                    <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                                                                    {feedType}
                                                                </span>
                                                            )}
                                                            {remark && (
                                                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200 text-[10.5px] font-medium">
                                                                    <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>
                                                                    {remark}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                    {log.productName}
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex flex-wrap gap-x-3 gap-y-1 mt-0.5">
                                                    <span>{log.productId}</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-center font-medium text-emerald-700 bg-emerald-50/30">{calculateDate(0)}</td>
                                            <td className="px-3 py-3 text-center font-medium text-emerald-700">{calculateDate(3)}</td>
                                            <td className="px-3 py-3 text-center font-medium text-emerald-700 bg-emerald-50/30">{calculateDate(6)}</td>
                                            <td className="px-3 py-3 text-center font-medium text-emerald-700">{calculateDate(9)}</td>
                                            <td className="px-3 py-3 text-center font-medium text-emerald-700 bg-emerald-50/30">{calculateDate(12)}</td>
                                            <td className="px-3 py-3 text-center">
                                                <div className="flex items-center justify-center gap-1">
                                                    <button
                                                        onClick={() => handleEditLog(log)}
                                                        className="p-1.5 text-slate-400 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors"
                                                        title="แก้ไขรายการ"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                        </svg>
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteLog(log.id!)}
                                                        className="p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 rounded-lg transition-colors"
                                                        title="ลบรายการนี้"
                                                    >
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                        </svg>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}