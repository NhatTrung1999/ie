# IE CT — Offline PWA

Phiên bản offline của hệ thống **IE Cycle Time Study**, hoạt động trên mạng nội bộ với khả năng làm việc khi mất kết nối đến server và tự động đồng bộ lại khi có mạng.

---

## 🏗️ Kiến trúc

```
[Browser / PWA]
  ├── Service Worker     ← Cache assets, API, Video
  ├── IndexedDB          ← Lưu data cục bộ khi offline
  └── Sync Manager       ← Tự động đẩy thay đổi lên server khi online

           │ mạng nội bộ
           ▼
[Server trung tâm]
  ├── NestJS Backend (port 3001)
  └── SQL Server
```

---

## 📋 Yêu cầu

| Công cụ | Phiên bản |
|---------|-----------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| Backend IE | Đang chạy (port 3001) |

---

## 🚀 Các bước chạy (Development)

### Bước 1 — Cấu hình địa chỉ backend

Mở file `.env` và sửa IP/port trỏ đến server backend của bạn:

```env
VITE_BACKEND_URL=http://<IP_SERVER>:3001
VITE_API_BASE_URL=http://<IP_SERVER>:3001/api
```

> **Ví dụ:** Nếu server backend chạy ở `192.168.18.42`:
> ```env
> VITE_BACKEND_URL=http://192.168.18.42:3001
> VITE_API_BASE_URL=http://192.168.18.42:3001/api
> ```

---

### Bước 2 — Cài dependencies

```bash
cd /đường/dẫn/tới/offline
npm install
```

---

### Bước 3 — Chạy dev server

```bash
npm run dev
```

App sẽ chạy tại: **http://localhost:5174**

> Trong development mode, Vite tự động proxy `/api/*` và `/uploads/*` về backend, nên Service Worker có thể cache cùng origin.

---

### Bước 4 — Đăng nhập

Truy cập `http://localhost:5174` → đăng nhập bằng tài khoản của hệ thống.

---

### Bước 5 — Cache dữ liệu lần đầu

Sau khi đăng nhập, **duyệt qua các màn hình chính** (stage list, bảng CT...) để Service Worker cache dữ liệu vào IndexedDB. Lần đầu tiên **bắt buộc phải có mạng**.

---

## 🖥️ Chạy trên nhiều máy (mạng nội bộ)

Để các máy trong cùng mạng LAN truy cập:

1. Tìm địa chỉ IP của máy đang chạy offline app:
   ```bash
   # macOS / Linux
   ifconfig | grep "inet "
   
   # Windows
   ipconfig
   ```

2. Các máy khác mở browser trỏ đến: `http://<IP_MÁY_ĐỂ_CHẠY>:5174`

> **Lưu ý:** Vite dev server mặc định đã bật `host: true` nên tự động lắng nghe tất cả interface.

---

## 📦 Build Production (triển khai thực tế)

### Bước 1 — Build

```bash
npm run build
```

File tĩnh sẽ được tạo trong thư mục `dist/`.

### Bước 2 — Deploy lên NestJS backend (khuyến nghị)

Để PWA có thể cache video (cùng origin), nên serve app từ backend:

Thêm vào NestJS `main.ts`:
```typescript
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

const app = await NestFactory.create<NestExpressApplication>(AppModule);

// Serve offline PWA static files
app.useStaticAssets(join(__dirname, '..', 'offline-dist'), {
  prefix: '/offline',
});
```

Sau đó copy thư mục `dist/` vào `backend/offline-dist/` và truy cập qua:
`http://<IP_SERVER>:3001/offline`

---

## 🔌 Tính năng Offline

| Tính năng | Online | Offline |
|-----------|--------|---------|
| Xem danh sách stage | ✅ | ✅ (từ cache) |
| Xem bảng CT | ✅ | ✅ (từ cache) |
| Chỉnh sửa bảng CT | ✅ | ✅ (sync sau) |
| Bấm giờ CT | ✅ | ✅ (sync sau) |
| Xem video | ✅ | ✅ (nếu đã cache) |
| Upload video mới | ✅ | ❌ (cần mạng) |
| Xuất Excel | ✅ | ❌ (cần mạng) |
| Nhân bản stage | ✅ | ❌ (cần mạng) |

---

## 🔄 Cách Sync hoạt động

```
Offline → Thao tác được lưu vào Sync Queue (IndexedDB)
 │
 └─ Khi có mạng lại → SyncManager tự động flush queue
    ├── Thành công → xóa khỏi queue
    └── Thất bại   → đánh dấu "failed", có nút Retry ở status bar
```

**Status bar** (góc dưới màn hình):
- 🔴 **Đỏ** — Offline, đang lưu cục bộ
- 🟡 **Vàng** — Online, đang sync...
- *(ẩn)* — Online, đã sync xong

---

## 🐛 Xử lý sự cố

### Không kết nối được backend
- Kiểm tra `VITE_BACKEND_URL` trong `.env`
- Đảm bảo backend đang chạy: `npm run start:dev` trong thư mục `backend/`
- Kiểm tra firewall không chặn port 3001

### Service Worker không cập nhật
- Mở DevTools → Application → Service Workers → click **Update**
- Hoặc hard refresh: `Ctrl+Shift+R` (Windows) / `Cmd+Shift+R` (Mac)

### Xóa cache / reset dữ liệu offline
- DevTools → Application → Storage → **Clear site data**

### Video không xem được khi offline
- Video phải được xem **ít nhất một lần** khi đang online để Service Worker cache lại
- Dung lượng cache video tối đa: 50 video, 30 ngày

---

## 📁 Cấu trúc thư mục quan trọng

```
offline/
├── src/
│   ├── lib/
│   │   ├── local-db.ts        ← IndexedDB (lưu data offline)
│   │   ├── sync-manager.ts    ← Quản lý sync queue
│   │   ├── offline-api.ts     ← Detect lỗi mạng
│   │   └── api-client.ts      ← Axios client (proxy-aware)
│   ├── sw.ts                  ← Service Worker (Workbox)
│   ├── hooks/
│   │   └── use-online-status.ts
│   ├── components/common/
│   │   └── offline-status-bar.tsx
│   └── services/              ← Tất cả offline-aware
├── public/
│   ├── pwa-192x192.png
│   └── pwa-512x512.png
├── .env                       ← ⚠️ Cấu hình IP backend tại đây
└── vite.config.ts             ← PWA + proxy config
```
