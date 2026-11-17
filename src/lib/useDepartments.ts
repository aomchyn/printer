"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Department } from "@/lib/departments";

type UseDepartmentsOptions = {
  includeInactive?: boolean;
};

export function useDepartments({
  includeInactive = false,
}: UseDepartmentsOptions = {}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const reload = useCallback(async () => {
    const result = await supabase
      .from("departments")
      .select(
        "id, code, name, value, is_active, is_system, sort_order, created_at, updated_at, created_by",
      )
      .order("sort_order", { ascending: true })
      .order("code", { ascending: true });

    if (result.error) {
      setError(result.error);
      setLoading(false);
      return;
    }

    setDepartments(
      (result.data ?? []).filter(
        (department) => includeInactive || department.is_active,
      ) as Department[],
    );
    setError(null);
    setLoading(false);
  }, [includeInactive]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      const result = await supabase
        .from("departments")
        .select(
          "id, code, name, value, is_active, is_system, sort_order, created_at, updated_at, created_by",
        )
        .order("sort_order", { ascending: true })
        .order("code", { ascending: true });

      if (!active) return;

      if (result.error) {
        setError(result.error);
        setLoading(false);
        return;
      }

      setDepartments(
        (result.data ?? []).filter(
          (department) => includeInactive || department.is_active,
        ) as Department[],
      );
      setError(null);
      setLoading(false);
    };

    void load();
    return () => {
      active = false;
    };
  }, [includeInactive]);

  return { departments, loading, error, reload };
}
