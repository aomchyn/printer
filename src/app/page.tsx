"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();

      if (session) {
        router.push("/printer/dashboard");
      } else {
        router.push("/login");
      }
    };

    checkUser();
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-[var(--bg-color)] text-[var(--primary)]">
      <Loader2 className="animate-spin" size={48} />
    </main>
  );
}
