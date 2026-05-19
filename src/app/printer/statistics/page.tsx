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
    order_type?: string;
    is_verified: boolean;
    is_cancelled?: boolean;
    edit_summary?: string | null;
    updated_by?: string | null;
    updated_at?: string | null;
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

    useEffect(() => {
        loadHistoricalOrders();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedMonth, selectedYear]);



    const getChartData = () => {
        const departmentOrders: { [key: string]: number } = {};

        orders.forEach(order => {
            const dept = order.created_by_department
                ? order.created_by_department.split(' ')[0]
                : 'ไม่ระบุ';
            departmentOrders[dept] = (departmentOrders[dept] || 0) + 1;
        });

        return Object.entries(departmentOrders).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    };



    const getQuantityChartData = () => {
        const departmentQty: { [key: string]: number } = {};

        orders.forEach(order => {
            const dept = order.created_by_department
                ? order.created_by_department.split(' ')[0]
                : 'ไม่ระบุ';
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
            const dept = order.created_by_department
                ? order.created_by_department.split(' ')[0]
                : 'ไม่ระบุ';
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
    const COLORS = ['#60a5fa', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#22d3ee', '#fb923c'];

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
        const monthNamesEn = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const wb = new ExcelJS.Workbook();


        // ✅ Sheet 1 — รายการคำสั่งพิมพ์ทั้งหมด (เหมือนเดิม)
        const ws1 = wb.addWorksheet('รายการคำสั่งพิมพ์');
        ws1.columns = [
            { header: 'ลำดับ', key: 'no', width: 6 },
            { header: 'วันที่สั่ง', key: 'date', width: 14 },
            { header: 'เวลาสั่ง', key: 'time', width: 10 },
            { header: 'ประเภทคำสั่ง', key: 'order_type', width: 16 },
            { header: 'เลขลอต', key: 'lot', width: 16 },
            { header: 'รหัสสินค้า', key: 'product_id', width: 14 },
            { header: 'ชื่อสินค้า', key: 'product_name', width: 30 },
            { header: 'จำนวน', key: 'quantity', width: 8 },
            { header: 'วันที่ผลิต', key: 'mfg', width: 14 },
            { header: 'วันหมดอายุ', key: 'exp', width: 14 },
            { header: 'อายุผลิตภัณฑ์', key: 'shelf_life', width: 14 },
            { header: 'ผู้สั่ง', key: 'created_by', width: 20 },
            { header: 'หน่วยงาน', key: 'dept', width: 16 },
            { header: 'สถานะ', key: 'status', width: 16 },
            { header: 'ผู้ตรวจสอบ', key: 'verified_by', width: 20 },
            { header: 'เวลาตรวจสอบ', key: 'verified_at', width: 20 },
        ];
        ws1.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });
        orders.forEach((order, index) => {
            ws1.addRow({
                no: index + 1,
                date: new Date(order.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
                time: new Date(order.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }),
                order_type: order.order_type || 'ไม่ระบุ',
                lot: order.lot_number,
                product_id: order.product_id,
                product_name: order.product_name,
                quantity: order.quantity,
                mfg: order.production_date,
                exp: order.expiry_date,
                shelf_life: order.product_exp,
                created_by: order.created_by,
                dept: order.created_by_department || 'ไม่ระบุ',
                status: order.is_verified ? 'ตรวจสอบแล้ว' : 'รอดำเนินการ',
                verified_by: order.verified_by || '-',
                verified_at: order.verified_at ? new Date(order.verified_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '-',
            });
        });

        // ✅ Sheet 2 — สรุปยอดตามหน่วยงาน (เหมือนเดิม)
        const ws2 = wb.addWorksheet('สรุปตามหน่วยงาน');
        ws2.columns = [
            { header: 'ลำดับ', key: 'no', width: 6 },
            { header: 'หน่วยงาน', key: 'dept', width: 24 },
            { header: 'จำนวนคำสั่ง', key: 'count', width: 14 },
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
                no: index + 1,
                dept: item.name,
                count: item.count,
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
            const COLORS_HEX = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#EC4899', '#F97316'];
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

        // ✅ Sheet 5 — รายการคำสั่งพิมพ์ที่ยกเลิก
        const cancelledOrders = orders.filter(o => o.is_cancelled);
        const ws5 = wb.addWorksheet('คำสั่งที่ยกเลิก');
        ws5.columns = [
            { header: 'ลำดับ', key: 'no', width: 6 },
            { header: 'วันที่สั่ง', key: 'date', width: 14 },
            { header: 'เวลาสั่ง', key: 'time', width: 10 },
            { header: 'ประเภทคำสั่ง', key: 'order_type', width: 16 },
            { header: 'เลขลอต', key: 'lot', width: 16 },
            { header: 'รหัสสินค้า', key: 'product_id', width: 14 },
            { header: 'ชื่อสินค้า', key: 'product_name', width: 30 },
            { header: 'จำนวน', key: 'quantity', width: 8 },
            { header: 'วันที่ผลิต', key: 'mfg', width: 14 },
            { header: 'วันหมดอายุ', key: 'exp', width: 14 },
            { header: 'ผู้สั่ง', key: 'created_by', width: 20 },
            { header: 'หน่วยงาน', key: 'dept', width: 16 },
            { header: 'เหตุผลการยกเลิก', key: 'cancel_note', width: 40 },
            { header: 'ผู้ยกเลิก', key: 'cancelled_by', width: 20 },
            { header: 'เวลาที่ยกเลิก', key: 'cancelled_at', width: 20 },
        ];

        // Header สีแดง
        ws5.getRow(1).eachCell(cell => {
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEF4444' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
        });

        cancelledOrders.forEach((order, index) => {
            // ดึงเหตุผลยกเลิกจาก edit_summary เช่น "ยกเลิกเพราะ: ..."
            const cancelNote = order.edit_summary?.startsWith('ยกเลิกเพราะ:')
                ? order.edit_summary.replace('ยกเลิกเพราะ:', '').trim()
                : order.edit_summary || '-';

            const row = ws5.addRow({
                no: index + 1,
                date: new Date(order.created_at).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }),
                time: new Date(order.created_at).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }),
                order_type: order.order_type || 'ไม่ระบุ',
                lot: order.lot_number,
                product_id: order.product_id,
                product_name: order.product_name,
                quantity: order.quantity,
                mfg: order.production_date,
                exp: order.expiry_date,
                created_by: order.created_by,
                dept: order.created_by_department || 'ไม่ระบุ',
                cancel_note: cancelNote,
                cancelled_by: order.updated_by || '-',
                cancelled_at: order.updated_at
                    ? new Date(order.updated_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
                    : '-',
            });

            // ไฮไลต์แถวสีชมพูอ่อน
            row.eachCell(cell => {
                cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
                cell.border = { top: { style: 'thin', color: { argb: 'FFFECACA' } }, bottom: { style: 'thin', color: { argb: 'FFFECACA' } }, left: { style: 'thin', color: { argb: 'FFFECACA' } }, right: { style: 'thin', color: { argb: 'FFFECACA' } } };
            });
        });

        // summary row ท้าย sheet
        ws5.addRow([]);
        const summaryRow = ws5.addRow({
            no: '',
            date: `รวมทั้งหมด: ${cancelledOrders.length} รายการ`,
        });
        summaryRow.getCell('date').font = { bold: true, color: { argb: 'FFEF4444' } };
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

    // ── Shared Recharts dark tooltip style ──────────────────────────────────
    const darkTooltipStyle = {
        backgroundColor: '#0f1e3d',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '10px',
        color: '#e2e8f0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    };

    const axisTickStyle = { fill: '#94a3b8', fontSize: 12 };

    return (
        <div className="text-white min-h-full">
            {/* ── Main card ───────────────────────────────────────────────── */}
            <div className="bg-gradient-to-b from-[#0f1e3d]/80 to-[#0a1628]/80 backdrop-blur-xl rounded-2xl shadow-2xl p-6 md:p-8 mb-8 border border-white/8 relative overflow-hidden">

                {/* Background glow orbs — decorative only */}
                <div className="pointer-events-none absolute -top-20 -right-20 w-64 h-64 bg-blue-500/8 rounded-full blur-3xl" />
                <div className="pointer-events-none absolute -bottom-16 -left-16 w-48 h-48 bg-indigo-500/8 rounded-full blur-3xl" />

                {/* ── Header row ───────────────────────────────────────────── */}
                <div className="flex flex-col gap-5 mb-8 relative">

                    {/* Title block */}
                    <div className="flex items-start gap-3">
                        <div className="w-9 h-9 bg-white/10 border border-white/15 rounded-xl flex items-center justify-center shadow-inner shrink-0 mt-0.5">
                            <span className="text-lg">📈</span>
                        </div>
                        <div>
                            <h1 className="text-xl md:text-3xl font-black text-white tracking-tight leading-tight">
                                ประวัติสถิติย้อนหลัง
                            </h1>
                            <p className="text-blue-300/70 text-xs md:text-sm font-medium mt-0.5">
                                ดูข้อมูลสรุปยอดการสั่งพิมพ์ฉลากย้อนหลังแบบรายเดือน
                            </p>
                        </div>
                    </div>

                    {/* Month / Year / Export controls — full-width stacked on mobile */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center bg-white/5 border border-white/10 rounded-xl p-3">
                        {/* Selects row */}
                        <div className="flex gap-2 flex-1">
                            <div className="relative flex-1">
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(Number(e.target.value))}
                                    className="w-full appearance-none bg-white/10 border border-white/15 text-white text-sm rounded-lg px-3 py-2.5 font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400/50 transition-all"
                                >
                                    {months.map((m, index) => (
                                        <option key={index} value={index} className="bg-[#0f1e3d] text-white">{m}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                    <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                            <div className="relative w-24 shrink-0">
                                <select
                                    value={selectedYear}
                                    onChange={(e) => setSelectedYear(Number(e.target.value))}
                                    className="w-full appearance-none bg-white/10 border border-white/15 text-white text-sm rounded-lg px-3 py-2.5 font-semibold cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400/50 transition-all"
                                >
                                    {years.map(y => (
                                        <option key={y} value={y} className="bg-[#0f1e3d] text-white">{y}</option>
                                    ))}
                                </select>
                                <div className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center">
                                    <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Export button — full width on mobile */}
                        <button
                            onClick={exportExcel}
                            disabled={orders.length === 0}
                            className={`flex justify-center items-center gap-2 px-5 py-2.5 rounded-lg font-bold text-sm transition-all duration-200 w-full sm:w-auto shrink-0
                               ${orders.length === 0
                                    ? 'bg-white/5 text-white/25 cursor-not-allowed border border-white/8'
                                    : 'bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-400 hover:to-green-400 text-white border border-emerald-400/30 shadow-lg shadow-emerald-900/30 active:scale-95'
                                }`}
                        >
                            <Download size={15} />
                            <span>Export Excel</span>
                        </button>
                    </div>
                </div>

                {/* ── Loading spinner ──────────────────────────────────────── */}
                {isLoading ? (
                    <div className="flex flex-col justify-center items-center py-24 gap-4">
                        <div className="w-12 h-12 rounded-full border-2 border-white/10 border-t-blue-400 animate-spin" />
                        <p className="text-blue-300/60 text-sm font-medium">กำลังโหลดข้อมูล...</p>
                    </div>
                ) : (
                    <div id="statistics-content" className="w-full">

                        {/* ── KPI Cards ────────────────────────────────────────── */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-8">

                            {/* Card: Total orders */}
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 overflow-hidden group hover:bg-white/8 transition-all duration-300">
                                <div className="absolute -right-3 -top-3 w-20 h-20 bg-blue-500/15 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <p className="text-[10px] md:text-[11px] font-bold text-blue-300/70 uppercase tracking-widest mb-2 relative z-10 leading-snug">คำสั่งทั้งหมด</p>
                                <p className="text-4xl md:text-5xl font-black text-blue-300 relative z-10 tabular-nums">{orders.length}</p>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-blue-500/40 to-transparent" />
                            </div>

                            {/* Card: Departments */}
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 overflow-hidden group hover:bg-white/8 transition-all duration-300">
                                <div className="absolute -right-3 -top-3 w-20 h-20 bg-emerald-500/15 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <p className="text-[10px] md:text-[11px] font-bold text-emerald-300/70 uppercase tracking-widest mb-2 relative z-10 leading-snug">จำนวนหน่วยงาน</p>
                                <p className="text-4xl md:text-5xl font-black text-emerald-300 relative z-10 tabular-nums">{chartData.length}</p>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />
                            </div>

                            {/* Card: Top department — full width on 2-col mobile */}
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 overflow-hidden group hover:bg-white/8 transition-all duration-300 col-span-2 md:col-span-1">
                                <div className="absolute -right-3 -top-3 w-20 h-20 bg-amber-500/15 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <p className="text-[10px] md:text-[11px] font-bold text-amber-300/70 uppercase tracking-widest mb-2 relative z-10 leading-snug">หน่วยงานสั่งพิมพ์มากที่สุด</p>
                                <p className="text-2xl md:text-2xl font-black text-amber-300 truncate relative z-10 leading-tight">{chartData.length > 0 ? chartData[0]?.name : '—'}</p>
                                <p className="text-xs font-medium text-amber-300/60 mt-1 relative z-10">
                                    {chartData.length > 0 ? `${chartData[0]?.count || 0} คำสั่ง` : 'ไม่มีข้อมูล'}
                                </p>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                            </div>

                            {/* Card: Total pieces */}
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 overflow-hidden group hover:bg-white/8 transition-all duration-300 col-span-2 md:col-span-1">
                                <div className="absolute -right-3 -top-3 w-20 h-20 bg-violet-500/15 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <p className="text-[10px] md:text-[11px] font-bold text-violet-300/70 uppercase tracking-widest mb-2 relative z-10 leading-snug">ชิ้นงานรวมทั้งหมด</p>
                                <p className="text-4xl md:text-5xl font-black text-violet-300 relative z-10 tabular-nums">{totalQuantity.toLocaleString()}</p>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
                            </div>

                            {/* Card: Cancelled */}
                            <div className="relative bg-white/5 border border-white/10 rounded-2xl p-4 md:p-5 overflow-hidden group hover:bg-white/8 transition-all duration-300 col-span-2 md:col-span-1">
                                <div className="absolute -right-3 -top-3 w-20 h-20 bg-rose-500/15 rounded-full blur-xl group-hover:scale-125 transition-transform duration-500" />
                                <p className="text-[10px] md:text-[11px] font-bold text-rose-300/70 uppercase tracking-widest mb-2 relative z-10 leading-snug">คำสั่งพิมพ์ที่ยกเลิก</p>
                                <p className="text-4xl md:text-5xl font-black text-rose-300 relative z-10 tabular-nums">{totalCancelled}</p>
                                <p className="text-xs font-medium text-rose-300/60 mt-1 relative z-10">คิดเป็น {cancelRate}% ของทั้งหมด</p>
                                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-rose-500/40 to-transparent" />
                            </div>
                        </div>

                        {/* ── Section label helper ─────────────────────────────── */}
                        {/* Reusable inline component for section headings */}

                        {/* ── Chart section: Order counts ─────────────────────── */}
                        {chartData.length > 0 ? (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                                {/* Bar chart */}
                                <div className="bg-white/5 border border-white/8 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                        <span className="w-2 h-5 bg-blue-400 rounded-full inline-block shrink-0" />
                                        จำนวนคำสั่งพิมพ์แบ่งตามหน่วยงาน
                                        <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTickStyle} />
                                            <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} />
                                            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={darkTooltipStyle} />
                                            <Bar dataKey="count" fill="#60a5fa" radius={[6, 6, 0, 0]} barSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Pie chart */}
                                <div className="bg-white/5 border border-white/8 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                        <span className="w-2 h-5 bg-violet-400 rounded-full inline-block shrink-0" />
                                        สัดส่วนการสั่งพิมพ์ตามหน่วยงาน
                                        <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={chartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={90}
                                                paddingAngle={4}
                                                dataKey="count"
                                            >
                                                {chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={darkTooltipStyle} />
                                            <Legend iconType="circle" wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ) : (
                            /* Empty state */
                            <div className="bg-white/3 border border-white/8 border-dashed rounded-2xl p-16 text-center mb-6">
                                <div className="text-5xl mb-4 opacity-20">📁</div>
                                <h2 className="text-lg font-semibold text-white/40">
                                    ไม่มีข้อมูลคำสั่งพิมพ์ฉลากในเดือน {months[selectedMonth]} {selectedYear}
                                </h2>
                            </div>
                        )}

                        {/* ── Chart section: Piece quantities ─────────────────── */}
                        {quantityChartData.length > 0 && (
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

                                <div className="bg-white/5 border border-white/8 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                        <span className="w-2 h-5 bg-violet-400 rounded-full inline-block shrink-0" />
                                        จำนวนชิ้นงานที่สั่งตามหน่วยงาน
                                        <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <BarChart data={quantityChartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTickStyle} />
                                            <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} />
                                            <Tooltip
                                                cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                contentStyle={darkTooltipStyle}
                                                formatter={(value) => [Number(value).toLocaleString(), 'จำนวนชิ้นงาน']}
                                            />
                                            <Bar dataKey="total" fill="#a78bfa" radius={[6, 6, 0, 0]} barSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                <div className="bg-white/5 border border-white/8 rounded-2xl p-6">
                                    <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                        <span className="w-2 h-5 bg-cyan-400 rounded-full inline-block shrink-0" />
                                        สัดส่วนชิ้นงานที่สั่งตามหน่วยงาน
                                        <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                    </h3>
                                    <ResponsiveContainer width="100%" height={300}>
                                        <PieChart>
                                            <Pie
                                                data={quantityChartData}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={60}
                                                outerRadius={90}
                                                paddingAngle={4}
                                                dataKey="total"
                                            >
                                                {quantityChartData.map((_, index) => (
                                                    <Cell key={`qty-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={darkTooltipStyle}
                                                formatter={(value) => [Number(value).toLocaleString(), 'ชิ้นงาน']}
                                            />
                                            <Legend iconType="circle" wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}

                        {/* ── Chart section: Cancellations ─────────────────────── */}
                        {cancelChartData.length > 0 && (
                            <div className="mt-2">
                                <div className="flex items-center gap-3 mb-5">
                                    <span className="w-2 h-6 bg-rose-500 rounded-full inline-block" />
                                    <h2 className="text-base font-black text-white/90 uppercase tracking-wider">
                                        สถิติการยกเลิกคำสั่งพิมพ์แยกตามหน่วยงาน
                                    </h2>
                                </div>
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

                                    <div className="bg-white/5 border border-rose-500/15 rounded-2xl p-6">
                                        <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                            <span className="w-2 h-5 bg-rose-400 rounded-full inline-block shrink-0" />
                                            จำนวนที่ยกเลิกต่อหน่วยงาน
                                            <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                        </h3>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <BarChart data={cancelChartData}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={axisTickStyle} />
                                                <YAxis axisLine={false} tickLine={false} tick={axisTickStyle} allowDecimals={false} />
                                                <Tooltip
                                                    cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                                                    contentStyle={darkTooltipStyle}
                                                    formatter={(value) => [String(value), 'คำสั่งยกเลิก']}
                                                />
                                                <Bar dataKey="count" fill="#f87171" radius={[6, 6, 0, 0]} barSize={40} />
                                            </BarChart>
                                        </ResponsiveContainer>
                                    </div>

                                    <div className="bg-white/5 border border-rose-500/15 rounded-2xl p-6">
                                        <h3 className="text-sm font-black text-white/90 mb-5 flex items-center gap-2 uppercase tracking-wider">
                                            <span className="w-2 h-5 bg-orange-400 rounded-full inline-block shrink-0" />
                                            สัดส่วนการยกเลิกต่อหน่วยงาน
                                            <span className="text-blue-300/50 font-medium normal-case tracking-normal text-xs ml-1">({months[selectedMonth]} {selectedYear})</span>
                                        </h3>
                                        <ResponsiveContainer width="100%" height={300}>
                                            <PieChart>
                                                <Pie
                                                    data={cancelChartData}
                                                    cx="50%"
                                                    cy="50%"
                                                    innerRadius={60}
                                                    outerRadius={90}
                                                    paddingAngle={4}
                                                    dataKey="count"
                                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                                    labelLine={false}
                                                >
                                                    {cancelChartData.map((_, index) => (
                                                        <Cell
                                                            key={`cancel-cell-${index}`}
                                                            fill={['#f87171', '#fb923c', '#fbbf24', '#ef4444', '#dc2626', '#b91c1c'][index % 6]}
                                                        />
                                                    ))}
                                                </Pie>
                                                <Tooltip
                                                    contentStyle={darkTooltipStyle}
                                                    formatter={(value) => [String(value), 'คำสั่งยกเลิก']}
                                                />
                                                <Legend iconType="circle" wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
                                            </PieChart>
                                        </ResponsiveContainer>

                                        {/* Mini breakdown table */}
                                        <div className="mt-4 border-t border-white/8 pt-4 space-y-2.5">
                                            {cancelChartData.map((item, index) => (
                                                <div key={index} className="flex items-center justify-between text-sm">
                                                    <span className="text-white/70 font-medium">{item.name}</span>
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-24 bg-white/8 rounded-full h-1.5">
                                                            <div
                                                                className="bg-rose-400 h-1.5 rounded-full transition-all duration-500"
                                                                style={{ width: `${(item.count / totalCancelled) * 100}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-rose-300 font-black w-5 text-right tabular-nums">{item.count}</span>
                                                        <span className="text-white/30 text-xs w-10 text-right tabular-nums">
                                                            {((item.count / totalCancelled) * 100).toFixed(0)}%
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