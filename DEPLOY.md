# Hướng dẫn Deploy hệ thống Zalo CRM lên aaPanel qua Docker (Port 3180)

Tài liệu này hướng dẫn chi tiết các bước thiết lập, cài đặt và cấu hình reverse proxy trên aaPanel để chạy ứng dụng thông qua Docker.

---

## 🛠 Yêu cầu chuẩn bị trên aaPanel
1. Đăng nhập vào panel quản trị **aaPanel**.
2. Truy cập vào mục **App Store**, tìm kiếm và cài đặt các công cụ sau (nếu chưa cài):
   - **Docker** (phiên bản mới nhất)
   - **Nginx** (để làm Web Server và cấu hình Reverse Proxy + SSL)

---

## 🚀 Các bước triển khai

### Bước 1: Clone mã nguồn về máy chủ aaPanel
Mở Terminal của aaPanel (hoặc SSH trực tiếp vào server) và thực hiện các lệnh sau:

```bash
# Di chuyển tới thư mục chứa các website của aaPanel
cd /www/wwwroot

# Clone dự án từ GitHub của bạn
git clone https://github.com/hungtrankanet/Timdanhsachdisan.git

# Truy cập vào thư mục dự án
cd Timdanhsachdisan
```

---

### Bước 2: Chạy ứng dụng bằng Docker Compose
Hệ thống đã được cấu hình tối ưu hóa tự động tạo thư mục database và lưu trữ session Zalo ngoài container để đảm bảo an toàn dữ liệu khi cập nhật code.

Chạy lệnh build và khởi động container ở chế độ chạy ngầm:

```bash
docker-compose up -d --build
```
> [!NOTE]
> * Dự án sử dụng Puppeteer. File `Dockerfile` đã được cấu hình tự động cài đặt toàn bộ thư viện Chromium/Puppeteer cần thiết cho Linux, giúp hạn chế tối đa các lỗi thiếu dependencies khi chạy môi trường không đầu (headless).
> * Cơ sở dữ liệu SQLite sẽ tự động được khởi tạo tại `/www/wwwroot/Timdanhsachdisan/data/data.db` trên host.
> * Phiên Zalo Web sẽ được lưu trữ tại `/www/wwwroot/Timdanhsachdisan/zalo_user_data` trên host để không bị mất khi restart container.

---

### Bước 3: Cấu hình Tên miền & Reverse Proxy trên aaPanel
Để truy cập ứng dụng qua tên miền đẹp (ví dụ: `crm.cuaban.com`) thay vì gọi trực tiếp IP và port `3180`, hãy thiết lập reverse proxy như sau:

1. **Thêm Website mới**:
   - Truy cập trang **Website** trên aaPanel -> Click **Add site**.
   - Điền tên miền của bạn (ví dụ: `crm.cuaban.com`).
   - Mục **Database**: Chọn *No* (vì dự án sử dụng SQLite).
   - Mục **PHP version**: Chọn *Pure HTML* hoặc phiên bản PHP bất kỳ (vì ứng dụng chạy qua Node.js Docker).
   - Click **Submit**.

2. **Cấu hình Reverse Proxy**:
   - Click vào **Settings** của website vừa tạo.
   - Chọn mục **Reverse Proxy** ở menu bên trái -> Click **Add reverse proxy**.
   - Thiết lập cấu hình:
     - **Proxy Name**: `Zalo_CRM`
     - **Target URL**: `http://127.0.0.1:3180`
     - **Sent Domain**: `$host`
   - Click **Save**.

3. **Cài đặt SSL (Let's Encrypt)** (Khuyến nghị để ứng dụng bảo mật):
   - Trong cửa sổ Settings của site, chọn mục **SSL**.
   - Chọn tab **Let's Encrypt**, tích chọn tên miền của bạn và click **Apply**.
   - Bật nút **Force HTTPS** ở góc trên bên phải.

---

## 🔍 Kiểm tra trạng thái hoạt động

- Truy cập tên miền `https://crm.cuaban.com` (hoặc `http://IP-SERVER:3180`) để kiểm tra giao diện đăng nhập Lacquer Art CRM.
- Tài khoản quản trị mặc định:
  - **Tên đăng nhập**: `admin`
  - **Mật khẩu**: `Toluckphattrien2026`

- Để xem log realtime của container:
  ```bash
  docker logs -f lacquer_heritage_scraper
  ```

---

## 🤖 Tự động hóa Deployment (CI/CD)
Dự án đã được tích hợp GitHub Actions. Mỗi lần bạn `push` code lên nhánh `master` hoặc `main`, hệ thống sẽ tự động kéo code mới về VPS aaPanel và tái xây dựng (rebuild) lại Docker container tự động.
