'use client';

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { logAction } from '@/lib/logger';
import { ImagePlus, X } from 'lucide-react';

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

export default function OrderPage() {
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

    // ✅ useEffect เดียว ไม่มี setState โดยตรง
    useEffect(() => {
        fetchUserInfo();
        fetchProducts();
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
        if (!orderData.productId || !orderData.productExp) return;

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

            let imageHtml = '';
            if (imagePreview) {
                imageHtml = `
                <div style="margin-top:12px; display:flex; justify-content:center;">
                    <div style="text-align:center;">
                        <div style="font-size:12px; color:#6b7280; margin-bottom:2px;">📷 ภาพตัวอย่างฉลาก</div>
                        <img src="${imagePreview}" alt="ตัวอย่างฉลาก"
                             style="max-width:100%; max-height:160px; object-fit:contain; border-radius:8px; border:1px solid #ddd;" />
                    </div>
                </div>
            `;
            }

            const confirm = await Swal.fire({
                icon: 'question',
                title: 'ยืนยันการบันทึก?',
                html: `
                <div style="font-family: sans-serif;">
                    <table style="width:100%; border-collapse:collapse; font-size:13px; margin:auto;">
                        <tr><td style="padding:4px 6px; color:#4b5563;">📦 ประเภท</td><td style="padding:4px 6px; font-weight:600;">${orderData.orderType}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">🔢 เลขลอต</td><td style="padding:4px 6px; font-weight:600;">${orderData.lotNumber}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">🏷️ รหัสสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productId}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📝 ชื่อสินค้า</td><td style="padding:4px 6px; font-weight:600;">${orderData.productName}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">🔢 จำนวน</td><td style="padding:4px 6px; font-weight:600;">${orderData.quantity}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📅 วันที่ผลิต</td><td style="padding:4px 6px; font-weight:600;">${orderData.productionDate}</td></tr>
                        <tr><td style="padding:4px 6px; color:#4b5563;">📅 วันหมดอายุ</td><td style="padding:4px 6px; font-weight:600;">${orderData.expiryDate}</td></tr>
                        <tr style="background:#f9fafb;"><td style="padding:4px 6px; color:#4b5563;">📋 หมายเหตุ</td><td style="padding:4px 6px; font-weight:600;">${orderData.notes || '-'}</td></tr>
                    </table>
                    ${imageHtml}
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
                const requiredFields = ['lotNumber', 'productId', 'productionDate', 'quantity'];
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

                let imageUrl: string | null = null;
                if (imageFile) {
                    if (!imageFile.type.startsWith('image/')) throw new Error('ไฟล์ที่เลือกไม่ใช่รูปภาพ');

                    const fileExt = imageFile.name.split('.').pop() || 'jpg';
                    const rawName = orderData.productName?.trim() || '';
                    const hasThai = /[ก-๙]/.test(rawName);

                    let safeName: string;
                    if (hasThai || !rawName) {
                        const rawId = orderData.productId?.trim() || 'unknown-product';
                        safeName = rawId.replace(/[^a-zA-Z0-9\-_]/g, '_').substring(0, 50);
                    } else {
                        safeName = rawName.replace(/[^a-zA-Z0-9\-_]/g, '_').replace(/_+/g, '_').substring(0, 50);
                    }

                    const now = new Date();
                    const dateStr = now.toISOString().replace(/[-:T]/g, '').slice(0, 15);
                    const fileName = `${safeName}_${dateStr}.${fileExt}`;
                    const filePath = `labels/${fileName}`;

                    const { error: uploadError } = await supabase.storage.from('order-images').upload(filePath, imageFile);
                    if (uploadError) throw new Error(`อัปโหลดรูปภาพไม่สำเร็จ: ${uploadError.message}`);

                    const { data: urlData } = supabase.storage.from('order-images').getPublicUrl(filePath);
                    imageUrl = urlData.publicUrl;
                }

                const { error } = await supabase.from('orders').insert({
                    order_date: orderData.orderDate,
                    order_time: orderData.orderTime,
                    order_datetime: orderData.orderDateTime,
                    order_type: orderData.orderType,
                    lot_number: orderData.lotNumber,
                    product_id: orderData.productId,
                    product_name: orderData.productName,
                    product_exp: orderData.productExp,
                    production_date: orderData.productionDate,
                    expiry_date: orderData.expiryDate,
                    quantity: orderData.quantity,
                    notes: orderData.notes || '-',
                    created_by: username,
                    created_by_department: department || 'ไม่ระบุหน่วยงาน',
                    is_verified: false,
                    verified_by: null,
                    verified_at: null,
                    image_url: imageUrl
                }).select('id');

                if (error) throw new Error(error.message);

                await logAction('CREATE_ORDER', {
                    product_id: orderData.productId,
                    lot_number: orderData.lotNumber,
                    quantity: orderData.quantity
                });

                Swal.fire({ icon: 'success', title: 'บันทึกสำเร็จ', text: 'บันทึกคำสั่งพิมพ์ชิ้นงานสำเร็จแล้ว' });

                // Reset form
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

        return (
            <div className="min-h-screen bg-[#f4f7fc] py-4 md:py-8 px-0 md:px-4 flex justify-center items-start text-gray-800" style={{
                backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
            }}>
                <div className="w-full max-w-2xl md:max-w-3xl bg-white border border-slate-200/80 rounded-2xl md:rounded-3xl shadow-xl shadow-blue-900/5 p-4 md:p-8 relative overflow-hidden">
                    <div className="flex flex-col items-center mb-8">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#1e3a8a] to-[#0f1e3d] text-white flex items-center justify-center shadow-lg shadow-blue-900/20 mb-3">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                            </svg>
                        </div>
                        <h1 className="text-[20px] md:text-[22px] font-black text-[#0f1e3d] text-center tracking-tight">
                            สร้างคำสั่งชิ้นงานใหม่
                        </h1>
                        <p className="text-[11.5px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                            Create New Production Order
                        </p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                            {/* วันที่และเวลา */}
                            <div className="md:col-span-2">
                                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">วันที่และเวลาสั่ง (Order Date & Time)</label>
                                <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-semibold shadow-inner flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    {formatThaiDateTime()}
                                </div>
                            </div>

                            {/* ประเภทคำสั่ง */}
                            <div className="md:col-span-2">
                                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-3">ประเภทคำสั่ง (Order Type)</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <label className={`flex cursor-pointer items-center justify-center gap-2 py-3.5 px-4 border rounded-xl font-bold text-[13px] transition-all duration-300 ${orderData.orderType === 'พิมพ์ฉลาก' ? 'bg-[#0f1e3d] text-white border-[#0f1e3d] shadow-md shadow-blue-900/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50 hover:text-slate-700'}`}>
                                        <input type="radio" name="orderType" value="พิมพ์ฉลาก"
                                            checked={orderData.orderType === 'พิมพ์ฉลาก'}
                                            onChange={(e) => setOrderData(prev => ({ ...prev, orderType: e.target.value }))}
                                            className="hidden" />
                                        🖨️ พิมพ์ฉลาก (Label Print)
                                    </label>
                                    <label className={`flex cursor-pointer items-center justify-center gap-2 py-3.5 px-4 border rounded-xl font-bold text-[13px] transition-all duration-300 ${orderData.orderType === 'ปั๊มถุง' ? 'bg-indigo-950 text-white border-indigo-950 shadow-md shadow-indigo-900/10' : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100/50 hover:text-slate-700'}`}>
                                        <input type="radio" name="orderType" value="ปั๊มถุง"
                                            checked={orderData.orderType === 'ปั๊มถุง'}
                                            onChange={(e) => setOrderData(prev => ({ ...prev, orderType: e.target.value }))}
                                            className="hidden" />
                                        🔖 ปั๊มถุง (Bag Stamp)
                                    </label>
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

                            {/* อายุผลิตภัณฑ์ */}
                            {orderData.productExp && (
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">อายุผลิตภัณฑ์ (Shelf Life)</label>
                                    <input type="text" value={`${orderData.productExp} เดือน`} readOnly
                                        className="w-full px-4 py-3 bg-emerald-50 border border-emerald-200/60 rounded-xl text-emerald-700 text-[13.5px] font-bold cursor-not-allowed" />
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
                                    disabled={!orderData.productId || !orderData.productExp}
                                    required
                                    className={
                                        (!orderData.productId || !orderData.productExp)
                                            ? 'w-full px-4 py-3 rounded-xl text-[13.5px] font-medium border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed shadow-inner select-none'
                                            : getRequiredFieldStyle(orderData.productionDate)
                                    }
                                />
                                {(!orderData.productId || !orderData.productExp) && (
                                    <p className="mt-1.5 text-[11.5px] text-amber-500 font-semibold flex items-center gap-1">
                                        ⚠️ กรุณาเลือกรหัสสินค้าที่มีอายุผลิตภัณฑ์ก่อน
                                    </p>
                                )}
                                {renderDateLabels(orderData.productionDate)}
                            </div>

                            {/* วันหมดอายุ */}
                            {orderData.expiryDate && (
                                <div>
                                    <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">วันหมดอายุ (Calculated Expiry Date)</label>
                                    <input type="date" value={orderData.expiryDate} readOnly
                                        className="w-full px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-700 text-[13.5px] font-bold cursor-not-allowed shadow-inner" />
                                    {renderDateLabels(orderData.expiryDate)}
                                </div>
                            )}

                            {/* จำนวน */}
                            <div>
                                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    จำนวนสั่งทำ (Quantity) <span className="text-rose-500 font-bold">*</span>
                                </label>
                                <input type="number"
                                    value={orderData.quantity || ''}
                                    onChange={(e) => setOrderData(prev => ({ ...prev, quantity: Math.max(1, parseInt(e.target.value) || 1) }))}
                                    onWheel={(e) => e.currentTarget.blur()}
                                    placeholder="กรอกจำนวนที่ต้องการสั่งผลิต..." min="1" required
                                    className={`${getRequiredFieldStyle(orderData.quantity)} [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                />
                            </div>

                            {/* หมายเหตุ */}
                            <div className="md:col-span-2">
                                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">หมายเหตุ (Notes)</label>
                                <textarea value={orderData.notes || ''}
                                    onChange={(e) => setOrderData(prev => ({ ...prev, notes: e.target.value }))}
                                    placeholder="กรอกรายละเอียดเพิ่มเติมหรือหมายเหตุพิเศษ..." rows={3}
                                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-200 rounded-xl text-[#0f1e3d] text-[13.5px] font-medium focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 resize-none shadow-sm"
                                />
                            </div>

                            {/* Image Upload */}
                            <div className="md:col-span-2">
                                <label className="block text-[12px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                                    📷 ภาพตัวอย่างฉลาก (Label Image Proof) <span className="text-slate-400 font-normal lowercase">(optional, max 2 MB)</span>
                                </label>
                                <input ref={fileInputRef} type="file" accept="image/*"
                                    onChange={handleImageChange} className="hidden" id="label-image-input" />
                                {!imagePreview ? (
                                    <label htmlFor="label-image-input"
                                        className="flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-slate-200 rounded-2xl cursor-pointer hover:border-blue-400 hover:bg-blue-50/20 transition-all duration-300 group bg-slate-50/30">
                                        <div className="w-12 h-12 rounded-xl bg-white shadow-sm flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:shadow-md transition-all duration-300 mb-3 border border-slate-100">
                                            <ImagePlus className="w-6 h-6" />
                                        </div>
                                        <span className="text-[13px] font-bold text-slate-500 group-hover:text-blue-600 transition-colors">อัปโหลดภาพตัวอย่างฉลาก</span>
                                        <span className="text-[11px] text-slate-400 font-medium mt-1">JPG, PNG, WEBP (สูงสุด 2 MB)</span>
                                    </label>
                                ) : (
                                    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-200 shadow-sm bg-slate-50">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={imagePreview} alt="ตัวอย่างฉลาก"
                                            className="w-full max-h-60 object-contain mx-auto" />
                                        <button type="button" onClick={removeImage}
                                            className="absolute top-2.5 right-2.5 bg-red-500 hover:bg-red-600 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-colors active:scale-95"
                                            title="ลบรูปภาพ">
                                            <X className="w-4 h-4" />
                                        </button>
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm text-white text-[11.5px] py-2 px-3 text-center truncate">
                                            {imageFile?.name}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Submit */}
                            <div className="md:col-span-2 pt-4">
                                <button type="submit"
                                    className="w-full bg-[#0f1e3d] hover:bg-[#152a54] text-white font-bold py-4 px-6 rounded-xl transition-all duration-300 shadow-md shadow-blue-900/10 hover:shadow-lg disabled:opacity-40 disabled:hover:bg-[#0f1e3d] disabled:cursor-not-allowed disabled:shadow-none flex items-center justify-center gap-2 text-[14px]"
                                    disabled={!orderData.lotNumber || !orderData.productId || !orderData.productExp || !orderData.productionDate || !orderData.quantity || uploading}>
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
                                            บันทึกคำสั่ง{orderData.orderType}
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        );
    }