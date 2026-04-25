'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface HistoryEntry {
    id: number;
    action: string;
    user_name: string;
    summary: string;
    created_at: string;
}

interface Props {
    orderId: number;
    updatedAt?: string | null;
}

export default function EditHistory({ orderId, updatedAt }: Props) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false); // เริ่มต้นแสดงเฉพาะล่าสุด

    useEffect(() => {
        let cancelled = false;

        const loadHistory = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('order_id', orderId)
                .order('created_at', { ascending: false }); // เรียงล่าสุดก่อน

            if (!cancelled) {
                if (error) {
                    console.error('โหลดประวัติไม่สำเร็จ:', error);
                    setHistory([]);
                } else {
                    setHistory(data || []);
                }
                setLoading(false);
            }
        };

        loadHistory();
        return () => {
            cancelled = true;
        };
    }, [orderId, updatedAt]);

    if (loading) return <div className="text-sm text-gray-400 mt-2">กำลังโหลดประวัติ...</div>;
    if (history.length === 0) return null;

    const latestEntry = history[0];
    const hasMore = history.length > 1;

    return (
        <div className="mt-2">
            {!expanded ? (
                // แสดงเฉพาะรายการล่าสุด
                <div className="text-xs text-gray-600 border-l-2 border-blue-300 pl-2">
                    <div className="flex items-center gap-1">
                        <span className="font-semibold">{latestEntry.user_name}</span>
                        <span>-</span>
                        <span>{latestEntry.summary}</span>
                    </div>
                    <div className="text-gray-400 text-[10px]">
                        {new Date(latestEntry.created_at).toLocaleString('th-TH')}
                    </div>
                    {hasMore && (
                        <button
                            onClick={() => setExpanded(true)}
                            className="text-xs text-blue-600 hover:underline mt-1 block"
                        >
                            🔍 ดูประวัติทั้งหมด ({history.length})
                        </button>
                    )}
                </div>
            ) : (
                // แสดงทั้งหมด
                <div>
                    <ul className="text-xs space-y-1 text-gray-600">
                        {history.map((entry) => (
                            <li key={entry.id} className="border-l-2 border-blue-300 pl-2">
                                <div className="flex items-center gap-1">
                                    <span className="font-semibold">{entry.user_name}</span>
                                    <span>-</span>
                                    <span>{entry.summary}</span>
                                </div>
                                <div className="text-gray-400 text-[10px]">
                                    {new Date(entry.created_at).toLocaleString('th-TH')}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={() => setExpanded(false)}
                        className="text-xs text-blue-600 hover:underline mt-1"
                    >
                        ซ่อนประวัติ
                    </button>
                </div>
            )}
        </div>
    );
}