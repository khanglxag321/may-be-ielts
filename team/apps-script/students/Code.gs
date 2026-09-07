const APP_CONFIG = Object.freeze({
  STUDENTS_SHEET: 'Students',
  ARCHIVE_SHEET: 'Archive',
  AUDIT_SHEET: 'Audit_Log',
  SPREADSHEET_ID_KEY: 'MAYBE_SPREADSHEET_ID',
  USERS_SPREADSHEET_ID_KEY: 'MAYBE_USERS_SPREADSHEET_ID',
  GOOGLE_CLIENT_ID_KEY: 'MAYBE_GOOGLE_CLIENT_ID',
  MAX_FIELD_LENGTH: 500,
});

const TEAM_USERS_SHEET = 'Users';
const TEAM_USERS_HEADERS = Object.freeze(['Email', 'Ten', 'VaiTro', 'TeacherId', 'HoatDong']);

const STUDENT_HEADERS = Object.freeze([
  'ID',
  'Họ và tên',
  'Số điện thoại',
  'Email',
  'Link Facebook',
  'Mã lớp',
  'Tình trạng',
  'Ngày tạo',
  'Cập nhật lần cuối',
  'Người tạo',
  'Dữ liệu gốc',
]);

const ARCHIVE_HEADERS = Object.freeze([
  ...STUDENT_HEADERS,
  'Ngày lưu trữ',
  'Người lưu trữ',
]);

const AUDIT_HEADERS = Object.freeze([
  'Thời gian',
  'Người dùng',
  'Hành động',
  'Chi tiết',
  'ID học viên',
]);

/**
 * Chạy hàm này đúng một lần từ Apps Script editor sau khi dán code.
 * Hàm ghi lại ID của Google Sheet và tạo các tab cần thiết.
 */
function setupApp() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('Hãy mở Apps Script bằng Extensions → Apps Script từ Google Sheet của sếp.');
  }

  PropertiesService.getScriptProperties().setProperty(
    APP_CONFIG.SPREADSHEET_ID_KEY,
    spreadsheet.getId()
  );

  ensureSheet_(spreadsheet, APP_CONFIG.STUDENTS_SHEET, STUDENT_HEADERS, '#1d4ed8');
  ensureSheet_(spreadsheet, APP_CONFIG.ARCHIVE_SHEET, ARCHIVE_HEADERS, '#64748b');
  ensureSheet_(spreadsheet, APP_CONFIG.AUDIT_SHEET, AUDIT_HEADERS, '#0f766e');

  const auditSheet = spreadsheet.getSheetByName(APP_CONFIG.AUDIT_SHEET);
  if (auditSheet && auditSheet.getLastRow() === 1) {
    appendAudit_('SETUP', 'Khởi tạo ứng dụng và các tab dữ liệu.', '', 'setup');
  }

  return {
    ok: true,
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    message: 'Đã tạo Students, Archive và Audit_Log. Hãy đặt MAYBE_USERS_SPREADSHEET_ID và MAYBE_GOOGLE_CLIENT_ID trước khi deploy.',
  };
}

function doGet(event) {
  return jsonResponse_({ ok: true, service: 'maybe-ielts-students-api', auth: 'google-id-token' });
}

function doPost(event) {
  try {
    if (!event || !event.postData || !event.postData.contents) throw new Error('Không nhận được dữ liệu.');
    const body = JSON.parse(event.postData.contents);
    const user = verifyTeamUser_(body.idToken);
    const action = String(body.action || '');
    const payload = typeof body.payload === 'undefined' ? null : body.payload;
    let result;

    if (action === 'getAppData') result = getAppData(user);
    else if (action === 'addStudents') result = addStudents(payload, user);
    else if (action === 'updateStudent') result = updateStudent(payload, user);
    else if (action === 'archiveStudent') result = archiveStudent(payload, user);
    else if (action === 'restoreStudent') result = restoreStudent(payload, user);
    else if (action === 'deleteStudentPermanently') {
      if (user.role !== 'manager') throw new Error('Chỉ quản lý được xóa vĩnh viễn dữ liệu.');
      result = deleteStudentPermanently(payload, user);
    }
    else throw new Error('Action POST không hợp lệ.');

    return jsonResponse_({ ok: true, data: result });
  } catch (error) {
    return jsonResponse_({ ok: false, error: error.message || String(error) });
  }
}

function getAppData(user) {
  requireTeamUser_(user);
  const spreadsheet = getSpreadsheet_();
  return {
    students: readStudents_(spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET), false),
    archived: readStudents_(spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET), true),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    viewerEmail: user.email,
    viewerRole: user.role,
    refreshedAt: new Date().toISOString(),
  };
}

function addStudents(records, user) {
  requireTeamUser_(user);
  if (!Array.isArray(records) || records.length === 0) {
    throw new Error('Không có học viên hợp lệ để lưu.');
  }
  if (records.length > 200) {
    throw new Error('Mỗi lần chỉ được lưu tối đa 200 học viên.');
  }

  return withDocumentLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const existing = readStudents_(sheet, false);
    const usedPhones = new Set(existing.map(function (item) { return normalizePhone_(item.phoneNumber); }).filter(Boolean));
    const usedEmails = new Set(existing.map(function (item) { return String(item.email || '').toLowerCase(); }).filter(Boolean));
    const now = new Date().toISOString();
    const actor = user.email;
    const rows = [];
    const added = [];
    const skipped = [];

    records.forEach(function (input) {
      const record = sanitizeStudent_(input || {});
      const duplicateByPhone = record.phoneNumber && usedPhones.has(record.phoneNumber);
      const duplicateByEmail = record.email && usedEmails.has(record.email);
      if (duplicateByPhone || duplicateByEmail) {
        skipped.push({
          fullName: record.fullName || 'Không rõ tên',
          reason: duplicateByPhone ? 'Trùng số điện thoại' : 'Trùng email',
        });
        return;
      }

      record.id = Utilities.getUuid();
      record.createdAt = now;
      record.updatedAt = now;
      record.createdBy = actor;
      rows.push(studentToRow_(record));
      added.push(record);
      if (record.phoneNumber) usedPhones.add(record.phoneNumber);
      if (record.email) usedEmails.add(record.email);
    });

    if (rows.length) {
      const startRow = sheet.getLastRow() + 1;
      sheet.getRange(startRow, 3, rows.length, 1).setNumberFormat('@');
      sheet.getRange(startRow, 1, rows.length, STUDENT_HEADERS.length).setValues(rows);
      formatDataRows_(sheet, startRow, rows.length, STUDENT_HEADERS.length);
      appendAuditRows_(added.map(function (record) {
        return [now, actor, 'ADD', 'Thêm học viên: ' + record.fullName + ' · ' + record.classCode, record.id];
      }));
    }

    return { ok: true, addedCount: added.length, skipped: skipped };
  });
}

function updateStudent(input, user) {
  requireTeamUser_(user);
  return withDocumentLock_(function () {
    const record = sanitizeStudent_(input || {});
    if (!record.id) throw new Error('Thiếu ID học viên cần cập nhật.');

    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const rowNumber = findRowById_(sheet, record.id);
    if (!rowNumber) throw new Error('Không tìm thấy học viên. Hãy tải lại dữ liệu.');

    const oldRecord = studentFromRow_(sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getDisplayValues()[0], false);
    record.createdAt = oldRecord.createdAt;
    record.createdBy = oldRecord.createdBy;
    record.updatedAt = new Date().toISOString();
    sheet.getRange(rowNumber, 3).setNumberFormat('@');
    sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).setValues([studentToRow_(record)]);
    formatDataRows_(sheet, rowNumber, 1, STUDENT_HEADERS.length);
    appendAudit_('UPDATE', 'Cập nhật học viên: ' + record.fullName, record.id, user.email);
    return { ok: true, record: record };
  });
}

function archiveStudent(id, user) {
  requireTeamUser_(user);
  return withDocumentLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const source = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const target = spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET);
    const rowNumber = findRowById_(source, id);
    if (!rowNumber) throw new Error('Không tìm thấy học viên. Hãy tải lại dữ liệu.');

    const row = source.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getDisplayValues()[0];
    const record = studentFromRow_(row, false);
    const now = new Date().toISOString();
    const actor = user.email;
    const targetRow = target.getLastRow() + 1;
    target.getRange(targetRow, 3).setNumberFormat('@');
    target.getRange(targetRow, 1, 1, ARCHIVE_HEADERS.length).setValues([row.concat([now, actor])]);
    formatDataRows_(target, targetRow, 1, ARCHIVE_HEADERS.length);
    source.deleteRow(rowNumber);
    appendAudit_('ARCHIVE', 'Lưu trữ học viên: ' + record.fullName, id, user.email);
    return { ok: true };
  });
}

function restoreStudent(id, user) {
  requireTeamUser_(user);
  return withDocumentLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const source = spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET);
    const target = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const rowNumber = findRowById_(source, id);
    if (!rowNumber) throw new Error('Không tìm thấy học viên trong Archive.');

    const row = source.getRange(rowNumber, 1, 1, ARCHIVE_HEADERS.length).getDisplayValues()[0];
    const record = studentFromRow_(row, true);
    record.updatedAt = new Date().toISOString();
    const targetRow = target.getLastRow() + 1;
    target.getRange(targetRow, 3).setNumberFormat('@');
    target.getRange(targetRow, 1, 1, STUDENT_HEADERS.length).setValues([studentToRow_(record)]);
    formatDataRows_(target, targetRow, 1, STUDENT_HEADERS.length);
    source.deleteRow(rowNumber);
    appendAudit_('RESTORE', 'Khôi phục học viên: ' + record.fullName, id, user.email);
    return { ok: true };
  });
}

function deleteStudentPermanently(id, user) {
  requireTeamUser_(user);
  if (user.role !== 'manager') throw new Error('Chỉ quản lý được xóa vĩnh viễn dữ liệu.');
  return withDocumentLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET);
    const rowNumber = findRowById_(sheet, id);
    if (!rowNumber) throw new Error('Không tìm thấy học viên trong Archive.');
    const record = studentFromRow_(sheet.getRange(rowNumber, 1, 1, ARCHIVE_HEADERS.length).getDisplayValues()[0], true);
    sheet.deleteRow(rowNumber);
    appendAudit_('DELETE_PERMANENTLY', 'Xóa vĩnh viễn học viên: ' + record.fullName, id, user.email);
    return { ok: true };
  });
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.SPREADSHEET_ID_KEY);
  if (!id) {
    throw new Error('Ứng dụng chưa được thiết lập. Chủ sở hữu Sheet cần chạy hàm setupApp() một lần.');
  }
  const spreadsheet = SpreadsheetApp.openById(id);
  ensureSheet_(spreadsheet, APP_CONFIG.STUDENTS_SHEET, STUDENT_HEADERS, '#1d4ed8');
  ensureSheet_(spreadsheet, APP_CONFIG.ARCHIVE_SHEET, ARCHIVE_HEADERS, '#64748b');
  ensureSheet_(spreadsheet, APP_CONFIG.AUDIT_SHEET, AUDIT_HEADERS, '#0f766e');
  return spreadsheet;
}

function ensureSheet_(spreadsheet, name, headers, color) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (currentHeaders.join('|') !== headers.join('|')) {
    if (sheet.getLastRow() > 1 && currentHeaders.some(Boolean)) {
      throw new Error('Tab ' + name + ' có tiêu đề cột không đúng. Không tự ghi đè để tránh mất dữ liệu.');
    }
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  sheet.setFrozenRows(1);
  sheet.setTabColor(color);
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground(color)
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setWrap(true);
  sheet.autoResizeColumns(1, headers.length);
  return sheet;
}

function readStudents_(sheet, archived) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = archived ? ARCHIVE_HEADERS.length : STUDENT_HEADERS.length;
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, width)
    .getDisplayValues()
    .filter(function (row) { return row[0]; })
    .map(function (row) { return studentFromRow_(row, archived); })
    .reverse();
}

function studentFromRow_(row, archived) {
  const record = {
    id: row[0] || '',
    fullName: row[1] || '',
    phoneNumber: row[2] || '',
    email: row[3] || '',
    facebookUrl: row[4] || '',
    classCode: row[5] || '',
    status: row[6] || '',
    createdAt: row[7] || '',
    updatedAt: row[8] || '',
    createdBy: row[9] || '',
    rawText: row[10] || '',
  };
  if (archived) {
    record.archivedAt = row[11] || '';
    record.archivedBy = row[12] || '';
  }
  return record;
}

function studentToRow_(record) {
  return [
    safeCell_(record.id),
    safeCell_(record.fullName),
    safeCell_(record.phoneNumber),
    safeCell_(record.email),
    safeCell_(record.facebookUrl),
    safeCell_(record.classCode),
    safeCell_(record.status),
    safeCell_(record.createdAt),
    safeCell_(record.updatedAt),
    safeCell_(record.createdBy),
    safeCell_(record.rawText),
  ];
}

function sanitizeStudent_(input) {
  const record = {
    id: cleanText_(input.id, 80),
    fullName: toTitleCase_(cleanText_(input.fullName, 150)),
    phoneNumber: normalizePhone_(input.phoneNumber),
    email: cleanText_(input.email, 180).toLowerCase(),
    facebookUrl: cleanText_(input.facebookUrl, 300),
    classCode: normalizeClass_(input.classCode),
    rawText: cleanText_(input.rawText, APP_CONFIG.MAX_FIELD_LENGTH),
    createdAt: cleanText_(input.createdAt, 50),
    updatedAt: cleanText_(input.updatedAt, 50),
    createdBy: cleanText_(input.createdBy, 180),
  };
  const missing = [];
  if (!record.fullName) missing.push('Họ tên');
  if (!record.phoneNumber) missing.push('SĐT');
  if (!record.email) missing.push('Email');
  if (!record.facebookUrl) missing.push('Facebook');
  if (!record.classCode) missing.push('Mã lớp');
  record.status = missing.length ? 'Thiếu ' + missing.join(', ') : 'Đầy đủ';
  if (!record.fullName) throw new Error('Mỗi học viên phải có họ tên.');
  return record;
}

function normalizePhone_(value) {
  let phone = String(value || '').trim().replace(/[\s.()-]/g, '');
  if (phone.indexOf('+84') === 0) phone = '0' + phone.slice(3);
  if (phone.indexOf('84') === 0 && phone.length >= 11) phone = '0' + phone.slice(2);
  return phone.replace(/[^0-9]/g, '').slice(0, 15);
}

function normalizeClass_(value) {
  return cleanText_(value, 100)
    .toUpperCase()
    .replace(/\bMBW\b/g, 'MBWRITE')
    .replace(/\bMBS\b/g, 'MBSPEAK')
    .replace(/\s+/g, ' ')
    .trim();
}

function toTitleCase_(value) {
  return String(value || '')
    .toLocaleLowerCase('vi-VN')
    .replace(/(^|[\s'-])([^\s'-])/g, function (_, separator, character) {
      return separator + character.toLocaleUpperCase('vi-VN');
    });
}

function cleanText_(value, maxLength) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength);
}

function safeCell_(value) {
  const text = String(value == null ? '' : value);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function findRowById_(sheet, id) {
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const match = sheet
    .getRange(2, 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(String(id))
    .matchEntireCell(true)
    .findNext();
  return match ? match.getRow() : 0;
}

function appendAudit_(action, details, studentId, actor) {
  appendAuditRows_([[new Date().toISOString(), actor || 'system', action, details, studentId || '']]);
}

function appendAuditRows_(rows) {
  if (!rows.length) return;
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(APP_CONFIG.AUDIT_SHEET);
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, AUDIT_HEADERS.length).setValues(rows);
}

function formatDataRows_(sheet, startRow, rowCount, columnCount) {
  if (!rowCount) return;
  sheet.getRange(startRow, 1, rowCount, columnCount)
    .setVerticalAlignment('middle')
    .setWrap(true);
  sheet.getRange(startRow, 3, rowCount, 1).setNumberFormat('@');
}

function withDocumentLock_(callback) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return callback();
  } finally {
    lock.releaseLock();
  }
}

function requireTeamUser_(user) {
  if (!user || !user.email || !['manager', 'teacher'].includes(user.role)) {
    throw new Error('Tài khoản không có quyền sử dụng công cụ này.');
  }
}

function getTeamUsersSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.USERS_SPREADSHEET_ID_KEY);
  if (!spreadsheetId) throw new Error('Chưa đặt Script Property ' + APP_CONFIG.USERS_SPREADSHEET_ID_KEY + '.');
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(TEAM_USERS_SHEET);
  if (!sheet) throw new Error('Không tìm thấy tab Users trong Sheet phân quyền.');
  return sheet;
}

function findActiveTeamUser_(email) {
  const sheet = getTeamUsersSheet_();
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TEAM_USERS_HEADERS.length).getDisplayValues();
  const wanted = String(email || '').trim().toLowerCase();
  for (let i = 0; i < rows.length; i++) {
    const active = String(rows[i][4] || '').trim().toLowerCase();
    if (String(rows[i][0] || '').trim().toLowerCase() === wanted && ['true', '1', 'yes', 'x'].includes(active)) {
      return {
        email: wanted,
        name: String(rows[i][1] || '').trim() || wanted,
        role: String(rows[i][2] || '').trim().toLowerCase() === 'manager' ? 'manager' : 'teacher',
        teacherId: String(rows[i][3] || '').trim().toLowerCase(),
      };
    }
  }
  return null;
}

function verifyTeamUser_(idToken) {
  if (!idToken) throw new Error('Bạn cần đăng nhập lại bằng Google.');
  const expectedClientId = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.GOOGLE_CLIENT_ID_KEY);
  if (!expectedClientId) throw new Error('Chưa đặt Script Property ' + APP_CONFIG.GOOGLE_CLIENT_ID_KEY + '.');
  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken)),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) throw new Error('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.');
  const claims = JSON.parse(response.getContentText());
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(claims.iss) === -1) {
    throw new Error('Nhà phát hành phiên đăng nhập Google không hợp lệ.');
  }
  if (claims.aud !== expectedClientId) throw new Error('Phiên đăng nhập không thuộc ứng dụng này.');
  if (String(claims.email_verified) !== 'true') throw new Error('Email Google chưa được xác minh.');
  if (Number(claims.exp || 0) * 1000 <= Date.now()) throw new Error('Phiên đăng nhập đã hết hạn.');
  const user = findActiveTeamUser_(claims.email);
  if (!user) throw new Error('Tài khoản này chưa được cấp quyền hoặc đã bị khóa.');
  return user;
}

function jsonResponse_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
