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

        // Initialize Supabase client with the Service Role Key
        // This key has admin privileges and bypasses RLS
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // Delete the user from auth.users (this will cascade to public.users if ON DELETE CASCADE is set,
        // but it's safer to delete explicitly if not configured that way)
        const { data, error } = await supabaseAdmin.auth.admin.deleteUser(id);

        if (error) {
            console.error('Error deleting user from Supabase Auth:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'User deleted successfully', data }, { status: 200 });

    } catch (error: any) {
        console.error('Unexpected error during user deletion:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
