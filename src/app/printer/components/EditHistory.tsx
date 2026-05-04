'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { UserCircle } from 'lucide-react';  // อย่าลืม import

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
    auditKey?: number;
}

export default function EditHistory({ orderId, updatedAt, auditKey }: Props) {
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const loadHistory = async () => {
            setLoading(true);
            const { data, error } = await supabase
                .from('audit_logs')
                .select('*')
                .eq('order_id', orderId)
                .neq('action', 'VERIFY')
                .order('created_at', { ascending: false });

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
        return () => { cancelled = true; };
    }, [orderId, updatedAt, auditKey]);

    if (loading) return <div className="text-sm text-gray-400 mt-2">กำลังโหลดประวัติ...</div>;
    if (history.length === 0) return null;

    const latestEntry = history[0];
    const hasMore = history.length > 1;

    return (
        <div className="mt-2">
            {!expanded ? (
                <div className="text-xs bg-gradient-to-r from-blue-50 to-white border border-blue-100 rounded-lg p-3 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 bg-blue-500 text-white text-[10px] rounded-full font-bold tracking-wide">
                            ✏️ แก้ไขล่าสุด
                        </span>
                        <span className="text-gray-400 text-[10px]">
                            {new Date(latestEntry.created_at).toLocaleString('th-TH', {
                                dateStyle: 'short',
                                timeStyle: 'short',
                            })}
                        </span>
                    </div>
                    <div className="flex items-start gap-2 mt-1.5">
                        <UserCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                        <div>
                            <span className="font-semibold text-gray-700">{latestEntry.user_name}</span>
                            <span className="text-gray-500 mx-1">·</span>
                            <span className="text-gray-600">{latestEntry.summary}</span>
                        </div>
                    </div>
                    {hasMore && (
                        <button
                            onClick={() => setExpanded(true)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline mt-2 block transition-colors"
                        >
                            🔍 ดูประวัติทั้งหมด ({history.length})
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white border border-gray-100 rounded-lg p-3">
                    <ul className="text-xs space-y-2 text-gray-600">
                        {history.map((entry) => (
                            <li key={entry.id} className="border-l-2 border-blue-200 pl-3">
                                <div className="flex items-start gap-2">
                                    <UserCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
                                    <div>
                                        <span className="font-semibold text-gray-700">{entry.user_name}</span>
                                        <span className="text-gray-500 mx-1">·</span>
                                        <span>{entry.summary}</span>
                                    </div>
                                </div>
                                <div className="text-gray-400 text-[10px] mt-0.5 ml-6">
                                    {new Date(entry.created_at).toLocaleString('th-TH', {
                                        dateStyle: 'short',
                                        timeStyle: 'short',
                                    })}
                                </div>
                            </li>
                        ))}
                    </ul>
                    <button
                        onClick={() => setExpanded(false)}
                        className="text-xs text-blue-600 hover:text-blue-800 underline mt-2"
                    >
                        ซ่อนประวัติ
                    </button>
                </div>
            )}
        </div>
    );
}