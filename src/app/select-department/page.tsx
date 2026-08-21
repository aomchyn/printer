"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

const NORMAL_DEPARTMENTS = [
  "PD ฝ่ายผลิต",
  "WH คลังสินค้า",
  "VD ผลิตยาสัตว์",
] as const;

export default function SelectDepartmentPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pendingQa, setPendingQa] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;

    const load = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("users")
        .select("role, department")
        .eq("id", user.id)
        .single();

      if (profileError || !profile) {
        setMessage("ไม่พบข้อมูลผู้ใช้");
        setLoading(false);
        return;
      }

      if (profile.role !== "user") {
        router.replace("/printer/dashboard");
        return;
      }

      // ถ้ามีแผนกแล้ว ไม่ต้องเลือกซ้ำ
      if (profile.department) {
        router.replace("/printer/dashboard");
        return;
      }

      const { data: request, error: requestError } = await supabase
        .from("qa_department_requests")
        .select("id, status")
        .eq("user_id", user.id)
        .eq("status", "pending")
        .maybeSingle();

      if (!active) return;

      if (!requestError && request) {
        setPendingQa(true);
      }

      setLoading(false);
    };

    load();

    return () => {
      active = false;
    };
  }, [router]);

  const chooseDepartment = async (department: string) => {
    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc(
      "choose_google_department",
      {
        p_department: department,
      },
    );

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    router.replace("/printer/dashboard");
  };

  const requestQa = async () => {
    setSaving(true);
    setMessage("");

    const { error } = await supabase.rpc(
      "request_google_qa_department",
    );

    if (error) {
      setMessage(error.message);
      setSaving(false);
      return;
    }

    setPendingQa(true);
    setSaving(false);
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  };

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <p>กำลังตรวจสอบข้อมูล...</p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div>
          <h1 style={styles.title}>เลือกหน่วยงาน</h1>
          <p style={styles.subtitle}>
            กรุณาเลือกหน่วยงานก่อนเริ่มใช้งานระบบ
          </p>
        </div>

        {pendingQa ? (
          <div style={styles.pendingBox}>
            <strong>คำขอ QA อยู่ระหว่างรออนุมัติ</strong>
            <p style={styles.pendingText}>
              Moderator ต้องอนุมัติก่อนจึงจะได้รับสิทธิหน่วยงาน QA
            </p>
          </div>
        ) : (
          <div style={styles.list}>
            {NORMAL_DEPARTMENTS.map((department) => (
              <button
                key={department}
                type="button"
                disabled={saving}
                onClick={() => chooseDepartment(department)}
                style={styles.button}
              >
                {department}
              </button>
            ))}

            <button
              type="button"
              disabled={saving}
              onClick={requestQa}
              style={styles.qaButton}
            >
              QA ประกันคุณภาพ
              <span style={styles.qaNote}>
                ต้องได้รับการอนุมัติจาก Moderator
              </span>
            </button>
          </div>
        )}

        {message && (
          <p style={styles.error}>
            {message}
          </p>
        )}

        <button
          type="button"
          onClick={signOut}
          style={styles.logout}
        >
          ออกจากระบบ
        </button>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    display: "grid",
    placeItems: "center",
    padding: "24px",
    background: "#f4f6fa",
    fontFamily: "Kanit, sans-serif",
  },

  card: {
    width: "100%",
    maxWidth: "520px",
    padding: "32px",
    borderRadius: "22px",
    background: "#ffffff",
    boxShadow: "0 20px 60px rgba(0,0,0,0.10)",
  },

  title: {
    margin: 0,
    fontSize: "1.7rem",
  },

  subtitle: {
    marginTop: "8px",
    marginBottom: "28px",
    color: "#667085",
  },

  list: {
    display: "grid",
    gap: "12px",
  },

  button: {
    width: "100%",
    minHeight: "54px",
    padding: "12px 16px",
    border: "1px solid #d0d5dd",
    borderRadius: "12px",
    background: "#fff",
    fontSize: "1rem",
    fontFamily: "inherit",
    cursor: "pointer",
  },

  qaButton: {
    width: "100%",
    minHeight: "68px",
    padding: "12px 16px",
    border: "1px solid #3157d5",
    borderRadius: "12px",
    background: "#eef3ff",
    fontSize: "1rem",
    fontFamily: "inherit",
    cursor: "pointer",
    display: "grid",
    gap: "3px",
  },

  qaNote: {
    fontSize: "0.75rem",
    color: "#667085",
  },

  pendingBox: {
    padding: "20px",
    borderRadius: "14px",
    background: "#fff7e6",
    border: "1px solid #ffd591",
  },

  pendingText: {
    marginBottom: 0,
    color: "#667085",
  },

  error: {
    marginTop: "16px",
    color: "#b42318",
  },

  logout: {
    width: "100%",
    marginTop: "24px",
    border: 0,
    background: "transparent",
    color: "#667085",
    cursor: "pointer",
    fontFamily: "inherit",
  },
};