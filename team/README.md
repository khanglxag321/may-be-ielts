# may(be)team. — nền tảng nội bộ

Bộ website tĩnh dùng đăng nhập Google và hai Google Apps Script làm backend:

- `index.html`: màn hình đăng nhập và trang công cụ dạng Stream Deck.
- `admin.html`: Maybe Admin quản lý lịch; giữ nguyên nghiệp vụ lịch của bản gốc.
- `students.html`: nhập, sửa, lưu trữ và xuất dữ liệu học viên.
- `config.js`: Google OAuth Web Client ID và URL của cả hai Apps Script.
- `auth.js`: phiên đăng nhập Google ở giao diện.
- `shared.css`: theme chung theo website MAYBE.
- `apps-script/schedule/Code.gs`: backend lịch và tab phân quyền `Users`.
- `apps-script/students/Code.gs`: backend dữ liệu học viên.
- `HUONG-DAN-TRIEN-KHAI.md`: hướng dẫn triển khai từng bước.

## Quyền hiện tại

| Email | Tên | Vai trò | Trang mặc định |
|---|---|---|---|
| `mbi.maybebach@gmail.com` | Hồ Bách | `manager` | `bach` |
| `miiiimeoooo911@gmail.com` | Tuệ Nhi | `teacher` | `nhi` |
| `mbi.kanelao@gmail.com` | Gia Khang | `manager` | `khang` |

- `manager`: có trang giáo viên riêng, đồng thời có thể chuyển sang mọi giáo viên để hỗ trợ quản lý lịch. Trong công cụ học viên, manager được xóa vĩnh viễn.
- `teacher`: chỉ được thay đổi lịch của chính mình. Vẫn có thể nhập, sửa, lưu trữ và khôi phục dữ liệu học viên nhưng không được xóa vĩnh viễn.

Danh sách này nằm trong tab `Users` của Google Sheet lịch. Không lưu mật khẩu trong Google Sheet hoặc GitHub.

## Xem thử giao diện

Chạy `node preview-server.js`, sau đó mở `http://127.0.0.1:4173`. Tài khoản demo chỉ dùng để xem giao diện; demo không đọc hoặc ghi Google Sheet thật.

## An toàn

Frontend chỉ giữ ID token trong `sessionStorage`. Mỗi thao tác ghi đều được Apps Script xác minh lại với Google, kiểm tra email trong tab `Users`, rồi mới cho phép thay đổi Sheet. Quyền thật nằm ở backend, không phụ thuộc vào việc ẩn/hiện nút trên giao diện.
