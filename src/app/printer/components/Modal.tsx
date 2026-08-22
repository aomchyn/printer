"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

interface ModalProps {
  id?: string;
  size?: "sm" | "md" | "lg" | "xl";
  title?: string;
  children: React.ReactNode;
  onClose: () => void;
}

const Modal = ({
  id,
  size = "md",
  title,
  children,
  onClose,
}: ModalProps) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleId = id ? `${id}-title` : "modal-title";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // ไม่ปิด Modal ถ้าคลิกอยู่บน SweetAlert2 popup
      const swalContainer = document.querySelector(".swal2-container");
      if (swalContainer && swalContainer.contains(target)) return;

      if (modalRef.current && !modalRef.current.contains(target)) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [onClose]);

  const sizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
    xl: "max-w-xl",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#00263A]/55 p-4 backdrop-blur-sm">
      <div
        ref={modalRef}
        id={id}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        className={`${sizeClasses[size]} flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border border-[#D9E1E2] bg-white shadow-2xl`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#D9E1E2] px-5 py-4 sm:px-6">
          <h3
            id={title ? titleId : undefined}
            className="text-lg font-black tracking-tight text-[#00263A]"
          >
            {title}
          </h3>

          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-[#8A9498] transition-colors hover:bg-[#FCEAEC] hover:text-[#C8102E] focus:outline-none focus:ring-2 focus:ring-[#0057B8]/25"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-5 py-4 text-[#101820] sm:px-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export default Modal;