const TEAM_EMAIL = "mbi.maybebach@gmail.com";

// Các giáo viên chưa có email riêng nhận đơn qua email chung của team.
const TEACHER_EMAILS = Object.freeze({
  "ho bach": "mbi.maybebach@gmail.com",
  "tue nhi": "miiiimeoooo911@gmail.com",
  "gia khang": "khanglxagwwe@gmail.com",
  "quynh kem": "mbi.qkem@gmail.com",
  "kem": "mbi.qkem@gmail.com",
  "lan trinh": "mbi.cicintcilly@gmail.com",
  "cici": "mbi.cicintcilly@gmail.com",
  "cc": "mbi.cicintcilly@gmail.com",
  "binh an": "mbi.binhan@gmail.com"
});

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error("Thiếu nội dung POST.");
    }
    const data = JSON.parse(e.postData.contents);
    const name = requiredText_(data.name, "Họ tên", 120);
    const email = requiredText_(data.email, "Email", 200);
    const phone = requiredText_(data.phone, "Số điện thoại", 40);
    const facebook = requiredText_(data.facebook, "Facebook", 500);
    const className = requiredText_(data.className, "Lớp đăng ký", 250);
    if (!isEmail_(email)) throw new Error("Email học viên không hợp lệ.");

    // Website gửi className theo dạng: "Mã lớp | Tên giáo viên".
    const teacherName = extractTeacherName_(className);
    const teacherEmail = TEACHER_EMAILS[normalizeTeacherName_(teacherName)] || TEAM_EMAIL;
    if (!isEmail_(TEAM_EMAIL) || !isEmail_(teacherEmail)) {
      throw new Error("Email nhận đăng ký chưa được cấu hình hợp lệ.");
    }
    const recipients = [...new Set([TEAM_EMAIL, teacherEmail])].join(",");
    const submittedAt = Utilities.formatDate(new Date(), "Asia/Ho_Chi_Minh", "dd/MM/yyyy HH:mm:ss");
    const subject = ("[Đăng ký mới] " + className + " - " + name).slice(0, 240);
    MailApp.sendEmail({
      to: recipients,
      replyTo: email,
      name: "may(be)ielts.",
      subject: subject,
      body: [
        "Có học viên mới đăng ký khóa học:", "",
        "Họ tên: " + name,
        "Email: " + email,
        "Số điện thoại: " + phone,
        "Facebook: " + facebook,
        "Lớp đăng ký: " + className,
        "Giáo viên: " + teacherName,
        "Thời gian gửi: " + submittedAt, "",
        "Có thể bấm Trả lời (Reply) để phản hồi trực tiếp email học viên."
      ].join("\n")
    });
    return jsonResponse_({ status: "success" });
  } catch (error) {
    console.error(error && error.stack ? error.stack : error);
    return jsonResponse_({ status: "error", message: error && error.message ? error.message : "Không thể xử lý đăng ký." });
  }
}

function extractTeacherName_(className) {
  const separatorIndex = className.indexOf("|");
  if (separatorIndex === -1) throw new Error("Lớp đăng ký không chứa tên giáo viên.");
  const teacherName = className.slice(separatorIndex + 1).trim();
  if (!teacherName) throw new Error("Không xác định được giáo viên từ lớp đăng ký.");
  return teacherName;
}
function normalizeTeacherName_(value) {
  return String(value).trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");
}
function requiredText_(value, label, maxLength) {
  const text = String(value == null ? "" : value).replace(/[\r\n]+/g, " ").trim();
  if (!text) throw new Error(label + " đang bị trống.");
  if (text.length > maxLength) throw new Error(label + " quá dài.");
  return text;
}
function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
}
function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}
