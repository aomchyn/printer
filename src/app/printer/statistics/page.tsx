'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import html2canvas from 'html2canvas-pro';
import { jsPDF } from 'jspdf';

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

export default function StatisticsPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [isLoading, setIsLoading] = useState(false);
    const [isExporting, setIsExporting] = useState(false);

    // We only need basic auth check
    const router = useRouter();

    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.push('/login');
                return;
            }

            // Route Protection: "User" role is not allowed on Statistics page
            const { data } = await supabase.from('users').select('role').eq('id', session.user.id).single();
            if (data?.role === 'user') {
                Swal.fire({
                    icon: 'error',
                    title: 'ไม่มีสิทธิ์เข้าถึง',
                    text: 'บทบาทของคุณไม่สามารถเข้าถึงหน้าสถิติย้อนหลังได้ เด้งกลับไปยังหน้าต่างหลัก',
                    timer: 3000,
                    showConfirmButton: false
                });
                router.push('/printer/dashboard');
            }
        };
        checkAuth();
    }, [router]);

    useEffect(() => {
        loadHistoricalOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, selectedYear]);

    const loadHistoricalOrders = async () => {
        setIsLoading(true);
        try {
            // Calculate start and end of the selected month
            const startOfMonth = new Date(selectedYear, selectedMonth, 1);
            const endOfMonth = new Date(selectedYear, selectedMonth + 1, 0, 23, 59, 59, 999);

            const startIso = startOfMonth.toISOString();
            const endIso = endOfMonth.toISOString();

            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .gte('created_at', startIso)
                .lte('created_at', endIso)
                .order('created_at', { ascending: false });

            if (error) throw error;
            if (data) {
                setOrders(data as OrderInterface[]);
            }
        } catch (error) {
            console.error('Error loading historical orders:', error);
            Swal.fire({
                icon: 'error',
                title: 'โหลดข้อมูลไม่สำเร็จ',
                text: 'กรุณาลองใหม่อีกครั้ง'
            });
        } finally {
            setIsLoading(false);
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

    // Generate years for dropdown (e.g. from 2024 to current year)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 2024 + 1 }, (_, i) => currentYear - i);

    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

    const exportPDF = async () => {
        const input = document.getElementById('statistics-content');
        if (!input) return;

        setIsExporting(true);
        try {
            Swal.fire({
                title: 'กำลังสร้างไฟล์ PDF...',
                text: 'กรุณารอสักครู่',
                allowOutsideClick: false,
                didOpen: () => {
                    Swal.showLoading();
                }
            });

            await new Promise(resolve => setTimeout(resolve, 300));

            const canvas = await html2canvas(input, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);

            // English month names for safer filename compatibility
            const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            pdf.save(`printer-statistics-${monthNamesEn[selectedMonth]}-${selectedYear}.pdf`);

            Swal.close();
        } catch (error) {
            console.error('Error generating PDF:', error);
            Swal.fire({
                icon: 'error',
                title: 'เกิดข้อผิดพลาด',
                text: `ไม่สามารถสร้างไฟล์ PDF ได้: ${error instanceof Error ? error.message : String(error)}`
            });
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className="text-gray-800">
            <div className="bg-white/95 backdrop-blur-xl rounded-2xl shadow-xl p-6 md:p-8 mb-8 border border-white/20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-800 mb-2 gradient-title tracking-tight pt-2 leading-relaxed">
                            📈 ประวัติสถิติย้อนหลัง
                        </h1>
                        <p className="text-gray-600">
                            ดูข้อมูลสรุปยอดการสั่งพิมพ์ฉลากย้อนหลังแบบรายเดือน
                        </p>
                    </div>

                    <div className="flex bg-white rounded-xl shadow-sm border border-gray-200 p-2 gap-2 w-full md:w-auto">
                        <select
                            value={selectedMonth}
                            onChange={(e) => setSelectedMonth(Number(e.target.value))}
                            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-semibold"
                        >
                            {months.map((m, index) => (
                                <option key={index} value={index}>{m}</option>
                            ))}
                        </select>

                        <select
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-gray-50 border border-gray-200 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block w-full p-2.5 font-semibold"
                        >
                            {years.map(y => (
                                <option key={y} value={y}>{y}</option>
                            ))}
                        </select>

                        <button
                            onClick={exportPDF}
                            disabled={isExporting || orders.length === 0}
                            className={`flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm w-full md:w-auto mt-2 md:mt-0
                                ${isExporting || orders.length === 0
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white hover:shadow-md hover:-translate-y-0.5'
                                }`}
                        >
                            {isExporting ? (
                                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-500"></div>
                            ) : (
                                <Download size={20} />
                            )}
                            <span className="whitespace-nowrap">{isExporting ? 'กำลังสร้าง...' : 'Export'}</span>
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                ) : (
                    <div id="statistics-content" className="w-full bg-transparent p-4 -m-4 rounded-2xl">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl border border-blue-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                <p className="text-sm font-semibold text-blue-800/70 mb-1 tracking-wider relative z-10">คำสั่งทั้งหมด (เดือนที่เลือก)</p>
                                <p className="text-5xl font-extrabold text-blue-600 relative z-10">
                                    {orders.length}
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-6 rounded-2xl border border-green-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-green-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                <p className="text-sm font-semibold text-green-800/70 mb-1 tracking-wider relative z-10">จำนวนหน่วยงานที่สั่ง</p>
                                <p className="text-5xl font-extrabold text-green-600 relative z-10">{chartData.length}</p>
                            </div>
                            <div className="bg-gradient-to-br from-orange-50 to-amber-50 p-6 rounded-2xl border border-orange-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-orange-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                <p className="text-sm font-semibold text-orange-800/70 mb-1 tracking-wider relative z-10">หน่วยงานที่สั่งมากที่สุด</p>
                                <p className="text-3xl font-extrabold text-orange-600 truncate relative z-10">{chartData.length > 0 ? chartData[0]?.name : '-'}</p>
                                <p className="text-sm font-medium text-orange-700/80 mt-1 relative z-10">
                                    {chartData.length > 0 ? `(${chartData[0]?.count || 0} คำสั่ง)` : 'ไม่มีข้อมูล'}
                                </p>
                            </div>
                        </div>

                        {chartData.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                        <i className="fas fa-chart-bar text-blue-500"></i> ยอดการสั่งแบ่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
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
                                        <i className="fas fa-chart-pie text-purple-500"></i> สัดส่วนการสั่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
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
                        ) : (
                            <div className="bg-gray-50 rounded-2xl p-12 text-center border border-gray-200 border-dashed">
                                <div className="text-5xl mb-4 opacity-30">📁</div>
                                <h2 className="text-xl font-semibold text-gray-500">
                                    ไม่มีข้อมูลคำสั่งพิมพ์ฉลากในเดือน {months[selectedMonth]} {selectedYear}
                                </h2>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
