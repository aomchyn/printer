ALTER TABLE public.qa_department_requests
DROP CONSTRAINT IF EXISTS qa_department_requests_reviewed_by_fkey;

ALTER TABLE public.qa_department_requests
ADD CONSTRAINT qa_department_requests_reviewed_by_fkey
FOREIGN KEY (reviewed_by)
REFERENCES public.users(id)
ON DELETE SET NULL;