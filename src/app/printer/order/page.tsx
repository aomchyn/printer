'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';

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
    id: string; // e.g. FG-1001
    name: string;
    exp: string;
}

export default function OrderPage() {
    const [orderData, setOrderData] = useState<OrderInterface>({
        orderDate: '',
        orderTime: '',
        orderDateTime: '',
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

    const [products, setProducts] = useState<FgcodeInterface[]>([]);
    const [username, setUsername] = useState('Unknown User');
    const [department, setDepartment] = useState('');

    useEffect(() => {
        fetchUserInfo();
        fetchProducts();

        const today = new Date().toISOString().split('T')[0];
        setOrderData(prev => ({ ...prev, orderDate: today }));
    }, []);

    const fetchUserInfo = async () => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session) {
                const { data } = await supabase.from('users').select('name, department').eq('id', session.user.id).single();
                if (data?.name) {
                    setUsername(data.name);
                }
                if (data?.department) {
                    setDepartment(data.department);
                }
            }
        } catch (error) {
            console.error('Error fetching user info:', error);
        }
    };

    const fetchProducts = async () => {
        try {
            const { data, error } = await supabase.from('fgcode').select('*');
            if (error) throw error;
            if (data) {
                setProducts(data);
            }
        } catch (err) {
            console.error('เกิดข้อผิดพลาดในการดึงข้อมูลสินค้า:', err);
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
        } catch (err) {
            console.error('เกิดข้อผิดพลาดในการคำนวณวันหมดอายุ:', err);
            return '';
        }
    };

    const handleProductCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const code = e.target.value;
        const product = products.find(p => p.id === code);

        if (product) {
            setOrderData(prev => ({
                ...prev,
                productId: code,
                productName: product.name,
                productExp: product.exp,
                expiryDate: calculateExpiryDate(prev.productionDate, product.exp),
            }));
        } else {
            setOrderData(prev => ({
                ...prev,
                productId: code,
                productName: '',
                productExp: '',
                expiryDate: '',
            }));
        }
    };

    const handleProductionDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const mfgDate = e.target.value;
        setOrderData(prev => ({
            ...prev,
            productionDate: mfgDate,
            expiryDate: calculateExpiryDate(mfgDate, prev.productExp),
        }));
    };

    useEffect(() => {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const currentTime = now.toTimeString().split(' ')[0].substring(0, 5);

        setOrderData(prev => ({
            ...prev,
            orderDate: today,
            orderTime: currentTime,
            orderDateTime: now.toISOString()
        }));
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            const requiredFields = ['lotNumber', 'productId', 'productionDate', 'quantity'];
            const missingFields = requiredFields.filter(field => !orderData[field as keyof OrderInterface]);

            if (missingFields.length > 0) {
                alert(`กรุณากรอกข้อมูลให้ครบถ้วน: ${missingFields.join(', ')}`);
                return;
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
                verified_at: null
            }).select('id');

            if (error) throw new Error(error.message);

            Swal.fire({
                icon: 'success',
                title: 'บันทึกสำเร็จ',
                text: `บันทึกคำสั่งพิมพ์ชิ้นงานสำเร็จแล้ว`
            });

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
        } catch (error) {
            const errorObj = error as Error;
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: errorObj.message || 'กรุณาลองใหม่อีกครั้ง'
            });
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

    return (
        <div className="flex justify-center py-6 text-gray-800">
            <div className="w-full max-w-2xl bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-8 border border-white/20">
                <h1 className="text-3xl font-bold mb-8 text-center text-blue-700 tracking-tight">
                    📦 ฟอร์มสั่งฉลากสินค้า
                </h1>

                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            วันที่และเวลาสั่ง
                        </label>
                        <div className="w-full px-4 py-3 bg-blue-50/50 border border-blue-200 rounded-lg text-gray-800 font-medium shadow-inner">
                            {formatThaiDateTime()}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-3">
                            ประเภทคำสั่ง
                        </label>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-medium transition-all ${orderData.orderType === 'พิมพ์ฉลาก' ? 'bg-blue-600 text-white border-blue-600 shadow-md ring-2 ring-blue-600/20' : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100 hover:border-blue-400'}`}>
                                <input
                                    type="radio"
                                    name="orderType"
                                    value="พิมพ์ฉลาก"
                                    checked={orderData.orderType === 'พิมพ์ฉลาก'}
                                    onChange={(e) => setOrderData(prev => ({ ...prev, orderType: e.target.value }))}
                                    className="hidden"
                                />
                                🖨️ พิมพ์ฉลาก
                            </label>
                            <label className={`flex-1 flex cursor-pointer items-center justify-center py-3 px-4 border rounded-xl font-medium transition-all ${orderData.orderType === 'ปั๊มถุง' ? 'bg-purple-600 text-white border-purple-600 shadow-md ring-2 ring-purple-600/20' : 'bg-gray-50 text-gray-600 border-gray-300 hover:bg-gray-100 hover:border-purple-400'}`}>
                                <input
                                    type="radio"
                                    name="orderType"
                                    value="ปั๊มถุง"
                                    checked={orderData.orderType === 'ปั๊มถุง'}
                                    onChange={(e) => setOrderData(prev => ({ ...prev, orderType: e.target.value }))}
                                    className="hidden"
                                />
                                🛍️ ปั๊มถุง
                            </label>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            เลขลอตสินค้า
                        </label>
                        <input
                            type="text"
                            value={orderData.lotNumber}
                            onChange={(e) => setOrderData(prev => ({ ...prev, lotNumber: e.target.value }))}
                            placeholder='ป้อนเลขลอต'
                            required
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            รหัสสินค้า
                        </label>
                        <input
                            type="text"
                            list="product-list"
                            value={orderData.productId}
                            onChange={handleProductCodeChange}
                            placeholder="ป้อนรหัสสินค้า"
                            required
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
                        />
                        <datalist id="product-list">
                            {products.map(product => (
                                <option key={product.id} value={product.id}>
                                    {product.name}
                                </option>
                            ))}
                        </datalist>
                    </div>

                    {orderData.productName && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">ชื่อสินค้า</label>
                            <input
                                type="text"
                                value={orderData.productName}
                                readOnly
                                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600"
                            />
                        </div>
                    )}

                    {orderData.productExp && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">อายุผลิตภัณฑ์</label>
                            <input
                                type="text"
                                value={orderData.productExp}
                                readOnly
                                className="w-full px-4 py-3 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-800 font-medium"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            วันที่ผลิต
                        </label>
                        <input
                            type="date"
                            value={orderData.productionDate}
                            onChange={handleProductionDateChange}
                            required
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
                        />
                    </div>

                    {orderData.expiryDate && (
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                วันหมดอายุ (คำนวณอัตโนมัติ)
                            </label>
                            <input
                                type="date"
                                value={orderData.expiryDate}
                                readOnly
                                className="w-full px-4 py-3 bg-green-50 border border-green-300 rounded-lg text-green-800 font-medium shadow-inner"
                            />
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-2">
                            จำนวน
                        </label>
                        <input
                            type="number"
                            value={orderData.quantity || ''}
                            onChange={(e) => setOrderData(prev => ({
                                ...prev,
                                quantity: Math.max(1, parseInt(e.target.value) || 1)
                            }))}
                            placeholder="กรอกจำนวนที่ต้องการสั่ง"
                            min="1"
                            required
                            className="w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition shadow-sm"
                        />
                    </div>

                    <div>
                        <label className='block text-sm font-semibold text-gray-700 mb-2'>
                            หมายเหตุ
                        </label>
                        <textarea
                            value={orderData.notes || ''}
                            onChange={(e) => setOrderData(prev => ({ ...prev, notes: e.target.value }))}
                            placeholder='กรอกรายละเอียดเพิ่มเติมหรือหมายเหตุ'
                            rows={3}
                            className='w-full px-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none shadow-sm'
                        />
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            className="w-full bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-semibold py-4 px-6 rounded-lg hover:from-blue-700 hover:to-indigo-800 transform transition duration-200 hover:scale-[1.02] shadow-lg disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-center gap-2"
                            disabled={!orderData.lotNumber || !orderData.productId || !orderData.productionDate || !orderData.quantity}
                        >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                            </svg>
                            บันทึกคำสั่ง{orderData.orderType}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
