# 🖨️ Printer Management System

ระบบจัดเรียงและบริหารจัดการงานพิมพ์ (Printer Management Dashboard) ที่พัฒนาด้วย **Next.js 16 (App Router)** ตัวระบบถูกออกแบบมาเพื่อให้ง่ายต่อการจัดการออเดอร์, สินค้า, ผู้ใช้งาน และดูสถิติภาพรวมข้อมูล ควบคู่กับฐานข้อมูลและระบบยืนยันตัวตนจาก **Supabase**

## ✨ ฟีเจอร์หลัก (Key Features)

*   📊 **Dashboard & Statistics** - สรุปภาพรวมและสถิติข้อมูลแผงควบคุมหลัก มีกราฟแสดงผลสวยงามด้วย `Recharts`
*   📦 **Product Management** - จัดการข้อมูลสินค้าต่างๆ ในระบบ
*   🛒 **Order Management** - จัดการออเดอร์งานพิมพ์และดูประวัติการสั่งทำงานต่างๆ
*   👥 **User Management** - จัดการรายชื่อผู้ใช้ สิทธิ์เข้าใช้งาน และอัปเดตรหัสผ่าน/อีเมล
*   📝 **Log System** - จัดเก็บและดูประวัติการใช้งานระบบ (Printer Logs / Edit History)
*   🗑️ **Trash Management** - ระบบกู้คืนหรือลบข้อมูลถาวร
*   📄 **Export Data** - รองรับการ Export ข้อมูลหรือรายงานเป็น PDF (`jspdf`) และ Excel (`exceljs`)

## 🛠️ เทคโนโลยีที่ใช้ (Tech Stack)

*   **Framework:** [Next.js](https://nextjs.org/) (Version 16 - App Router)
*   **UI Library:** [React](https://react.dev/) (Version 19)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) (Version 4)
*   **Backend & DB:** [Supabase](https://supabase.com/) (PostgreSQL & Auth)
*   **Icons:** [Lucide React](https://lucide.dev/)
*   **Charts:** [Recharts](https://recharts.org/)
*   **Alerts/Modals:** [SweetAlert2](https://sweetalert2.github.io/)

## 📂 โครงสร้างโปรเจกต์ (Project Structure)

```text
src/
 ┣ app/
 ┃ ┣ api/                 # Backend API routes (ออเดอร์, ผู้ใช้)
 ┃ ┣ login/               # หน้า Login สำหรับระบบ
 ┃ ┣ printer/             # Dashboard หลัก และระบบจัดการต่างๆ
 ┃ ┃ ┣ dashboard/         # หน้าแสดงผลภาพรวม (Dashboard)
 ┃ ┃ ┣ logs/              # หน้าบันทึกระบบและประวัติการทำงาน
 ┃ ┃ ┣ order/             # หน้าติดตามและจัดการออเดอร์
 ┃ ┃ ┣ product/           # หน้าจัดการข้อมูลสินค้า
 ┃ ┃ ┣ statistics/        # หน้าดูสถิติ
 ┃ ┃ ┣ trash/             # หน้าการจัดการขยะ/สิ่งที่ลบ
 ┃ ┃ ┗ user/              # หน้าจัดการข้อมูลผู้ใช้งาน
 ┃ ┗ globals.css          # ไฟล์ CSS หลักและ Tailwind
 ┗ lib/
   ┣ logger.ts            # Utility จัดการ Logs
   ┗ supabase.ts          # การตั้งค่า/เชื่อมต่อ Supabase Client
```



## 📦 แพ็กเกจที่สำคัญ (Dependencies)

*   `@supabase/supabase-js` / `@supabase/ssr`: จัดการฐานข้อมูลและเซสชั่นผู้ใช้
*   `react`, `next`: Library แถวหน้าสำหรับการทำฝั่ง UI และ Server rendering
*   `recharts`: สำหรับแสดงผลชาร์ตที่หน้า Dashboard และหน้า Statistics
*   `sweetalert2`: แสดง Pop-up Alert สวยๆ ให้กับผู้ใช้งาน
*   `jsPDF`, `html2canvas`, `exceljs`: สำหรับฟีเจอร์การดึงไฟล์รายงานออกจากระบบ
