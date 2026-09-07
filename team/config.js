/*
 * CẤU HÌNH DUY NHẤT CẦN SỬA TRƯỚC KHI ĐƯA LÊN MẠNG.
 *
 * 1. Tạo OAuth Client ID loại "Web application" trong Google Cloud.
 * 2. Thêm URL website vào Authorized JavaScript origins.
 * 3. Dán Client ID vào googleClientId.
 * 4. Hai URL Apps Script được quản lý tập trung bên dưới.
 * 5. Tài khoản/role được quản lý trong tab Users của Google Sheet lịch.
 *
 * Không đặt mật khẩu, access code Google Sheet hoặc secret trong file này.
 */
window.MAYBE_TEAM_CONFIG = Object.freeze({
  googleClientId: "672358174236-d3pq7tmkl4lpeb7etnoj30b5mcjnund3.apps.googleusercontent.com",
  appName: "may(be)team.",
  scheduleApiUrl: "https://script.google.com/macros/s/AKfycbyBZAXmm893kl4QA4rFwiDcVCMRTz4hXbMVCr-tkIVV6tm1NNWTQOGndH8jrbPgSylh/exec",
  studentsApiUrl: "https://script.google.com/macros/s/AKfycbxkVUkS5YvJ-AjjMvD31JdqGnkmvEumtRMvXlpKzIJXvhlwJSEMlxAu4feXrcM5v7AE/exec"
});
