# may(be)team. — nền tảng nội bộ

Bộ website tĩnh dùng đăng nhập Google và hai Google Apps Script làm backend:

- `index.html`: màn hình đăng nhập và trang công cụ dạng Stream Deck.
- `admin.html`: Maybe Admin quản lý lịch; giữ nguyên nghiệp vụ lịch của bản gốc.
- `students.html`: nhập, lọc theo tháng/giáo viên, theo dõi tiền cọc/học phí, sửa, lưu trữ và xuất dữ liệu học viên.
- `config.js`: Google OAuth Web Client ID, URL hai Apps Script và liên kết mở Google Sheet học viên.
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

- `manager`: có trang giáo viên riêng, đồng thời xem được mọi giáo viên, mọi học viên và các bộ lọc quản lý. Manager được xóa vĩnh viễn dữ liệu đã lưu trữ.
- `teacher`: chỉ được thay đổi lịch và chỉ thấy học viên do chính mình phụ trách. Giáo viên vẫn có thể nhập, sửa, cập nhật tiền cọc/học phí, lưu trữ và khôi phục học viên của mình.

## Cấu trúc quản lý học viên

Chỉ dùng một tab `Students` cố định, không tạo/xóa tab theo từng tháng. Mỗi dòng có `Tháng`, `TeacherId`, giáo viên phụ trách, trạng thái tiền cọc, học phí và trạng thái học viên. Trên web, quản lý lọc theo tháng/giáo viên/thanh toán; giáo viên được lọc theo tài khoản ngay tại backend nên không thể xem học viên của người khác.

Các cột kỹ thuật như ID, dữ liệu gốc và thông tin audit được giữ lại nhưng ẩn trong Google Sheet để bảng dễ đọc. Không xóa tab `Students`, `Archive` hoặc `Audit_Log`; học viên cũ nên được chuyển vào `Archive`.

Danh sách này nằm trong tab `Users` của Google Sheet lịch. Không lưu mật khẩu trong Google Sheet hoặc GitHub.

## Xem thử giao diện

Chạy `node preview-server.js`, sau đó mở `http://127.0.0.1:4173`. Tài khoản demo chỉ dùng để xem giao diện; demo không đọc hoặc ghi Google Sheet thật.

## An toàn

Frontend chỉ giữ ID token trong `sessionStorage`. Mỗi thao tác ghi đều được Apps Script xác minh lại với Google, kiểm tra email trong tab `Users`, rồi mới cho phép thay đổi Sheet. Quyền thật nằm ở backend, không phụ thuộc vào việc ẩn/hiện nút trên giao diện.
