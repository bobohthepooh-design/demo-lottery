# Admin UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ยกระดับหน้า admin ทั้ง 8 ด้าน — mobile nav, table filters, loading states, command palette, style consistency, toast coverage, auto-refresh, CSV export

**Architecture:** React 18 + Vite + Tailwind JSX (ไม่มี TS) + shadcn components ที่ `client/src/components/shadcn/` — แก้ใน `client/src/admin/` + `client/src/components/` เท่านั้น, ไม่มี backend change (ยกเว้นไม่มี), verify ด้วย `cd client && npm run build` + CDP DOM check + code review ทุก task

**Tech Stack:** React, react-router-dom (`useSearchParams`, `NavLink`), shadcn Sheet/Dialog/Input, Tailwind arbitrary properties `[prop:value]`

**Spec:** รายการ 8 ข้อที่ user อนุมัติ (mobile drawer, table UX, skeletons, Ctrl+K palette, CSS vars, toast coverage, overview refresh, CSV export)

## Global Constraints

- ภาษา UI: **ไทยเป็นหลัก**; error messages จาก backend เป็นไทยอยู่แล้ว — toast/label ใหม่ต้องเป็นไทย
- ห้ามแตะ business logic server — admin frontend เท่านั้น
- ทุก visual change ต้องไม่ทำ layout เดิมพัง — mobile drawer ต้องไม่กระทบ desktop (`lg:` breakpoint)
- `prefers-reduced-motion` ต้องถูกเคารพสำหรับ animation ใหม่
- ห้าม commit ไฟล์ที่ไม่เกี่ยว / secrets; commit message conventional + trailer `Generated with [Devin]` + `Co-Authored-By: Devin <158243242+devin-ai-integration[bot]@users.noreply.github.com>`
- หลังแต่ละ task: `cd client && npm run build` ต้องผ่าน + **request code review** (subagent) ก่อน commit
- ห้าม deploy docker ระหว่าง task — deploy รวมครั้งเดียวตอนจบทุก task (หรือเมื่อ user สั่ง)

## Review Focus

- Drawer mobile ต้องปิดเมื่อเปลี่ยนหน้า + lock body scroll + กด Esc ออก
- URL filters ต้องไม่ทำให้ refresh แล้ว State หาย หรือ share link แล้วเห็นข้อมูลคนละชุด
- Command palette ต้องไม่ trigger ตอนพิมพ์ใน input และต้อง filter ตาม permission
- CSV export ต้อง escape comma/quote/newline ในข้อมูลไทยและตัวเลข
- Overview auto-refresh ต้องหยุดเมื่อ tab ซ่อน (`document.hidden`) ไม่ให้ยิง API รัว
- Toast ห้ามโชว์ error เดิมซ้ำถ้า backend message เป็นภาษาไทยอยู่แล้ว (ใช้ message ตรงๆ)

---

### Task 1: Mobile admin navigation drawer

**Files:**
- Modify: `client/src/admin/AdminLayout.jsx`
- Modify: `client/src/index.css` (เพิ่ม keyframes drawer ถ้าจำเป็น — Sheet มี animation ในตัว)

**Interfaces:**
- Consumes: `visibleGroups` (มีอยู่แล้ว), `Sheet/SheetContent/SheetHeader/SheetTitle` จาก `../components/shadcn/sheet.jsx`, `Icon` จาก `../components/icons.jsx`
- Produces: ไม่มี export ใหม่ — ปุ่ม ☰ (`lg:hidden`) + Sheet ด้านซ้ายที่ render nav groups เดียวกับ sidebar (reuse JSX block — แยก `navContent` เป็นตัวแปร/ฟังก์ชันในไฟล์เดียวกันเพื่อไม่ให้ duplicate)

- [ ] **Step 1: แยก nav JSX เป็น `renderNav()` function** ใน AdminLayout.jsx — ใช้ร่วมกันระหว่าง sidebar (lg) และ Sheet (mobile)
- [ ] **Step 2: เพิ่ม state `navOpen` + hamburger button `lg:hidden`** — วางปุ่มติดกับ header area ของ admin content (หรือ floating top-left); Sheet `side="left"` render `renderNav()`; `onNavigate` → `setNavOpen(false)`
- [ ] **Step 3: ลบ horizontal scroll nav บน mobile** — `<nav>` ใน aside ให้ `hidden lg:flex` (desktop เท่านั้น); aside wrapper บน mobile ซ่อนทั้งก้อน (`hidden lg:block`) เพราะ Sheet แทนที่
- [ ] **Step 4: Verify** — `npm run build` ผ่าน; CDP check viewport 390px: hamburger เห็น, กดแล้ว Sheet เปิด, nav link กดแล้ว Sheet ปิด + หน้าเปลี่ยน; viewport 1440px: sidebar เหมือนเดิม ไม่มี hamburger
- [ ] **Step 5: Code review + commit**

### Task 2: Table filters persist URL + pagination

**Files:**
- Create: `client/src/admin/useUrlFilters.js` — hook `useUrlFilters(defaults)` คืน `[filters, setFilters]` sync กับ `useSearchParams` (อ่าน params ตอน mount, setParams ตอนเปลี่ยน, ลบ key ที่เป็น default)
- Modify: `client/src/admin/Draws.jsx`, `client/src/admin/Bets.jsx`, `client/src/admin/Members.jsx`

**Interfaces:**
- Consumes: `useSearchParams` จาก react-router-dom
- Produces: `useUrlFilters(defaults: object) => [filters, setFilters(partial)]` — filters เป็น flat object ของ string/number; setFilters merge + ลบ default keys ออกจาก URL

- [ ] **Step 1: สร้าง `useUrlFilters.js`** — parse `params.get(k) ?? defaults[k]`, setFilters ใช้ `setParams` แบบ functional update
- [ ] **Step 2: Apply ใน Draws.jsx** — เปลี่ยน filter state ที่มี (status/type/search ถ้ามี) ให้ใช้ hook; เพิ่ม client-side pagination 50 rows/page พร้อมปุ่มก่อนหน้า/ถัดไป + "แสดง X–Y จาก Z"
- [ ] **Step 3: Apply ใน Bets.jsx + Members.jsx** — เหมือนกันกับ filter ที่มีอยู่จริงเท่านั้น (ห้ามสร้าง filter ใหม่ที่ไม่มี backend support)
- [ ] **Step 4: Verify** — build ผ่าน; CDP: ตั้ง filter → refresh → filter ยังอยู่; copy URL เปิด tab ใหม่ → เห็น filter เดิม
- [ ] **Step 5: Code review + commit**

### Task 3: Skeleton + error retry states

**Files:**
- Create: `client/src/components/AdminStates.jsx` — export `AdminLoading({ label })` (SkeletonGrid 3 cards + SkeletonCard rows) และ `AdminError({ message, onRetry })` (กล่องแดง + ปุ่ม "ลองใหม่")
- Modify: `admin/Banner.jsx`, `admin/Bets.jsx`, `admin/Draws.jsx`, `admin/Health.jsx`, `admin/Overview.jsx`, `admin/Payments.jsx`, `admin/Reports.jsx`, `admin/Roles.jsx` — เฉพาะจุดที่ render `กำลังโหลด...`/error text เปล่า

**Interfaces:**
- Consumes: `SkeletonCard/SkeletonGrid` จาก `./Skeleton.jsx`
- Produces: `AdminLoading`, `AdminError` — ใช้ซ้ำได้ทุกหน้า admin

- [ ] **Step 1: สร้าง AdminStates.jsx** — AdminLoading render 4 SkeletonCard สูง ~64px; AdminError มี `role="alert"` + button onClick=onRetry
- [ ] **Step 2: Sweep แต่ละไฟล์** — แทน `{loading && <div>กำลังโหลด...</div>}` ด้วย `<AdminLoading/>`; แทน error text เปล่าด้วย `<AdminError message onRetry={loadFn}/>` (loadFn = function fetch เดิมของหน้านั้น — ต้องมี retry จริง)
- [ ] **Step 3: Verify** — build ผ่าน; CDP throttle network ช้าหรือ mock error → เห็น skeleton/error retry ทำงาน
- [ ] **Step 4: Code review + commit**

### Task 4: Command palette (Ctrl+K)

**Files:**
- Create: `client/src/admin/CommandPalette.jsx` — Dialog + Input ค้นหา, list nav items จาก `adminGroups` (filtered ด้วย `hasPerm`) + quick actions (เช่น ไปตั้งค่า, ไปออกผลรางวัล)
- Modify: `client/src/admin/AdminLayout.jsx` — เพิ่ม state + global keydown `ctrl+k`/`cmd+k` (ป้องกันเมื่อพิมพ์ใน input), render `<CommandPalette/>`

**Interfaces:**
- Consumes: `adminGroups` export จาก AdminLayout.jsx (ต้อง import กลับ — circular! → ย้าย `adminGroups` ไปไฟล์ `client/src/admin/navConfig.js` แล้ว import ทั้งสองฝั่ง), `useAuth().user.permissions`, `useNavigate`, shadcn `Dialog/DialogContent` + `Input`
- Produces: `CommandPalette({ open, onOpenChange })` — items = nav + actions; Enter/click → navigate + close; Esc ปิด (Dialog ทำให้); filter ด้วย includes() บน label

- [ ] **Step 1: ย้าย `adminGroups` ไป `client/src/admin/navConfig.js`** (export เหมือนเดิม) + แก้ import ใน AdminLayout.jsx
- [ ] **Step 2: สร้าง CommandPalette.jsx** — palette items: ทุก nav item ที่ `hasPerm` (แสดง group label เป็น section) + fixed actions 3 อัน (ตั้งค่าระบบ, ออกผลรางวัล→/admin/lotteries?tab=settle, ภาพรวม); keyboard: ↑↓ เลือก, Enter ไป, Esc ปิด
- [ ] **Step 3: Wire ใน AdminLayout** — `useState open`, keydown handler ข้ามเมื่อ target เป็น input/textarea, render palette
- [ ] **Step 4: Verify** — build ผ่าน; CDP: Ctrl+K เปิด, พิมพ์ "สมาชิก" เจอเมนู, Enter ไปหน้า members; พิมพ์ใน search input ของหน้าแล้ว Ctrl+K ไม่ชน
- [ ] **Step 5: Code review + commit**

### Task 5: CSS vars consistency sweep

**Files:**
- Modify: `client/src/admin/*.jsx` — เฉพาะ hardcoded `rgba(r,g,b,...)`/`#hex` ที่ map กับ var ที่มีอยู่ (`--white`, `--muted-gray`, `--bg-card`, `--border-light`, `--gold-*`, `--success-green`, `--danger-red`, `--warning-amber`, `--info-blue`)

**Interfaces:** ไม่มี — mechanical replacement

- [ ] **Step 1: grep hardcoded colors** ใน admin/*.jsx — `rg "rgba\(|#[0-9a-fA-F]{3,6}"` แล้ว map ทีละตัวเป็น `var(--*)` หรือ `[prop:var(--*)]` class
- [ ] **Step 2: แทนเฉพาะที่มี var เทียบเท่า** — ห้ามสร้าง semantic ใหม่ถ้าไม่จำเป็น; สี brand เฉพาะ (เช่น tone สีของ StatCard) ให้คงไว้แต่ย้ายเป็น const เดียวต่อไฟล์ถ้าซ้ำ
- [ ] **Step 3: Verify** — build ผ่าน; CDP เทียบ screenshot หน้า Overview ก่อน/หลัง ต้องหน้าตาเหมือนเดิม
- [ ] **Step 4: Code review + commit**

### Task 6: Toast feedback coverage

**Files:**
- Modify: `client/src/admin/WalletAdmin.jsx` (0 toast), `Payments.jsx` (0), `Banner.jsx` (0), `Settle.jsx` (3→ครบ), `Tickets.jsx`, `Broadcast.jsx`, `Chat.jsx` — ทุก mutation handler (POST/PUT/DELETE)

**Interfaces:**
- Consumes: `toast(msg, kind)` จาก `../components/toast.js` — kind: `'success'|'error'|'info'`; รูปแบบเดิม: `toast('บันทึกแล้ว', 'success')` / catch → `toast(e.message, 'error')`
- Produces: ไม่มี

- [ ] **Step 1: Audit แต่ละไฟล์** — หา `.catch(` / `try{` รอบ api mutation ทั้งหมด; จดจุดที่สำเร็จเงียบๆ หรือ error ไม่แจ้ง
- [ ] **Step 2: เพิ่ม toast** — success: ข้อความไทยสั้นๆ ตรง action ("อนุมัติแล้ว", "บันทึกแบนเนอร์แล้ว"); error: `e.message` (backend เป็นไทยอยู่แล้ว); ห้าม toast ตอน validation fail ฝั่ง client ที่มี inline error อยู่แล้ว
- [ ] **Step 3: Verify** — build ผ่าน; CDP ทำ action จริง 1-2 จุด (เช่น save banner) เห็น toast
- [ ] **Step 4: Code review + commit**

### Task 7: Overview auto-refresh

**Files:**
- Modify: `client/src/admin/Overview.jsx`

**Interfaces:**
- Consumes: `api('/admin/overview')`, `api('/admin/health')` (มีอยู่), `window 'sys:update'` event (pattern เดียวกับ AdminLayout badges)
- Produces: `load()` function ที่ reuse ได้

- [ ] **Step 1: แยก fetch เป็น `load()` + `useCallback`** — setD/setHealth เหมือนเดิม
- [ ] **Step 2: เพิ่ม refresh** — `setInterval(load, 30000)` + listener `sys:update` (kind ใดก็ refresh); `visibilitychange` → reload เมื่อกลับมา visible; cleanup ตอน unmount; แสดง "อัปเดตล่าสุด HH:MM" จาก state แทน `new Date()` static
- [ ] **Step 3: Verify** — build ผ่าน; CDP: เห็น timestamp เปลี่ยนหลัง ~30s (รอจริงหรือ mock interval); ไม่ยิงตอน hidden
- [ ] **Step 4: Code review + commit**

### Task 8: Export CSV

**Files:**
- Create: `client/src/lib/exportCsv.js` — `exportCsv(filename, rows: object[], columns?: [{key,label}] | string[])`
- Modify: `client/src/admin/Audit.jsx`, `client/src/admin/Bets.jsx`, `client/src/admin/Reports.jsx` — เพิ่มปุ่ม "ส่งออก CSV" ข้าง filter/export area

**Interfaces:**
- Consumes: rows ที่หน้านั้น fetch มาแล้ว (state เดิม); columns = keys ของ row แรก หรือระบุเองถ้า row ซ้อน
- Produces: `exportCsv(filename: string, rows: object[], columns?: (string|{key:string,label:string})[])` — สร้าง CSV พร้อม BOM `\uFEFF` (ให้ Excel เปิดภาษาไทยถูก), escape `"` `,` `\n`, download ผ่าน Blob+a.click()

- [ ] **Step 1: สร้าง exportCsv.js** — BOM + header label ไทย + escape; `columns` default = Object.keys(rows[0])
- [ ] **Step 2: เพิ่มปุ่มใน 3 หน้า** — export เฉพาะ rows ที่กำลังแสดง/filtered (label ปุ่ม "ส่งออก CSV (ข้อมูลที่แสดง)"); disable เมื่อ rows ว่าง
- [ ] **Step 3: Verify** — build ผ่าน; CDP กดปุ่ม → ไฟล์ CSV ดาวน์โหลด เปิดใน editor เห็น header ไทย + ข้อมูลครบ
- [ ] **Step 4: Code review + commit**

---

## Self-Review Notes

- Spec coverage: 8/8 items มี task ตรงกัน
- Step scan: ทุก step มีผลลัพธ์ตรวจได้ (build/CDP/review)
- Type consistency: `useUrlFilters`, `AdminLoading/AdminError`, `CommandPalette`, `exportCsv`, `adminGroups` ใน navConfig.js — ชื่อ consistent ข้าม task
- Known limits: CSV export = ข้อมูลที่โหลดมาแล้ว (ถ้า API paginate ต้องระบุใน label — ทำใน Step 2 ของ Task 8); bulk actions ไม่รวมใน plan นี้ (เสี่ยง server-side, เสนอแยก plan ถ้าต้องการ)
