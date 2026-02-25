'use client'

import { useState, useEffect } from "react"
import Swal from "sweetalert2"
import Modal from "../components/Modal"
import { supabase } from "@/lib/supabase"
import { Search, Plus, X, Check, Edit2, Trash2 } from "lucide-react"

export interface FgcodeInterface {
    id: string; // e.g. FG-1001
    name: string;
    exp: string;
    category?: string;
}

export default function FgcodeManagement() {
    const [fgcodes, setFgcodes] = useState<FgcodeInterface[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editingFgcode, setEditingFgcode] = useState<FgcodeInterface | null>(null);
    const [id, setId] = useState('');
    const [name, setName] = useState('');
    const [exp, setExp] = useState('');
    const [category, setCategory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        fetchFgcodes()
    }, [])

    const fetchFgcodes = async () => {
        try {
            const { data, error } = await supabase.from('fgcode').select('*').order('created_at', { ascending: false });
            if (error) throw error;
            if (data) {
                setFgcodes(data);
            }
        } catch {
            Swal.fire({
                icon: 'error',
                title: 'ผิดพลาด',
                text: 'ไม่สามารถดึงข้อมูลรหัสสินค้าได้'
            })
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!id.trim() || !name.trim() || !exp.trim()) {
            Swal.fire({
                icon: 'warning',
                title: 'ข้อมูลไม่ครบ',
                text: 'กรุณากรอกข้อมูลให้ครบทุกช่อง'
            });
            return;
        }

        try {
            if (editingFgcode) {
                // แก้ไข
                const { error } = await supabase.from('fgcode').update({
                    name: name,
                    exp: exp,
                    category: category || null
                }).eq('id', editingFgcode.id);

                if (error) throw error;
            } else {
                // เพิ่มใหม่ (ตรวจสอบซ้ำ)
                const { data: existing } = await supabase.from('fgcode').select('id').eq('id', id).single();
                if (existing) {
                    Swal.fire({
                        icon: 'error',
                        title: 'รหัสสินค้าซ้ำ',
                        text: 'มีสินค้ารหัสนี้อยู่ในระบบเรียบร้อยแล้ว'
                    });
                    return;
                }

                const { error } = await supabase.from('fgcode').insert({
                    id: id,
                    name: name,
                    exp: exp,
                    category: category || null
                });

                if (error) throw error;
            }

            Swal.fire({
                icon: 'success',
                title: 'สำเร็จ',
                text: `${editingFgcode ? 'แก้ไข' : 'สร้าง'}รหัสสินค้าสำเร็จ`,
                timer: 1500,
                showConfirmButton: false
            });

            // ปิด Modal และรีเซ็ตฟอร์ม
            setShowModal(false);
            setEditingFgcode(null);
            setId('');
            setName('');
            setExp('');
            setCategory('');

            fetchFgcodes();

        } catch (error) {
            const errorObj = error as Error;
            Swal.fire({
                icon: 'error',
                title: 'ผิดพลาด',
                text: errorObj.message || `ไม่สามารถ${editingFgcode ? 'แก้ไข' : 'สร้าง'}รหัสสินค้าได้`
            });
        }
    };

    const handleEdit = (fgcode: FgcodeInterface) => {
        setEditingFgcode(fgcode);
        setId(fgcode.id || '');
        setName(fgcode.name || '');
        setExp(fgcode.exp || '');
        setCategory(fgcode.category || '');
        setShowModal(true);
    };

    const handleDelete = async (rowId: string) => {
        const result = await Swal.fire({
            title: 'ยืนยันการลบ',
            text: `คุณต้องการลบรหัสสินค้า ${rowId} ใช่หรือไม่?`,
            icon: 'warning',
            showCancelButton: true,
            confirmButtonColor: '#d33',
            cancelButtonColor: '#3085d6',
            confirmButtonText: 'ลบ',
            cancelButtonText: 'ยกเลิก'
        })

        if (result.isConfirmed) {
            try {
                const { error } = await supabase.from('fgcode').delete().eq('id', rowId);
                if (error) throw error;

                Swal.fire({
                    icon: 'success',
                    title: 'ลบสำเร็จ',
                    timer: 1500,
                    showConfirmButton: false
                })

                fetchFgcodes()
            } catch {
                Swal.fire({
                    icon: 'error',
                    title: 'ผิดพลาด',
                    text: 'ไม่สามารถลบรหัสสินค้าได้'
                })
            }
        }
    }

    const filteredFgcodes = fgcodes.filter(fgcode =>
        fgcode.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fgcode.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const getCategoryBadge = (cat?: string) => {
        if (!cat) return null;

        let bgColor = '';
        let textColor = '';
        let borderColor = '';

        switch (cat) {
            case 'มีทะเบียน / FAMI-QS':
            case 'มีทะเบียน':
            case 'มีทะเบียน / GHPs-HACCP':
                bgColor = 'bg-green-100';
                textColor = 'text-green-800';
                borderColor = 'border-green-200';
                break;
            case 'สินค้าภายใน / สินค้าคุณหมอเอ':
                bgColor = 'bg-red-100';
                textColor = 'text-red-800';
                borderColor = 'border-red-200';
                break;
            case 'วัตถุดิบ':
                bgColor = 'bg-purple-100';
                textColor = 'text-purple-800';
                borderColor = 'border-purple-200';
                break;
            default:
                bgColor = 'bg-gray-100';
                textColor = 'text-gray-800';
                borderColor = 'border-gray-200';
        }

        return (
            <span className={`px-3 py-1 ${bgColor} ${textColor} rounded-full text-xs font-bold border ${borderColor}`}>
                {cat}
            </span>
        );
    };

    return (
        <div className="container mx-auto p-4 text-gray-800">
            <h1 className="text-3xl sm:text-4xl font-extrabold mb-6 text-blue-900 tracking-tight text-center sm:text-left drop-shadow-sm">
                จัดการรหัสสินค้า
            </h1>
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <div className="relative w-full sm:w-1/2 md:w-1/3">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className="text-gray-400 w-5 h-5 absolute left-3 top-3.5" />
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="ค้นหารหัส หรือชื่อสินค้า..."
                        className="w-full pl-10 pr-4 py-2.5 bg-white/95 border border-white/20 rounded-lg text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                    />
                    {searchTerm && (
                        <button
                            onClick={() => setSearchTerm('')}
                            className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                        >
                            <X className="w-5 h-5" />
                        </button>
                    )}
                </div>

                <button
                    onClick={() => {
                        setEditingFgcode(null)
                        setId('')
                        setName('')
                        setExp('')
                        setCategory('')
                        setShowModal(true)
                    }}
                    className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-semibold py-2.5 px-6 rounded-lg transition duration-200 flex items-center justify-center shadow-lg transform hover:scale-105 shrink-0"
                >
                    <Plus className="mr-2 w-5 h-5" /> เพิ่มรายการสินค้า
                </button>
            </div>

            <div className="bg-white/95 backdrop-blur-xl shadow-2xl rounded-2xl overflow-hidden border border-white/20 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-md">
                        <tr>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white uppercase tracking-wider">รหัสสินค้า</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white uppercase tracking-wider">รายการสินค้า</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white uppercase tracking-wider">กลุ่มสินค้า</th>
                            <th className="px-6 py-4 text-left text-sm font-bold text-white uppercase tracking-wider">อายุผลิตภัณฑ์</th>
                            <th className="px-6 py-4 text-right text-sm font-bold text-white uppercase tracking-wider">
                                จัดการ
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredFgcodes.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                    <div className="flex flex-col items-center">
                                        <svg className="w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 12H4M12 4v16" />
                                        </svg>
                                        <span className="text-lg">ไม่มีข้อมูลสินค้า กรุณาเพิ่มรายการ</span>
                                    </div>
                                </td>
                            </tr>
                        ) : (
                            filteredFgcodes.map((fgcode, index) => (
                                <tr
                                    key={fgcode.id}
                                    className={`
                                        ${index % 2 === 0 ? 'bg-white' : 'bg-blue-50'} 
                                        hover:bg-blue-100 transition-colors duration-200 border-b border-gray-200 last:border-0
                                    `}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-900">
                                        {fgcode.id}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                        {fgcode.name}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                        {getCategoryBadge(fgcode.category)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                                        <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold border border-blue-200">
                                            {fgcode.exp}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleEdit(fgcode)}
                                            className="text-white bg-indigo-500 hover:bg-indigo-600 p-2.5 rounded-xl transition-colors shadow-md hover:shadow-lg mr-2"
                                            title="แก้ไข"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button
                                            onClick={() => handleDelete(fgcode.id)}
                                            className="text-white bg-red-500 hover:bg-red-600 p-2.5 rounded-xl transition-colors shadow-md hover:shadow-lg"
                                            title="ลบ"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {showModal && (
                <Modal
                    id="fgcode-modal"
                    title={editingFgcode ? 'แก้ไขรหัสสินค้า' : 'เพิ่มรหัสสินค้าใหม่'}
                    onClose={() => {
                        setShowModal(false)
                        setEditingFgcode(null)
                        setId('')
                        setName('')
                        setExp('')
                        setCategory('')
                    }}
                    size="md">
                    <form onSubmit={handleSubmit}>
                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">
                                รหัสสินค้า <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300 disabled:bg-gray-100 disabled:text-gray-500"
                                value={id}
                                onChange={e => setId(e.target.value)}
                                placeholder="เช่น 01-1-001"
                                required
                                disabled={!!editingFgcode}
                            />
                            {editingFgcode && (
                                <small className="text-gray-500 mt-1 block">
                                    ไม่สามารถแก้ไขรหัสสินค้าได้
                                </small>
                            )}
                        </div>

                        <div className="mb-4">
                            <label className="block mb-2 font-semibold text-gray-700">
                                ชื่อสินค้า <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                placeholder="เช่น Test 25Kg."
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block mb-2 font-semibold text-gray-700">
                                อายุผลิตภัณฑ์ <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={exp}
                                onChange={e => setExp(e.target.value)}
                                placeholder="เช่น 12 เดือนหรือ 2 ปี"
                                required
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block mb-2 font-semibold text-gray-700">
                                กลุ่มสินค้า <span className="text-gray-400 text-sm font-normal">(ไม่บังคับ)</span>
                            </label>
                            <select
                                className="w-full form-input-dark !bg-white !text-gray-900 focus:ring-2 focus:ring-blue-400 !border-gray-300"
                                value={category}
                                onChange={e => setCategory(e.target.value)}
                            >
                                <option value="">ไม่ได้ระบุ</option>
                                <option value="มีทะเบียน / FAMI-QS">มีทะเบียน / FAMI-QS</option>
                                <option value="มีทะเบียน">มีทะเบียน</option>
                                <option value="สินค้าภายใน / สินค้าคุณหมอเอ">สินค้าภายใน / สินค้าคุณหมอเอ</option>
                                <option value="มีทะเบียน / GHPs-HACCP">มีทะเบียน / GHPs-HACCP</option>
                                <option value="วัตถุดิบ">วัตถุดิบ</option>
                            </select>
                        </div>

                        <div className="flex justify-end gap-3 mt-4">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowModal(false)
                                    setEditingFgcode(null)
                                    setId('')
                                    setName('')
                                    setExp('')
                                    setCategory('')
                                }}
                                className="px-5 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg transition-colors">
                                <X className="mr-2 w-4 h-4" /> ยกเลิก
                            </button>

                            <button
                                type="submit"
                                className="px-5 py-2.5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg shadow-lg transition-transform hover:scale-105">
                                <Check className="mr-2 w-4 h-4" />
                                {editingFgcode ? 'บันทึกการแก้ไข' : 'สร้างสินค้า'}
                            </button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
