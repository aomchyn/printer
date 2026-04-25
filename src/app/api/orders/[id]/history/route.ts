import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'Order ID is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseAnonKey) {
            console.error('Missing Supabase configuration');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            auth: { persistSession: false }
        });

        const orderId = parseInt(id);

        // Fetch order details for fallback
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select('id, created_at, created_by, updated_at, updated_by, edit_summary')
            .eq('id', orderId)
            .single();

        if (orderError || !order) {
            return NextResponse.json(
                { error: 'Order not found' },
                { status: 404 }
            );
        }

        // Try to fetch from audit_logs table first
        const { data: auditLogs, error: auditError } = await supabase
            .from('audit_logs')
            .select('id, action, user_name, summary, created_at, changes')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        let history: any[] = [];

        if (!auditError && auditLogs && auditLogs.length > 0) {
            // Use audit_logs if available (new system)
            history = auditLogs.map((log: any) => ({
                timestamp: log.created_at,
                action: log.action || 'อัปเดต',
                by: log.user_name || 'ไม่ระบุ',
                description: log.summary || 'อัปเดตข้อมูล',
                changes: log.changes || {}
            }));
        } else {
            // Fallback to order.updated_at and order.created_at (old system)
            // Add initial creation record
            if (order.created_at) {
                history.push({
                    timestamp: order.created_at,
                    action: 'สร้าง',
                    by: order.created_by || 'ไม่ระบุ',
                    description: 'สร้างคำสั่งพิมพ์ใหม่'
                });
            }

            // Add modification record if exists
            if (order.updated_at && order.updated_by) {
                history.push({
                    timestamp: order.updated_at,
                    action: 'แก้ไข',
                    by: order.updated_by,
                    description: order.edit_summary || 'อัปเดตข้อมูล'
                });
            }
        }

        // Sort by timestamp descending (newest first)
        history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return NextResponse.json({ history }, { status: 200 });

    } catch (error) {
        console.error('Error fetching order history:', error);
        return NextResponse.json(
            { error: 'Internal Server Error' },
            { status: 500 }
        );
    }
}
