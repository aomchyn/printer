import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

async function test() {
    const { data: users, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) { console.error("list error", error); return; }
    
    // Pick a test user or just a dummy UUID to see if we get a specific error
    // Let's try to delete a fake user and see if it gives UUID error
    const { data, error: delError } = await supabaseAdmin.auth.admin.deleteUser('00000000-0000-0000-0000-000000000000');
    console.log("Delete test:", delError ? delError.message : "Success");
}
test();
