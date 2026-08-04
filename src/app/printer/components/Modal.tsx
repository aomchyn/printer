'use client'

import { useEffect, useRef } from "react"
import { X } from "lucide-react"

interface ModalProps {
    id?: string
    size?: 'sm' | 'md' | 'lg' | 'xl'
    title?: string
    children: React.ReactNode
    onClose: () => void
}

const Modal = ({ id, size = 'md', title, children, onClose }: ModalProps) => {
    const modalRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose()
            }
        }

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node
            // ไม่ปิด Modal ถ้าคลิกอยู่บน SweetAlert2 popup
            const swalContainer = document.querySelector('.swal2-container')
            if (swalContainer && swalContainer.contains(target)) return

            if (modalRef.current && !modalRef.current.contains(target)) {
                onClose()
            }
        }

        document.addEventListener('keydown', handleEscape)
        document.addEventListener('mousedown', handleClickOutside)

        return () => {
            document.removeEventListener('keydown', handleEscape)
            document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [onClose])

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl'
    }

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-center items-center p-4">
            <div
                ref={modalRef}
                id={id}
                className={`${sizeClasses[size]} w-full bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh]`}
            >
                <div className="border-b px-6 py-4 flex justify-between items-center text-black shrink-0">
                    <h3 className="text-xl font-bold">
                        {title}
                    </h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 focus:outline-none transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>
                <div className="px-6 py-4 text-black overflow-y-auto min-h-0">
                    {children}
                </div>
            </div>
        </div>
    )
}

export default Modal
