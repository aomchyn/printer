import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

async function testDelete() {
    // get a user to delete or just try to get the users list and delete one that perhaps causes error
    // For now let's just fetch users
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    console.log("Users:", users?.users.map(u => ({ id: u.id, email: u.email })));
}

testDelete();
