import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            console.error('Missing Supabase Service Role Key or URL');
            return NextResponse.json(
                { error: 'Server configuration error' },
                { status: 500 }
            );
        }

        // 1. Verify caller session using the Authorization header
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (!token) {
            return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
        }

        const supabaseUserClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: { persistSession: false }
            }
        );

        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token);

        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 });
        }

        // 2. Verify caller role (Must be moderator or assistant_moderator)
        const { data: callerData, error: roleError } = await supabaseUserClient
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (roleError || !callerData) {
            return NextResponse.json({ error: 'Unauthorized: Cannot verify user role' }, { status: 403 });
        }

        if (callerData.role !== 'moderator' && callerData.role !== 'assistant_moderator') {
            return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 });
        }

        // 3. Initialize Supabase client with the Service Role Key to bypass RLS for deletion
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // 4. Delete the user from auth.users
        const { data, error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
            console.error('Error deleting user from Supabase Auth:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'User deleted successfully', data }, { status: 200 });

    } catch (error) {
        console.error('Unexpected error during user deletion:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
