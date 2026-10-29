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

Frontend lưu phiên Google trong `localStorage` để giữ đăng nhập khi đóng tab/trình duyệt trên cùng thiết bị. Phiên cũ trong `sessionStorage` được chuyển sang khi mở lại trang; demo vẫn chỉ dùng `sessionStorage`. Nếu trình duyệt chặn lưu trữ lâu dài, hệ thống thử lưu theo tab.

Sau khi Google và backend xác minh đăng nhập, backend cấp phiên ứng dụng riêng có thời hạn cố định 30 ngày. Frontend lưu token phiên trên thiết bị để mở lại công cụ ngay, kể cả khi ID token Google đã hết hạn. Tab ẩn `TeamSessions` trong Google Sheet có tab `Users` chỉ giữ SHA-256 của token, email và các mốc tạo/hết hạn/thu hồi. Không lưu token thô hoặc kéo dài ID token Google. Hết 30 ngày cần xác nhận lại qua Google.

Hai Apps Script đọc cùng kho phiên và kiểm tra trạng thái hoạt động, vai trò, giáo viên từ `Users` ở mỗi yêu cầu có phân quyền. Thay đổi vai trò hoặc khóa tài khoản có hiệu lực với yêu cầu tiếp theo. Backend vẫn hỗ trợ ID token cũ khi triển khai chuyển tiếp. Đăng xuất xóa phiên/gợi ý trên thiết bị, gửi yêu cầu thu hồi phiên trên máy chủ và tắt tự chọn Google.

Khi phiên 30 ngày hết hạn hoặc máy chủ báo đã thu hồi, công cụ khôi phục Google tại chỗ và giữ biểu mẫu. Lần đăng nhập đầu hiển thị phản hồi ngay khi bấm, rồi xác minh quyền với backend trước khi mở dữ liệu. Trình duyệt chặn lưu trữ, chế độ ẩn danh hoặc xóa dữ liệu vẫn có thể yêu cầu đăng nhập lại.

Tạo nhiều lớp theo tháng: công cụ lập kế hoạch cho 6 khung dạy song song, tính cả lớp đang chạy và lớp đã xếp trước, rồi đề xuất số lớp cần bổ sung thay vì giới hạn 3 lớp. Khóa nối tiếp khai giảng ở buổi kế tiếp sau ngày kết thúc đã gồm 2–3 buổi dự phòng; khung còn trống mở từ buổi phù hợp đầu tiên trong tháng (không tạo ngày quá khứ). Một khung có khóa cũ và khóa nối tiếp vẫn chỉ tính là một khung công suất. Sĩ số lớp mới mặc định: Gia Khang 15, Tuệ Nhi và Hồ Bách 20.

Gia Khang giữ sáu khung cố định: 14–16h cho cả ba cặp thứ, 20–22h thứ 2+5 và 3+6, 18–20h thứ 4+7. Tuệ Nhi và Hồ Bách ưu tiên các khung đang dạy và từng sử dụng; nếu chưa đủ sáu khung, phần xem trước đề xuất khung còn trống để giáo viên kiểm tra trước khi lưu. Không xếp chồng lịch, kể cả khác chương trình hoặc chỉ trùng một phần giờ. Khoảng trống không đủ một khóa trọn vẹn trước lớp đã xếp sẵn sẽ được báo rõ; có thể lưu các lớp hợp lệ trong kế hoạch nhưng phần tổng kết vẫn cho biết chưa đủ công suất.

Mã cũ được giữ nguyên. Mỗi tháng hỗ trợ sáu mã Writing theo giáo viên: Hồ Bách 01+, 12+–16+; Tuệ Nhi 02–05, 10–11; Gia Khang 06–09, 17–18. Speaking giữ dạng `MBSpeak dec26`, có thể dùng thêm `MBSpeak02 dec26` đến `MBSpeak06 dec26` khi cần nhiều khóa cùng đợt. Chạy lại công cụ sau khi lưu sẽ tính các lớp vừa tạo, không đề xuất trùng lớp đã có.
