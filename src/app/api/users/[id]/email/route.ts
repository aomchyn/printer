import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }  // ✅ async params
) {
    try {
        const { id } = await params  // ✅ await

        // Validate UUID
        const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        if (!UUID_REGEX.test(id)) {
            return NextResponse.json({ error: 'Invalid user ID format' }, { status: 400 })
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
        const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 })
        }

        // Verify caller token
        const authHeader = req.headers.get('Authorization')
        const token = authHeader?.replace('Bearer ', '')
        if (!token) return NextResponse.json({ error: 'Unauthorized: Missing token' }, { status: 401 })

        const supabaseUserClient = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { auth: { persistSession: false } }
        )

        const { data: { user }, error: userError } = await supabaseUserClient.auth.getUser(token)
        if (userError || !user) {
            return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 401 })
        }

        const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        })

        // Verify caller is moderator
        const { data: callerData, error: roleError } = await supabaseAdmin
            .from('users')
            .select('role')
            .eq('id', user.id)
            .single()

        if (roleError || !callerData) {
            return NextResponse.json({ error: 'Unauthorized: Cannot verify user role' }, { status: 403 })
        }

        const isModerator = ['moderator', 'assistant_moderator'].includes(callerData.role)
        if (!isModerator) {
            return NextResponse.json({ error: 'Forbidden: Insufficient privileges' }, { status: 403 })
        }

        const { newEmail } = await req.json()
        if (!newEmail) return NextResponse.json({ error: 'newEmail is required' }, { status: 400 })

        // Validate email format
        const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!EMAIL_REGEX.test(newEmail)) {
            return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
        }

        // 1. อัปเดตใน auth.users
        const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(
            id,  // ✅ ใช้ id ที่ await แล้ว
            { email: newEmail }
        )
        if (authUpdateError) {
            return NextResponse.json({ error: authUpdateError.message }, { status: 500 })
        }

        // 2. อัปเดตใน public.users
        const { error: dbError } = await supabaseAdmin
            .from('users')
            .update({ email: newEmail })
            .eq('id', id)  // ✅
        if (dbError) {
            return NextResponse.json({ error: dbError.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, message: 'Email updated successfully' })

    } catch (error) {
        console.error('Unexpected error during email update:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}