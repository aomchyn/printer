'use client';

import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface PeakHourData {
    hour: number;
    label: string;
    orders: number;
}

export interface PeakDayData {
    key: string;
    date: string;
    orders: number;
    quantity: number;
    peakHour: string;
    peakOrders: number;
    hourlyData: PeakHourData[];
}

export function resolveSelectedPeakDay(
    days: readonly PeakDayData[],
    selectedKey: string | null,
): PeakDayData | null {
    if (days.length === 0) return null;

    return days.find(day => day.key === selectedKey) ?? days[days.length - 1];
}

interface PeakTimeExplorerProps {
    days: readonly PeakDayData[];
}

export default function PeakTimeExplorer({ days }: PeakTimeExplorerProps) {
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const selectedDay = resolveSelectedPeakDay(days, selectedKey);
    const displayedDays = [...days].reverse();

    if (!selectedDay) {
        return (
            <section
                className="rounded-2xl border border-dashed border-[#D9E1E2] bg-white px-6 py-10 text-center"
                aria-labelledby="peak-time-explorer-title"
            >
                <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-[#F0F3F4] text-xl" aria-hidden="true">
                    ◷
                </div>
                <h3 id="peak-time-explorer-title" className="text-sm font-black text-[#00263A]">
                    สำรวจช่วงเวลาคำสั่งที่พีค
                </h3>
                <p className="mt-1 text-sm text-[#8A9498]">ไม่มีข้อมูลคำสั่งที่ใช้งานได้ในช่วงเวลานี้</p>
            </section>
        );
    }

    return (
        <section
            className="overflow-hidden rounded-2xl border border-[#D9E1E2] bg-[#F8FAFB]"
            aria-labelledby="peak-time-explorer-title"
        >
            <div className="border-b border-[#D9E1E2] bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <h3 id="peak-time-explorer-title" className="text-sm font-black text-[#00263A]">
                            สำรวจช่วงเวลาคำสั่งที่พีค
                        </h3>
                        <p className="mt-1 text-xs text-[#5F6B70]">คลิกวันที่เพื่อดูรายละเอียดและการกระจายคำสั่งรายชั่วโมง</p>
                    </div>
                    <p className="text-[11px] font-semibold text-[#8A9498]">เรียงจากวันล่าสุด</p>
                </div>

                <div
                    className="mt-4 grid auto-cols-[9.25rem] grid-flow-col grid-rows-1 gap-3 overflow-x-auto pb-3 sm:auto-cols-[10rem] sm:grid-rows-2"
                    aria-label="เลือกวันที่เพื่อดูช่วงเวลาคำสั่งที่พีค"
                >
                    {displayedDays.map(day => {
                        const isSelected = selectedDay.key === day.key;

                        return (
                            <button
                                key={day.key}
                                type="button"
                                aria-pressed={isSelected}
                                aria-label={`ดูรายละเอียดวันที่ ${day.date}`}
                                onClick={() => setSelectedKey(day.key)}
                                className={`rounded-xl border p-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0057B8] focus-visible:ring-offset-2 ${
                                    isSelected
                                        ? 'border-[#0057B8] bg-[#EAF3FC] shadow-sm ring-1 ring-[#0057B8]'
                                        : 'border-[#D9E1E2] bg-white hover:border-[#00AEC7] hover:bg-[#F5FCFD]'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-black text-[#00263A]">{day.date}</span>
                                    {isSelected && (
                                        <span className="rounded-full bg-[#0057B8] px-1.5 py-0.5 text-[9px] font-bold text-white">
                                            กำลังดู
                                        </span>
                                    )}
                                </div>
                                <p className="mt-2 text-xs text-[#5F6B70]">
                                    <span className="text-lg font-black tabular-nums text-[#00AEC7]">{day.orders.toLocaleString()}</span> คำสั่ง
                                </p>
                                <p className="mt-1 text-[11px] text-[#5F6B70]">
                                    พีค <span className="font-bold text-[#0057B8]">{day.peakHour}</span>
                                </p>
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="grid gap-4 p-4 sm:p-6 xl:grid-cols-[minmax(260px,0.8fr)_minmax(0,1.6fr)]" aria-live="polite">
                <div className="rounded-2xl border border-[#D9E1E2] bg-white p-4 sm:p-5">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#8A9498]">รายละเอียดวันที่เลือก</p>
                    <h4 className="mt-1 text-xl font-black text-[#00263A]">{selectedDay.date}</h4>

                    <dl className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-xl bg-[#E5F8FB] p-3">
                            <dt className="text-[10px] font-bold text-[#5F6B70]">คำสั่งทั้งหมด</dt>
                            <dd className="mt-1 text-2xl font-black tabular-nums text-[#00AEC7]">{selectedDay.orders.toLocaleString()}</dd>
                        </div>
                        <div className="rounded-xl bg-[#F0F3F4] p-3">
                            <dt className="text-[10px] font-bold text-[#5F6B70]">ชิ้นงานรวม</dt>
                            <dd className="mt-1 text-2xl font-black tabular-nums text-[#00263A]">{selectedDay.quantity.toLocaleString()}</dd>
                        </div>
                        <div className="rounded-xl bg-[#EAF3FC] p-3">
                            <dt className="text-[10px] font-bold text-[#5F6B70]">ช่วงเวลาที่พีค</dt>
                            <dd className="mt-1 text-xl font-black text-[#0057B8]">{selectedDay.peakHour}</dd>
                        </div>
                        <div className="rounded-xl bg-[#EAF3FC] p-3">
                            <dt className="text-[10px] font-bold text-[#5F6B70]">คำสั่งช่วงพีค</dt>
                            <dd className="mt-1 text-2xl font-black tabular-nums text-[#0057B8]">{selectedDay.peakOrders.toLocaleString()}</dd>
                        </div>
                    </dl>
                </div>

                <div className="min-w-0 rounded-2xl border border-[#D9E1E2] bg-white p-4 sm:p-5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h4 className="text-sm font-black text-[#00263A]">การกระจายคำสั่งรายชั่วโมง</h4>
                            <p className="mt-0.5 text-[11px] text-[#8A9498]">เวลาไทย (Asia/Bangkok)</p>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-semibold text-[#5F6B70]" aria-hidden="true">
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#00AEC7]" />ทั่วไป</span>
                            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-[#0057B8]" />ช่วงพีค</span>
                        </div>
                    </div>

                    <div
                        className="mt-3 h-[220px] w-full"
                        role="img"
                        aria-label={`กราฟจำนวนคำสั่งรายชั่วโมงของวันที่ ${selectedDay.date} ช่วงพีค ${selectedDay.peakHour} จำนวน ${selectedDay.peakOrders} คำสั่ง`}
                    >
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={selectedDay.hourlyData} margin={{ top: 10, right: 4, bottom: 0, left: -24 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#D9E1E2" />
                                <XAxis dataKey="label" axisLine={false} tickLine={false} interval={2} tick={{ fill: '#5F6B70', fontSize: 10 }} />
                                <YAxis axisLine={false} tickLine={false} allowDecimals={false} tick={{ fill: '#5F6B70', fontSize: 10 }} />
                                <Tooltip
                                    cursor={{ fill: '#EAF3FC' }}
                                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #D9E1E2', borderRadius: 10, color: '#101820' }}
                                    formatter={(value) => [Number(value).toLocaleString(), 'คำสั่ง']}
                                />
                                <Bar dataKey="orders" name="คำสั่ง" radius={[4, 4, 0, 0]} barSize={14}>
                                    {selectedDay.hourlyData.map(hour => (
                                        <Cell
                                            key={hour.hour}
                                            fill={hour.label === selectedDay.peakHour ? '#0057B8' : '#00AEC7'}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </section>
    );
}
