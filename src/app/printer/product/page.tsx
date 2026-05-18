'use client'

import { useState, useEffect } from "react"
import Swal from "sweetalert2"
import Modal from "../components/Modal"
import { supabase } from "@/lib/supabase"
import { Search, Plus, X, Check, Edit2, Trash2, Package } from "lucide-react"
import { logAction } from "@/lib/logger"

export interface FgcodeInterface {
    id: string;
    name: string;
    exp: string;
}

export default function FgcodeManagement() {
    const [fgcodes, setFgcodes] = useState<FgcodeInterface[]>([])
    const [showModal, setShowModal] = useState(false)
    const [editingFgcode, setEditingFgcode] = useState<FgcodeInterface | null>(null)
    const [id, setId] = useState('')
    const [name, setName] = useState('')
    const [exp, setExp] = useState('')
    const [searchTerm, setSearchTerm] = useState('')
    const [userRole, setUserRole] = useState<string>('user')
    const [userName, setUserName] = useState('')
    const [employeeId, setEmployeeId] = useState('')
    const [saving, setSaving] = useState(false)

    const fetchUserRole = async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
            const { data } = await supabase.from('users').select('role, name, employee_id').eq('id', session.user.id).single()
            if (data) { setUserRole(data.role || 'user'); setUserName(data.name || ''); setEmployeeId(data.employee_id || '') }
        }
    }

    const fetchFgcodes = async () => {
        try {
            let allData: FgcodeInterface[] = []
            let from = 0; const pageSize = 1000; let hasMore = true
            while (hasMore) {
                const { data, error } = await supabase.from('fgcode').select('*').order('created_at', { ascending: false }).range(from, from + pageSize - 1)
                if (error) throw error
                if (data && data.length > 0) { allData = [...allData, ...data]; from += pageSize; hasMore = data.length === pageSize } else hasMore = false
            }
            setFgcodes(allData)
        } catch { Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถดึงข้อมูลรหัสสินค้าได้' }) }
    }

    useEffect(() => { fetchFgcodes(); fetchUserRole() }, [])

    const isAdminRole = userRole === 'moderator' || userRole === 'assistant_moderator'

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        const currentEditing = editingFgcode
        const cleanId = id.trim(); const cleanName = name.trim(); const cleanExp = exp.trim()
        if (!cleanId || !cleanName || !cleanExp) { Swal.fire({ icon: 'warning', title: 'ข้อมูลไม่ครบ', text: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' }); return }
        const thaiCharRegex = /[ก-๙]/
        if (thaiCharRegex.test(cleanId)) { await Swal.fire({ icon: 'warning', title: 'รหัสสินค้าไม่ถูกต้อง', text: 'รหัสสินค้าต้องเป็นภาษาอังกฤษ ตัวเลข หรือเครื่องหมายขีด (-) เท่านั้น', confirmButtonText: 'รับทราบ' }); setShowModal(true); return }
        if (!isAdminRole && thaiCharRegex.test(cleanName)) { await Swal.fire({ icon: 'warning', title: 'ไม่อนุญาตให้ใช้ภาษาไทย', text: 'ชื่อสินค้าภาษาไทยไม่อนุญาตให้ใช้', confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280' }); setShowModal(true); return }
        if (currentEditing) {
            if (cleanName === (currentEditing.name || '') && cleanExp === (currentEditing.exp || '') && cleanId === currentEditing.id) {
                await Swal.fire({ icon: 'info', title: 'ไม่มีการเปลี่ยนแปลง', text: 'คุณยังไม่ได้แก้ไขข้อมูลใดๆ', confirmButtonText: 'รับทราบ' })
                setEditingFgcode(currentEditing); setShowModal(true); return
            }
        }

        setSaving(true)
        try {
            if (currentEditing) {
                const idChanged = currentEditing.id !== cleanId
                if (idChanged) {
                    const { data: existingId } = await supabase.from('fgcode').select('id').eq('id', cleanId).single()
                    if (existingId) { await Swal.fire({ icon: 'error', title: 'รหัสสินค้าซ้ำ', text: `รหัส "${cleanId}" มีอยู่ในระบบแล้ว`, confirmButtonText: 'รับทราบ', confirmButtonColor: '#6b7280' }); setEditingFgcode(currentEditing); setId(cleanId); setName(cleanName); setExp(cleanExp); setShowModal(true); return }
                }
                const { error } = await supabase.from('fgcode').update({ name: cleanName, exp: cleanExp }).eq('id', currentEditing.id)
                if (error) throw error
                await logAction('UPDATE_PRODUCT', { id: currentEditing.id, name: cleanName, exp: cleanExp })
                if (idChanged) {
                    const { error: insertErr } = await supabase.from('fgcode').insert({ id: cleanId, name: cleanName, exp: cleanExp })
                    if (insertErr) throw insertErr
                    await supabase.from('orders').update({ product_id: cleanId }).eq('product_id', currentEditing.id)
                    await supabase.from('fgcode').delete().eq('id', currentEditing.id)
                    const { data: affectedOrders } = await supabase.from('orders').select('id').eq('product_id', cleanId)
                    const now = new Date().toISOString(); const editorName = employeeId ? `${userName} (${employeeId})` : userName
                    for (const o of affectedOrders || []) { await supabase.from('audit_logs').insert([{ order_id: o.id, action: 'UPDATE', user_name: editorName, summary: `รหัสสินค้าเปลี่ยน: ${currentEditing.id} ➡️ ${cleanId}`, created_at: now }]) }
                }
                const nameChanged = currentEditing.name !== cleanName; const expChanged = currentEditing.exp !== cleanExp
                if (nameChanged || expChanged) {
                    try {
                        const productIdToQuery = idChanged ? cleanId : currentEditing.id
                        const { data: allOrders, error: fetchError } = await supabase.from('orders').select('id, product_name, production_date, is_verified, is_cancelled').eq('product_id', productIdToQuery)
                        if (fetchError) console.error('Error fetching orders for sync:', fetchError)
                        const pendingOrders = (allOrders || []).filter(o => !o.is_verified && !o.is_cancelled)
                        if (pendingOrders.length > 0) {
                            const calculateExpiry = (mfgDate: string, shelfLife: string): string => {
                                if (!mfgDate || !shelfLife) return ''; try { const d = new Date(mfgDate); if (isNaN(d.getTime())) return ''; const months = parseInt(shelfLife.trim()); if (isNaN(months) || months <= 0) return ''; d.setMonth(d.getMonth() + months); return d.toISOString().split('T')[0] } catch { return '' }
                            }
                            let updatedCount = 0; const now = new Date().toISOString(); const editorName = employeeId ? `${userName} (${employeeId})` : userName
                            for (const order of pendingOrders) {
                                const updatePayload: Record<string, unknown> = { updated_at: now, updated_by: editorName }; const auditSummaries: string[] = []
                                if (nameChanged) { updatePayload.product_name = cleanName; updatePayload.previous_product_name = order.product_name; auditSummaries.push(`ชื่อสินค้าเปลี่ยน: ${order.product_name} ➡️ ${cleanName}`) }
                                if (expChanged) { const newExpiry = calculateExpiry(order.production_date, cleanExp); updatePayload.product_exp = cleanExp; updatePayload.expiry_date = newExpiry; updatePayload.edit_summary = `อัปเดตอายุผลิตภัณฑ์อัตโนมัติ โดย ${editorName}`; auditSummaries.push(`อายุผลิตภัณฑ์เปลี่ยน: ${currentEditing.exp} ➡️ ${cleanExp} เดือน`) }
                                const { error: updateError } = await supabase.from('orders').update(updatePayload).eq('id', order.id)
                                if (updateError) console.error(`Error updating order ${order.id}:`, updateError)
                                else { for (const summary of auditSummaries) { await supabase.from('audit_logs').insert([{ order_id: order.id, action: 'UPDATE', user_name: editorName, summary, created_at: now }]) }; updatedCount++ }
                            }
                            if (updatedCount > 0) {
                                const toastParts: string[] = []; if (nameChanged) toastParts.push('ชื่อสินค้า'); if (expChanged) toastParts.push('อายุผลิตภัณฑ์')
                                Swal.fire({ toast: true, position: 'top-end', icon: 'info', title: `📦 อัปเดต${toastParts.join(' และ ')}ในคำสั่งพิมพ์ ${updatedCount} รายการ`, showConfirmButton: false, timer: 3000, timerProgressBar: true })
                            }
                        }
                    } catch (syncError) { console.error('Error syncing orders:', syncError) }
                }
            } else {
                const { data: existing } = await supabase.from('fgcode').select('id').eq('id', cleanId).single()
                if (existing) { await Swal.fire({ icon: 'error', title: 'รหัสสินค้าซ้ำ', text: 'มีสินค้ารหัสนี้อยู่ในระบบเรียบร้อยแล้ว' }); setShowModal(true); return }
                const { error } = await supabase.from('fgcode').insert({ id: cleanId, name: cleanName, exp: cleanExp })
                if (error) throw error
                await logAction('CREATE_PRODUCT', { id: cleanId, name: cleanName, exp: cleanExp })
            }
            Swal.fire({ icon: 'success', title: 'สำเร็จ', text: `${currentEditing ? 'แก้ไข' : 'สร้าง'}รหัสสินค้าสำเร็จ`, timer: 1500, showConfirmButton: false })
            setShowModal(false); setEditingFgcode(null); setId(''); setName(''); setExp(''); fetchFgcodes()
        } catch (error) {
            Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: (error as Error).message || `ไม่สามารถ${editingFgcode ? 'แก้ไข' : 'สร้าง'}รหัสสินค้าได้` })
        } finally { setSaving(false) }
    }

    const handleEdit = (fgcode: FgcodeInterface) => { setEditingFgcode(fgcode); setId(fgcode.id || ''); setName(fgcode.name || ''); setExp(fgcode.exp || ''); setShowModal(true) }

    const handleDelete = async (rowId: string) => {
        const result = await Swal.fire({ title: 'ยืนยันการลบ', text: `คุณต้องการลบรหัสสินค้า ${rowId} ใช่หรือไม่?`, icon: 'warning', showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' })
        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('fgcode').delete().eq('id', rowId)
                if (error) throw error
                await logAction('DELETE_PRODUCT', { id: rowId })
                Swal.fire({ icon: 'success', title: 'ลบสำเร็จ', timer: 1500, showConfirmButton: false }); fetchFgcodes()
            } catch { Swal.fire({ icon: 'error', title: 'ผิดพลาด', text: 'ไม่สามารถลบรหัสสินค้าได้' }) }
        }
    }

    const filteredFgcodes = fgcodes.filter(f => f.id.toLowerCase().includes(searchTerm.toLowerCase()) || f.name.toLowerCase().includes(searchTerm.toLowerCase()))
    const inputCls = `w-full px-3.5 py-2.5 text-[13px] bg-white border border-[#d0daf0] rounded-lg text-[#0f1e3d] placeholder:text-slate-400 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-400 transition-all`

    return (
        <div className="min-h-screen bg-[#f4f7fc]" style={{
            backgroundImage: 'radial-gradient(ellipse at 0% 0%, rgba(59,102,199,0.07) 0%, transparent 60%), radial-gradient(ellipse at 100% 100%, rgba(107,56,202,0.05) 0%, transparent 60%)',
        }}>

            {/* ── Page header: light ── */}
            <div className="bg-white/80 backdrop-blur-md border-b border-[#dde8f5] px-4 py-3.5 flex items-center justify-between gap-3 sticky top-0 z-30">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1e3a8a] to-[#0f1e3d] text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-900/10 border border-blue-900/20">
                        <Package className="w-4.5 h-4.5 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-[#0f1e3d] font-black text-[18px] sm:text-[20px] md:text-[22px] leading-none tracking-wide truncate">จัดการรหัสสินค้า</h1>
                        <p className="text-slate-400 text-[11px] sm:text-[12px] font-medium hidden sm:block truncate mt-1">เพิ่ม · แก้ไข · ลบ รหัสและชื่อสินค้า</p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full shrink-0">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[10px] font-bold text-emerald-600 tracking-wide">เรียลไทม์</span>
                    </div>
                </div>
                <button
                    onClick={() => { setEditingFgcode(null); setId(''); setName(''); setExp(''); setShowModal(true) }}
                    className="flex items-center gap-1.5 bg-[#0f1e3d] hover:bg-[#152a54] text-white text-[12px] font-bold px-3.5 py-2 rounded-xl transition-all shadow-sm border border-[#0f1e3d]/10 active:scale-95 shrink-0"
                >
                    <Plus className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">เพิ่มรหัสสินค้า</span>
                    <span className="sm:hidden">เพิ่ม</span>
                </button>
            </div>

            <div className="p-3 sm:p-5 max-w-7xl mx-auto w-full">

                {/* ── Stat strip ── */}
                <div className="bg-gradient-to-br from-white to-blue-50/50 border border-[#dde8f5] rounded-2xl p-4 flex items-center gap-4 mb-5 shadow-sm hover:shadow-md transition-all duration-300">
                    <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center shrink-0 shadow-inner">
                        <Package className="w-5 h-5 text-blue-600" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-[#0f1e3d] tracking-tight">{fgcodes.length}</span>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">สินค้าทั้งหมดในระบบ</span>
                    </div>
                    {searchTerm && (
                        <div className="ml-auto flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50/80 px-3 py-1.5 rounded-xl border border-blue-100/50 shrink-0">
                            <Search className="w-3.5 h-3.5" /> พบ {filteredFgcodes.length} รายการที่ตรงกัน
                        </div>
                    )}
                </div>

                {/* ── Search bar ── */}
                <div className="relative mb-5">
                    <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                        type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        placeholder="ค้นหารหัส หรือชื่อสินค้า..."
                        className="w-full pl-11 pr-10 py-3 text-[13.5px] bg-white border border-[#dde8f5] rounded-2xl text-[#0f1e3d] placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all duration-200 shadow-sm hover:border-[#cbdbe5]"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>

                {/* ── Product List ── */}
                {filteredFgcodes.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-12 h-12 bg-white border border-[#dde8f5] rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm">
                            <Search className="w-5 h-5 text-slate-300" />
                        </div>
                        <p className="text-slate-400 text-sm">ไม่พบสินค้าที่ตรงกับการค้นหา</p>
                    </div>
                ) : (
                    <>
                        {/* Mobile view (cards) */}
                        <div className="space-y-3.5 md:hidden">
                            {filteredFgcodes.map(fgcode => {
                                const nameParts = fgcode.name.includes("/") 
                                    ? fgcode.name.split("/") 
                                    : fgcode.name.includes(",") 
                                        ? fgcode.name.split(",") 
                                        : [fgcode.name];
                                const mainName = nameParts[0].trim();
                                const subName = nameParts[1] ? nameParts[1].trim() : "";

                                return (
                                    <div key={fgcode.id} className="bg-gradient-to-br from-blue-50/90 to-indigo-50/30 border border-blue-200/80 border-l-4 border-l-blue-500 rounded-2xl px-4 py-3.5 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 shadow-md shadow-blue-900/5">
                                        <div className="flex items-start gap-3">
                                            <div className="w-10 h-10 min-w-[40px] rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center shadow-md mt-0.5 shrink-0">
                                                <span className="text-[8.5px] font-extrabold text-white text-center leading-tight px-1 break-all">{fgcode.id.slice(0, 8)}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-start justify-between gap-2 mb-1.5 flex-wrap">
                                                    <div className="flex flex-col min-w-0 flex-1">
                                                        <span className="text-[13.5px] font-bold text-[#0f1e3d] leading-snug">{mainName}</span>
                                                        {subName && (
                                                            <span className="text-[10px] text-slate-400 font-bold tracking-wide mt-0.5">📦 {subName}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg bg-blue-100/80 text-blue-700 border border-blue-200 tracking-wider shrink-0">{fgcode.id}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 mb-3.5">
                                                    <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-[10.5px] font-bold px-2.5 py-0.5 rounded-full text-emerald-600">
                                                        <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                                        อายุ {fgcode.exp} เดือน
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1.5 pt-2.5 border-t border-slate-200/50">
                                                    <button onClick={() => handleEdit(fgcode)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-700 hover:text-blue-600 text-[11.5px] font-semibold transition-all active:scale-95">
                                                        <Edit2 className="w-3 h-3" /> แก้ไข
                                                    </button>
                                                    {userRole !== 'user' && (
                                                        <button onClick={() => handleDelete(fgcode.id)} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50/30 text-slate-700 hover:text-red-600 text-[11.5px] font-semibold transition-all active:scale-95">
                                                            <Trash2 className="w-3 h-3" /> ลบ
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Desktop view (table) */}
                        <div className="hidden md:block bg-white border border-slate-200/80 rounded-2xl shadow-md shadow-blue-900/5 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50/80 border-b border-slate-200/80 text-slate-400 text-[11px] font-bold uppercase tracking-wider">
                                            <th className="py-4 px-6 font-black tracking-wider w-[240px]">รหัสสินค้า (Product ID)</th>
                                            <th className="py-4 px-6 font-black tracking-wider">รายละเอียดสินค้า (Product Details)</th>
                                            <th className="py-4 px-6 font-black tracking-wider w-[180px] text-center">อายุผลิตภัณฑ์ (Shelf Life)</th>
                                            <th className="py-4 px-6 font-black tracking-wider w-[190px] text-right">การจัดการ</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[#eef3fb] text-[13px] text-[#0f1e3d]">
                                        {filteredFgcodes.map((fgcode) => {
                                            const nameParts = fgcode.name.includes("/") 
                                                ? fgcode.name.split("/") 
                                                : fgcode.name.includes(",") 
                                                    ? fgcode.name.split(",") 
                                                    : [fgcode.name];
                                            const mainName = nameParts[0].trim();
                                            const subName = nameParts[1] ? nameParts[1].trim() : "";

                                            return (
                                                <tr key={fgcode.id} className="even:bg-white odd:bg-slate-50/50 hover:bg-blue-50/40 transition-colors duration-150">
                                                    <td className="py-4 px-6">
                                                        <span className="inline-flex items-center gap-1.5 bg-blue-50/80 text-blue-700 font-mono font-bold px-2.5 py-1 rounded-lg border border-blue-100/70 tracking-wider text-[11.5px] shadow-sm shadow-blue-900/5">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                                            {fgcode.id}
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-[#0f1e3d] text-[13.5px] leading-tight">{mainName}</span>
                                                            {subName && (
                                                                <span className="text-[10.5px] text-slate-400 font-semibold tracking-wide mt-1">
                                                                    📦 {subName}
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="py-4 px-6 text-center">
                                                        <span className="inline-flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/20 text-[11.5px] font-bold px-3 py-1 rounded-full text-emerald-600 shadow-sm">
                                                            <span className="w-1 h-1 rounded-full bg-emerald-500" />
                                                            {fgcode.exp} เดือน
                                                        </span>
                                                    </td>
                                                    <td className="py-4 px-6 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <button onClick={() => handleEdit(fgcode)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-blue-300 hover:bg-blue-50/30 text-slate-700 hover:text-blue-600 text-[12px] font-bold transition-all active:scale-95">
                                                                <Edit2 className="w-3.5 h-3.5" /> แก้ไข
                                                            </button>
                                                            {userRole !== 'user' && (
                                                                <button onClick={() => handleDelete(fgcode.id)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-red-300 hover:bg-red-50/30 text-slate-700 hover:text-red-600 text-[12px] font-bold transition-all active:scale-95">
                                                                    <Trash2 className="w-3.5 h-3.5" /> ลบ
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* ── Modal ── */}
            {showModal && (
                <Modal id="fgcode-modal" title={editingFgcode ? 'แก้ไขรหัสสินค้า' : 'เพิ่มรหัสสินค้าใหม่'} onClose={() => { setShowModal(false); setEditingFgcode(null); setId(''); setName(''); setExp('') }} size="md">
                    <div className="bg-[#f5f8ff] -mx-6 -mb-6 px-6 pb-6 rounded-b-2xl">
                        <form onSubmit={handleSubmit} className="pt-4 space-y-4">
                            <div>
                                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">รหัสสินค้า <span className="text-red-500">*</span></label>
                                <input type="text" className={inputCls} value={id} onChange={e => setId(e.target.value.toUpperCase())} placeholder="เช่น 01-1-001 หรือ FG-001" required disabled={!!editingFgcode && !isAdminRole} />
                                {editingFgcode && !isAdminRole && <small className="text-slate-400 mt-1 block">ไม่สามารถแก้ไขรหัสสินค้าได้</small>}
                                {editingFgcode && isAdminRole && <small className="text-amber-600 mt-1 block">⚠️ การเปลี่ยนรหัสสินค้าจะอัปเดตคำสั่งพิมพ์ทั้งหมดที่เกี่ยวข้อง</small>}
                            </div>
                            <div>
                                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">
                                    ชื่อสินค้า <span className="text-red-500">*</span>
                                    {!isAdminRole && <span className="text-[10px] text-slate-400 ml-1 normal-case">(ภาษาอังกฤษเท่านั้น)</span>}
                                </label>
                                <input type="text" className={inputCls} value={name} onChange={e => { const v = e.target.value; if (!isAdminRole) setName(v.replace(/[ก-๙]/g, '').toUpperCase()); else setName(v.toUpperCase()) }} placeholder={isAdminRole ? "ชื่อสินค้า (ภาษาไทยหรืออังกฤษ)" : "เช่น TEST 25KG."} required />
                                {!isAdminRole && <p className="mt-1.5 text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">⚠️ สิทธิ์ของคุณอนุญาตให้ใช้ภาษาอังกฤษและตัวเลขเท่านั้น</p>}
                            </div>
                            <div>
                                <label className="block mb-1.5 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">อายุผลิตภัณฑ์ (เดือน) <span className="text-red-500">*</span></label>
                                <input type="number" min="0" className={inputCls} value={exp} onChange={e => setExp(e.target.value)} placeholder="เช่น 12" required />
                            </div>
                            <div className="border-t border-[#e8eef8] pt-4 flex justify-end gap-3">
                                <button type="button" onClick={() => { setShowModal(false); setEditingFgcode(null); setId(''); setName(''); setExp('') }} className="flex items-center gap-2 px-5 py-2.5 bg-white hover:bg-slate-50 border border-[#d0daf0] text-slate-600 font-semibold rounded-lg text-[13px] transition-all">
                                    <X className="w-4 h-4" /> ยกเลิก
                                </button>
                                <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 disabled:opacity-60 text-white font-semibold rounded-lg text-[13px] shadow-lg shadow-blue-500/20 transition-all active:scale-95">
                                    {saving ? (<><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg> กำลังบันทึก...</>) : (<><Check className="w-4 h-4" /> {editingFgcode ? 'บันทึกการแก้ไข' : 'สร้างสินค้า'}</>)}
                                </button>
                            </div>
                        </form>
                    </div>
                </Modal>
            )}
        </div>
    )
}