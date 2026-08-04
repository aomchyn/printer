import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });

        const supabaseUserClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
        );

        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        const { data: callerData, error: roleError } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (roleError || !callerData) {
            return NextResponse.json({ error: 'Unauthorized: Cannot verify user role' }, { status: 403 });
        }

        // Allow ONLY moderator to delete signatures
        if (callerData.role !== 'moderator') {
            return NextResponse.json({ error: 'เฉพาะ Moderator เท่านั้นที่สามารถลบลายเซ็นได้' }, { status: 403 });
        }

        // Get the current user's signature URL
        const { data: targetUser, error: targetError } = await supabaseAdmin
            .from('users')
            .select('signature_url')
            .eq('id', id)
            .single();

        if (targetError) {
            return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
        }

        // Delete from storage if it exists
        if (targetUser.signature_url) {
            const oldFileName = targetUser.signature_url.split('/').pop();
            if (oldFileName) {
                await supabaseAdmin.storage.from('signatures').remove([oldFileName]);
            }
        }

        // Set signature_url to null in DB
        const { error: updateError } = await supabaseAdmin
            .from('users')
            .update({ signature_url: null })
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'Signature deleted successfully' }, { status: 200 });
    } catch (error) {
        console.error('Unexpected error during signature deletion:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
