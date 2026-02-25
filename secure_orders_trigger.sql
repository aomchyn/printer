-- Security Patch: Prevent spoofing of order creator details

-- 1. Create a function that automatically fills in created_by and created_by_department
CREATE OR REPLACE FUNCTION set_order_creator()
RETURNS TRIGGER AS $$
DECLARE
    user_name TEXT;
    user_dept TEXT;
BEGIN
    -- Only override if the user is authenticated (bypasses service role tasks if needed)
    IF auth.role() = 'authenticated' THEN
        -- Look up the actual name and department from public.users using their auth token
        SELECT name, department INTO user_name, user_dept 
        FROM public.users 
        WHERE id = auth.uid();
        
        -- Override whatever the client sent with the trusted database values
        NEW.created_by := COALESCE(user_name, 'Unknown User');
        NEW.created_by_department := COALESCE(user_dept, 'ไม่ระบุหน่วยงาน');
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Attach the trigger to the orders table before every INSERT
DROP TRIGGER IF EXISTS ensure_order_creator ON public.orders;
CREATE TRIGGER ensure_order_creator
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION set_order_creator();
