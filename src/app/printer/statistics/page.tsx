'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Swal from 'sweetalert2';
import { useRouter } from 'next/navigation';
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import ExcelJS from 'exceljs';
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
    order_type?:string;
    is_verified: boolean;
    is_cancelled?: boolean;
    verified_by?: string | null;
    verified_at?: string | null;
    created_at: string;
}

export default function StatisticsPage() {
    const [orders, setOrders] = useState<OrderInterface[]>([]);
    const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
    const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
    const [isLoading, setIsLoading] = useState(false);
    

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

    

    const getQuantityChartData = () => {
    const departmentQty: { [key: string]: number } = {};

    orders.forEach(order => {
        const dept = order.created_by_department || 'ไม่ระบุหน่วยงาน';
        departmentQty[dept] = (departmentQty[dept] || 0) + (order.quantity || 0);
    });

    return Object.entries(departmentQty)
        .map(([name, total]) => ({ name, total }))
        .sort((a, b) => b.total - a.total);
};

const quantityChartData = getQuantityChartData();
const totalQuantity = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);

const getCancelChartData = () => {
    const cancelledOrders = orders.filter(o => o.is_cancelled);

    const deptCancel: { [key: string]: number } = {};
    cancelledOrders.forEach(order => {
        const dept = order.created_by_department || 'ไม่ระบุหน่วยงาน';
        deptCancel[dept] = (deptCancel[dept] || 0) + 1;
    });

    return Object.entries(deptCancel)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
};

const cancelChartData = getCancelChartData();
const totalCancelled = orders.filter(o => o.is_cancelled).length;
const cancelRate = orders.length > 0 ? ((totalCancelled / orders.length) * 100).toFixed(1) : '0';

    const chartData = getChartData();
    const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82ca9d', '#ffc658'];

    // Generate years for dropdown (e.g. from 2024 to current year)
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 2024 + 1 }, (_, i) => currentYear - i);

    const months = [
        "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
        "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
    ];

   const exportExcel = async () => {
    if (orders.length === 0) return;

    // ✅ inline แทนการเรียก getQuantityChartData()
    const deptQty: { [key: string]: number } = {};
    orders.forEach(order => {
        const dept = order.created_by_department || 'ไม่ระบุหน่วยงาน';
        deptQty[dept] = (deptQty[dept] || 0) + (order.quantity || 0);
    });
    const quantityChartData = Object.entries(deptQty)
        .map(([name, total]) => ({ name, value: total }))
        .sort((a, b) => b.value - a.value);

    const totalQuantity = orders.reduce((sum, o) => sum + (o.quantity || 0), 0);
    const monthNamesEn = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const wb = new ExcelJS.Workbook();
    

    // ✅ Sheet 1 — รายการคำสั่งพิมพ์ทั้งหมด (เหมือนเดิม)
    const ws1 = wb.addWorksheet('รายการคำสั่งพิมพ์');
    ws1.columns = [
        { header: 'ลำดับ',          key: 'no',          width: 6  },
        { header: 'วันที่สั่ง',      key: 'date',        width: 14 },
        { header: 'เวลาสั่ง',        key: 'time',        width: 10 },
        { header: 'ประเภทคำสั่ง',    key:'order_type',    width:16},
        { header: 'เลขลอต',          key: 'lot',         width: 16 },
        { header: 'รหัสสินค้า',      key: 'product_id',  width: 14 },
        { header: 'ชื่อสินค้า',      key: 'product_name',width: 30 },
        { header: 'จำนวน',           key: 'quantity',    width: 8  },
        { header: 'วันที่ผลิต',      key: 'mfg',         width: 14 },
        { header: 'วันหมดอายุ',      key: 'exp',         width: 14 },
        { header: 'อายุผลิตภัณฑ์',  key: 'shelf_life',  width: 14 },
        { header: 'ผู้สั่ง',         key: 'created_by',  width: 20 },
        { header: 'หน่วยงาน',        key: 'dept',        width: 16 },
        { header: 'สถานะ',           key: 'status',      width: 16 },
        { header: 'ผู้ตรวจสอบ',      key: 'verified_by', width: 20 },
        { header: 'เวลาตรวจสอบ',    key: 'verified_at', width: 20 },
    ];
    ws1.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    orders.forEach((order, index) => {
        ws1.addRow({
            no:           index + 1,
            date:         new Date(order.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
            time:         new Date(order.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }),
            order_type:   order.order_type || 'ไม่ระบุ',
            lot:          order.lot_number,
            product_id:   order.product_id,
            product_name: order.product_name,
            quantity:     order.quantity,
            mfg:          order.production_date,
            exp:          order.expiry_date,
            shelf_life:   order.product_exp,
            created_by:   order.created_by,
            dept:         order.created_by_department || 'ไม่ระบุ',
            status:       order.is_verified ? 'ตรวจสอบแล้ว' : 'รอดำเนินการ',
            verified_by:  order.verified_by || '-',
            verified_at:  order.verified_at ? new Date(order.verified_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-',
        });
    });

    // ✅ Sheet 2 — สรุปยอดตามหน่วยงาน (เหมือนเดิม)
    const ws2 = wb.addWorksheet('สรุปตามหน่วยงาน');
    ws2.columns = [
        { header: 'ลำดับ',        key: 'no',      width: 6  },
        { header: 'หน่วยงาน',     key: 'dept',    width: 24 },
        { header: 'จำนวนคำสั่ง', key: 'count',   width: 14 },
        { header: 'สัดส่วน (%)', key: 'percent', width: 14 },
    ];
    ws2.getRow(1).eachCell(cell => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    });
    chartData.forEach((item, index) => {
        ws2.addRow({
            no:      index + 1,
            dept:    item.name,
            count:   item.count,
            percent: ((item.count / orders.length) * 100).toFixed(2) + '%',
        });
    });

    // ✅ helper วาดกราฟแท่ง — ใช้ร่วมกันทั้ง 2 sheet
const drawBarChart = (
    title: string,
    subtitle: string,
    data: { name: string; value: number }[],
    totalValue: number,
): string => {
    const CANVAS_W = 960, CANVAS_H = 520;
    const PAD = { top: 90, right: 40, bottom: 130, left: 90 };
    const chartW = CANVAS_W - PAD.left - PAD.right;
    const chartH = CANVAS_H - PAD.top - PAD.bottom;

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    // ✅ guard null context
    if (!ctx) return '';

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.fillText(title, CANVAS_W / 2, 44);

    ctx.fillStyle = '#6b7280';
    ctx.font = '13px Arial';
    ctx.fillText(subtitle, CANVAS_W / 2, 66);

    const maxVal = Math.max(...data.map(d => d.value), 1);
    const COLORS_HEX = ['#3B82F6','#10B981','#F59E0B','#EF4444','#8B5CF6','#06B6D4','#EC4899','#F97316'];
    const barSlotW = data.length > 0 ? chartW / data.length : chartW;
    const barW = Math.min(60, barSlotW * 0.55);

    // grid lines
    for (let i = 0; i <= 5; i++) {
        const y = PAD.top + chartH - (i / 5) * chartH;
        const val = Math.round((i / 5) * maxVal);
        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(PAD.left, y);
        ctx.lineTo(PAD.left + chartW, y);
        ctx.stroke();
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(val.toLocaleString(), PAD.left - 10, y + 4);
    }

    const drawRoundedRect = (x: number, y: number, w: number, h: number, r: number) => {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h);
        ctx.lineTo(x, y + h);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    };

    data.forEach((item, i) => {
        // ✅ ป้องกัน barH = 0 ทำให้ gradient พัง
        const barH = Math.max((item.value / maxVal) * chartH, 4);
        const x = PAD.left + i * barSlotW + (barSlotW - barW) / 2;
        const y = PAD.top + chartH - barH;
        const color = COLORS_HEX[i % COLORS_HEX.length];

        // ✅ ใช้ fillStyle สีตรงๆ แทน gradient เพื่อป้องกัน error
        ctx.fillStyle = color;
        drawRoundedRect(x, y, barW, barH, 4);
        ctx.fill();

        // % สัดส่วน
        const pct = totalValue > 0 ? ((item.value / totalValue) * 100).toFixed(1) + '%' : '0%';
        ctx.fillStyle = '#6b7280';
        ctx.font = '11px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(pct, x + barW / 2, y - 22);

        // ค่าบนแท่ง
        ctx.fillStyle = '#1f2937';
        ctx.font = 'bold 13px Arial';
        ctx.fillText(item.value.toLocaleString(), x + barW / 2, y - 8);

        // ชื่อหน่วยงาน (หมุน -40°)
        ctx.save();
        ctx.translate(x + barW / 2, PAD.top + chartH + 12);
        ctx.rotate(-Math.PI / 4.5);
        ctx.fillStyle = '#374151';
        ctx.font = '12px Arial';
        ctx.textAlign = 'right';
        ctx.fillText(item.name, 0, 0);
        ctx.restore();
    });

    // เส้นแกน
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(PAD.left, PAD.top);
    ctx.lineTo(PAD.left, PAD.top + chartH);
    ctx.lineTo(PAD.left + chartW, PAD.top + chartH);
    ctx.stroke();

    return canvas.toDataURL('image/png').split(',')[1];
};

// ✅ Sheet 3 — กราฟจำนวนคำสั่งต่อหน่วยงาน
const ws3 = wb.addWorksheet('กราฟจำนวนคำสั่ง');
const img3 = drawBarChart(
    `สัดส่วนจำนวนคำสั่งแต่ละหน่วยงาน — ${months[selectedMonth]} ${selectedYear}`,
    `คำสั่งรวม: ${orders.length} รายการ | ${chartData.length} หน่วยงาน`,
    chartData.map(d => ({ name: d.name, value: d.count })), // ✅ map .count → .value
    orders.length,
);

const imgId3 = wb.addImage({ base64: img3, extension: 'png' });
ws3.addImage(imgId3, { tl: { col: 0, row: 0 }, ext: { width: 960, height: 520 } });

// ✅ Sheet 4 — กราฟจำนวนชิ้นงานต่อหน่วยงาน
const ws4 = wb.addWorksheet('กราฟจำนวนชิ้นงาน');
const img4 = drawBarChart(
    `สัดส่วนจำนวนชิ้นงานแต่ละหน่วยงาน — ${months[selectedMonth]} ${selectedYear}`,
    `ชิ้นงานรวม: ${totalQuantity.toLocaleString()} ชิ้น | ${quantityChartData.length} หน่วยงาน`,
    quantityChartData, // ✅ มี .value อยู่แล้ว ไม่ต้อง map
    totalQuantity,
);
const imgId4 = wb.addImage({ base64: img4, extension: 'png' });
ws4.addImage(imgId4, { tl: { col: 0, row: 0 }, ext: { width: 960, height: 520 } });
    // ✅ Download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `printer-statistics-${monthNamesEn[selectedMonth]}-${selectedYear}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);

    Swal.fire({ icon: 'success', title: 'Export สำเร็จ', text: 'ดาวน์โหลดไฟล์ Excel เรียบร้อยแล้ว', timer: 2000, showConfirmButton: false });
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
                               onClick={exportExcel}
                               disabled={orders.length === 0}
                               className={`flex justify-center items-center gap-2 px-5 py-2.5 rounded-xl font-bold transition-all shadow-sm w-full md:w-auto mt-2 md:mt-0
                               ${orders.length === 0
                               ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                               : 'bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white hover:shadow-md hover:-translate-y-0.5'
                               }`}
                               >
                                 <Download size={20} />
                                 <span className="whitespace-nowrap">Export Excel</span>
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
                                <p className="text-sm font-semibold text-orange-800/70 mb-1 tracking-wider relative z-10">หน่วยงานที่มีคำสั่งพิมพ์มากที่สุด</p>
                                <p className="text-3xl font-extrabold text-orange-600 truncate relative z-10">{chartData.length > 0 ? chartData[0]?.name : '-'}</p>
                                <p className="text-sm font-medium text-orange-700/80 mt-1 relative z-10">
                                    {chartData.length > 0 ? `(${chartData[0]?.count || 0} คำสั่ง)` : 'ไม่มีข้อมูล'}
                                </p>
                            </div>
                            <div className="bg-gradient-to-br from-purple-50 to-violet-50 p-6 rounded-2xl border border-purple-100 shadow-sm relative overflow-hidden group">
                                <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                                <p className="text-sm font-semibold text-purple-800/70 mb-1 tracking-wider relative z-10">จำนวนชิ้นงานจากคำสั่งพิมพ์รวมทั้งหมด</p>
                                <p className="text-5xl font-extrabold text-purple-600 relative z-10">
                                {totalQuantity.toLocaleString()}
                                 </p>
                            </div>
                            <div className="bg-gradient-to-br from-red-50 to-rose-50 p-6 rounded-2xl border border-red-100 shadow-sm relative overflow-hidden group">
                              <div className="absolute -right-4 -top-4 w-24 h-24 bg-red-500/10 rounded-full group-hover:scale-110 transition-transform duration-300"></div>
                               <p className="text-sm font-semibold text-red-800/70 mb-1 tracking-wider relative z-10">คำสั่งพิมพ์ที่ยกเลิก</p>
                               <p className="text-5xl font-extrabold text-red-600 relative z-10">{totalCancelled}</p>
                               <p className="text-sm font-medium text-red-500/80 mt-1 relative z-10">คิดเป็น {cancelRate}% ของคำสั่งพิมพ์ทั้งหมด</p>
                            </div>
                        </div>

                        {chartData.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                                <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                    <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                        <i className="fas fa-chart-bar text-blue-500"></i> จำนวนคำสั่งพิมพ์แบ่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
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
                                        <i className="fas fa-chart-pie text-purple-500"></i> สัดส่วนการสั่งพิมพ์แบ่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
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

                        {/* ✅ Section ใหม่ — จำนวนชิ้นงานต่อหน่วยงาน */}
                          {quantityChartData.length > 0 && (
                           <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                             <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                               <i className="fas fa-boxes text-purple-500"></i>
                                จำนวนชิ้นงานที่สั่งแบ่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
                             </h3>
                          <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={quantityChartData}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} />
                            <YAxis axisLine={false} tickLine={false} />
                            <Tooltip
                                  cursor={{ fill: 'transparent' }}
                                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                  formatter={(value: number) => [value.toLocaleString(), 'จำนวนชิ้นงาน']}
                                 />
                                <Bar dataKey="total" fill="#8B5CF6" radius={[4, 4, 0, 0]} barSize={40} />
                                </BarChart>
                                </ResponsiveContainer>
                                </div>

                                  <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
                                     <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                                        <i className="fas fa-chart-pie text-violet-500"></i>
                                         สัดส่วนจำนวนชิ้นงานที่สั่งตามหน่วยงาน ({months[selectedMonth]} {selectedYear})
                                     </h3>
                                       <ResponsiveContainer width="100%" height={300}>
                                       <PieChart>
                                        <Pie
                                           data={quantityChartData}
                                           cx="50%"
                                           cy="50%"
                                           innerRadius={60}
                                           outerRadius={80}
                                           paddingAngle={5}
                                           dataKey="total"
                                           >
                                          {quantityChartData.map((_, index) => (
                                         <Cell key={`qty-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                           ))}
                                       </Pie>
                                 <Tooltip
                                   contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                 formatter={(value: number) => [value.toLocaleString(), 'ชิ้นงาน']}
                                 />
                               <Legend iconType="circle" />
                            </PieChart>
                     </ResponsiveContainer>
                   </div>
               </div>
               )}

                     {cancelChartData.length > 0 && (
    <div className="mt-8">
        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
            <span className="w-2 h-6 bg-red-500 rounded-full inline-block"></span>
            สถิติการยกเลิกคำสั่งพิมพ์แยกตามหน่วยงาน
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <i className="fas fa-chart-bar text-red-500"></i>
                    จำนวนคำสั่งพิมพ์ที่ยกเลิกต่อหน่วยงาน ({months[selectedMonth]} {selectedYear})
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={cancelChartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} />
                        <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                        <Tooltip
                            cursor={{ fill: 'transparent' }}
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [value, 'คำสั่งยกเลิก']}
                        />
                        <Bar dataKey="count" fill="#EF4444" radius={[4, 4, 0, 0]} barSize={40} />
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-red-100 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <i className="fas fa-chart-pie text-red-500"></i>
                    สัดส่วนการยกเลิกคำสั่งพิมพ์ต่อหน่วยงาน ({months[selectedMonth]} {selectedYear})
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                        <Pie
                            data={cancelChartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="count"
                            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                            labelLine={false}
                        >
                            {cancelChartData.map((_, index) => (
                                <Cell
                                    key={`cancel-cell-${index}`}
                                    fill={['#EF4444','#F97316','#F59E0B','#DC2626','#B91C1C','#991B1B'][index % 6]}
                                />
                            ))}
                        </Pie>
                        <Tooltip
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            formatter={(value: number) => [value, 'คำสั่งยกเลิก']}
                        />
                        <Legend iconType="circle" />
                    </PieChart>
                </ResponsiveContainer>

                {/* ตารางสรุปยกเลิกต่อหน่วยงาน */}
                <div className="mt-4 border-t border-gray-100 pt-4 space-y-2">
                    {cancelChartData.map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                            <span className="text-gray-700 font-medium">{item.name}</span>
                            <div className="flex items-center gap-3">
                                <div className="w-28 bg-gray-100 rounded-full h-2">
                                    <div
                                        className="bg-red-500 h-2 rounded-full"
                                        style={{ width: `${(item.count / totalCancelled) * 100}%` }}
                                    />
                                </div>
                                <span className="text-red-600 font-bold w-6 text-right">{item.count}</span>
                                <span className="text-gray-400 text-xs w-12 text-right">
                                    ({((item.count / totalCancelled) * 100).toFixed(0)}%)
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    </div>
      )}
                    </div>
                )}
            </div>
        </div>
    );
} 