import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function PUT(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const body = await request.json();
        const { newPassword } = body;

        if (!id || !newPassword) {
            return NextResponse.json({ error: 'User ID and new password are required' }, { status: 400 });
        }

        if (newPassword.length < 8) {
            return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 });
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

        // 2. Initialize Supabase Admin client with the Service Role Key to bypass Auth/RLS restrictions
        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        });

        // 3. Verify caller role (Must be moderator, assistant_moderator, or changing their OWN password)
        const isSelf = user.id === id;

        const { data: callerData, error: roleError } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single();

        if (roleError || !callerData) {
            console.error('Error fetching caller role:', roleError);
            return NextResponse.json({ error: 'Unauthorized: Cannot verify user role' }, { status: 403 });
        }

        const isModerator = callerData.role === 'moderator' || callerData.role === 'assistant_moderator';

        if (!isSelf && !isModerator) {
            return NextResponse.json({ error: 'Forbidden: Insufficient privileges to change another user\'s password' }, { status: 403 });
        }

        // 4. Update the user's password in auth.users
        const { data, error } = await supabaseAdmin.auth.admin.updateUserById(
            id,
            { password: newPassword }
        );

        if (error) {
            console.error('Error updating user password in Supabase Auth:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: 'Password updated successfully', user: data.user }, { status: 200 });

    } catch (error) {
        console.error('Unexpected error during password update:', error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
