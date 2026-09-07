# Hướng dẫn triển khai may(be)team.

Làm lần lượt theo thứ tự dưới đây. Nên thử bằng dữ liệu giả trước khi dùng thật.

## A. Tạo đăng nhập Google

1. Mở Google Cloud Console bằng tài khoản dùng để quản lý OAuth.
2. Vào Google Auth Platform, cấu hình OAuth consent screen. Nếu dự án ở chế độ **Testing**, thêm cả ba email trong bảng `Users` vào **Test users**; nếu không, Google có thể chặn đăng nhập dù Sheet đã cấp quyền.
3. Tạo **OAuth Client ID → Web application**.
4. Trong **Authorized JavaScript origins**, thêm:
   - `http://localhost:4173` để thử trên máy;
   - `http://127.0.0.1:4173` vì máy chủ xem thử của bộ này cũng dùng địa chỉ đó;
   - origin website thật, ví dụ `https://ten-tai-khoan.github.io` (không thêm đường dẫn sau tên miền).
5. Sao chép Client ID kết thúc bằng `.apps.googleusercontent.com`.
6. Mở `config.js`, thay giá trị mẫu ở `googleClientId` bằng Client ID vừa tạo.

Giữ lại Client ID này vì phải dùng cùng một giá trị cho cả hai Apps Script.

## B. Nâng cấp Apps Script lịch

Thao tác trong Apps Script đang kết nối với Google Sheet lịch hiện có:

1. Sao lưu code cũ nếu cần.
2. Thay nội dung `Code.gs` bằng file `apps-script/schedule/Code.gs` trong bộ này.
3. Chọn hàm `setupTeamAccess` ở thanh công cụ và bấm **Run** đúng một lần; cấp quyền khi Google hỏi.
4. Trở lại Google Sheet. Tab `Users` sẽ được tạo với ba tài khoản:

| Email | Ten | VaiTro | TeacherId | HoatDong |
|---|---|---|---|---|
| `mbi.maybebach@gmail.com` | Hồ Bách | `manager` | `bach` | `TRUE` |
| `miiiimeoooo911@gmail.com` | Tuệ Nhi | `teacher` | `nhi` | `TRUE` |
| `mbi.kanelao@gmail.com` | Gia Khang | `manager` | `khang` | `TRUE` |

5. Trong Apps Script mở **Project Settings → Script Properties → Add script property**:
   - Property: `MAYBE_GOOGLE_CLIENT_ID`
   - Value: OAuth Client ID ở bước A.
6. Chọn **Deploy → Manage deployments → Edit** deployment đang dùng.
7. Chọn **New version**, đặt:
   - Execute as: **Me** (chủ Google Sheet lịch);
   - Who has access: **Anyone**.
8. Bấm **Deploy**. Nếu Google giữ nguyên URL `/exec`, không cần sửa `scheduleApiUrl` trong `config.js`. Nếu URL thay đổi, dán URL mới vào `config.js`.

`doGet` của backend lịch vẫn cho website chính đọc lịch công khai. Mọi thao tác ghi phải có Google ID token hợp lệ và được kiểm tra theo tab `Users`.

## C. Nâng cấp Apps Script học viên

Thao tác trong Apps Script mở từ Google Sheet lưu dữ liệu học viên:

1. Thay nội dung `Code.gs` bằng file `apps-script/students/Code.gs`.
2. Chọn hàm `setupApp` và bấm **Run**. Hàm sẽ tạo/kiểm tra các tab `Students`, `Archive`, `Audit_Log` và áp dụng lại định dạng gọn cho toàn bộ dữ liệu hiện có. Có thể chạy lại hàm này sau mỗi lần nâng cấp code; dữ liệu học viên không bị xóa.
3. Lấy ID của Google Sheet lịch — đoạn nằm giữa `/d/` và `/edit` trong URL của Sheet lịch.
4. Mở **Project Settings → Script Properties**, thêm hai property:
   - `MAYBE_USERS_SPREADSHEET_ID` = ID Google Sheet lịch có tab `Users`;
   - `MAYBE_GOOGLE_CLIENT_ID` = đúng OAuth Client ID ở bước A.
5. Chọn **Deploy → Manage deployments → Edit → New version**.
6. Đặt:
   - Execute as: **Me** (chủ Google Sheet học viên);
   - Who has access: **Anyone**.
7. Bấm **Deploy**.
8. Nếu URL `/exec` thay đổi, mở `config.js` và thay giá trị `studentsApiUrl` bằng URL mới. URL hiện có trong file là URL bạn đã cung cấp.

Giáo viên không cần được chia sẻ Google Sheet học viên. Apps Script chạy bằng quyền của chủ Sheet, nhưng chỉ xử lý yêu cầu sau khi xác minh token và danh sách `Users`.

`setupApp` không tạo tab theo tháng. Hàm nâng cấp tab `Students` hiện có bằng cách thêm các cột quản lý, điền lại tháng/giáo viên cho dữ liệu cũ và ẩn cột kỹ thuật; không xóa các dòng đã có. Hãy giữ nguyên ba tab `Students`, `Archive`, `Audit_Log`.

## D. Đưa website lên GitHub Pages

1. Tạo repository riêng tư để quản lý source nếu muốn; lưu ý GitHub Pages của tài khoản/gói đang dùng có hỗ trợ quyền riêng tư hay không.
2. Upload toàn bộ file/thư mục trong bộ này lên nhánh `main`.
3. Vào **Settings → Pages**, chọn **Deploy from a branch**, nhánh `main`, thư mục `/root`.
4. Sau khi có URL thật, thêm origin đó vào **Authorized JavaScript origins** của OAuth Client.
5. Mở website, đăng nhập từng tài khoản và kiểm tra theo mục F.

Ba trang `index.html`, `admin.html`, `students.html` phải nằm cùng một origin để dùng chung phiên đăng nhập trong tab trình duyệt.

## E. Quản lý tài khoản sau này

Chỉ sửa các dòng trong tab `Users`; không cần sửa frontend:

- Thêm người: thêm một dòng với email Google, tên, `manager` hoặc `teacher`, `teacherId`, và `TRUE`.
- Khóa người: đổi `HoatDong` thành `FALSE`.
- Nâng quyền: đổi `VaiTro` thành `manager`.
- Hạ quyền: đổi `VaiTro` thành `teacher`.

`TeacherId` hiện dùng: `bach`, `nhi`, `khang`. Nếu thêm một giáo viên hoàn toàn mới, cần bổ sung hồ sơ giáo viên đó trong `admin.html`; chỉ thêm dòng ở `Users` là chưa đủ để tạo giao diện lịch mới.

Hai manager hiện tại:

- Hồ Bách mở mặc định trang `bach` nhưng chuyển được sang mọi giáo viên.
- Gia Khang mở mặc định trang `khang` nhưng chuyển được sang mọi giáo viên.

## F. Checklist kiểm tra

1. Hồ Bách đăng nhập: thấy nhãn Quản lý, mở mặc định lịch Hồ Bách, chuyển được sang Gia Khang/Tuệ Nhi.
2. Gia Khang đăng nhập: thấy nhãn Quản lý, mở mặc định lịch Gia Khang, chuyển được sang giáo viên khác.
3. Tuệ Nhi đăng nhập: chỉ thấy lịch Tuệ Nhi; thử thay đổi lịch của người khác phải bị backend từ chối.
4. Mỗi tài khoản nhập một học viên giả, tải lại trang, xác nhận dữ liệu vẫn còn trong tab `Students`.
5. Đăng nhập Tuệ Nhi và xác nhận chỉ thấy học viên của `nhi`; đăng nhập Hồ Bách hoặc Gia Khang và xác nhận thấy mọi giáo viên.
6. Thử lọc theo tháng, giáo viên, lớp và trạng thái học phí; tick tiền cọc/học phí rồi tải lại để xác nhận trạng thái đã lưu.
7. Chuyển học viên giả vào Archive rồi khôi phục.
8. Xác nhận Tuệ Nhi không thấy nút **Xóa vĩnh viễn**; hai manager thấy và dùng được nút này.
9. Đặt `HoatDong=FALSE` cho một tài khoản test và xác nhận tài khoản đó không đăng nhập được.

## G. Xem thử giao diện trên máy

1. Mở Terminal tại thư mục website.
2. Chạy `node preview-server.js`.
3. Mở `http://127.0.0.1:4173`.
4. Dùng các nút demo để xem giao diện.

Demo không kết nối Google Sheet thật. Muốn thử luồng thật ở localhost, phải điền OAuth Client ID, giữ `http://localhost:4173` trong Authorized JavaScript origins và đăng nhập Google thật.

Tài liệu chính thức:

- https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid
- https://developers.google.com/identity/gsi/web/guides/display-button
- https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
