const SHEET_NAME = 'Classes';
const USERS_SHEET_NAME = 'Users';
const USERS_HEADERS = ['Email', 'Ten', 'VaiTro', 'TeacherId', 'HoatDong'];
const USERS_SPREADSHEET_ID_KEY = 'MAYBE_USERS_SPREADSHEET_ID';
const GOOGLE_CLIENT_ID_KEY = 'MAYBE_GOOGLE_CLIENT_ID';
const TEACHER_NAME_BY_ID = {
  bach: 'Hồ Bách',
  nhi: 'Tuệ Nhi',
  khang: 'Gia Khang'
};
const INITIAL_USERS = [
  ['mbi.maybebach@gmail.com', 'Hồ Bách', 'manager', 'bach', true],
  ['miiiimeoooo911@gmail.com', 'Tuệ Nhi', 'teacher', 'nhi', true],
  ['mbi.kanelao@gmail.com', 'Gia Khang', 'manager', 'khang', true]
];
const REQUIRED_HEADERS = [
  'MaLop', 'GiangVien', 'LichHoc', 'KhaiGiang', 'KetThuc',
  'HocPhiUuDai', 'HocPhiGoc', 'HocVien', 'TongSlot'
];

/**
 * Chạy một lần từ Apps Script editor.
 * Hàm tạo tab Users và lưu ID của Sheet để web app luôn đọc đúng danh sách quyền.
 */
function setupTeamAccess() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Hãy mở Apps Script từ Google Sheet lịch.');
  PropertiesService.getScriptProperties().setProperty(USERS_SPREADSHEET_ID_KEY, spreadsheet.getId());

  let sheet = spreadsheet.getSheetByName(USERS_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(USERS_SHEET_NAME);
  if (sheet.getMaxColumns() < USERS_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), USERS_HEADERS.length - sheet.getMaxColumns());
  }
  const currentHeaders = sheet.getRange(1, 1, 1, USERS_HEADERS.length).getDisplayValues()[0];
  if (currentHeaders.some(Boolean) && currentHeaders.join('|') !== USERS_HEADERS.join('|')) {
    throw new Error('Tab Users đã có tiêu đề khác. Không tự ghi đè để tránh mất dữ liệu.');
  }
  sheet.getRange(1, 1, 1, USERS_HEADERS.length).setValues([USERS_HEADERS]);
  if (sheet.getLastRow() === 1) {
    sheet.getRange(2, 1, INITIAL_USERS.length, USERS_HEADERS.length).setValues(INITIAL_USERS);
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, USERS_HEADERS.length)
    .setBackground('#0f1b4c')
    .setFontColor('#ffffff')
    .setFontWeight('bold');
  sheet.autoResizeColumns(1, USERS_HEADERS.length);
  return 'Đã tạo tab Users. Tiếp theo hãy đặt Script Property ' + GOOGLE_CLIENT_ID_KEY + '.';
}

function json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(USERS_SPREADSHEET_ID_KEY);
  const spreadsheet = spreadsheetId ? SpreadsheetApp.openById(spreadsheetId) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error('Chưa chạy setupTeamAccess().');
  const sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy sheet "' + SHEET_NAME + '".');
  return sheet;
}

function getHeaders_(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (!lastColumn) throw new Error('Sheet chưa có hàng tiêu đề.');
  const headers = sheet.getRange(1, 1, 1, lastColumn).getDisplayValues()[0];
  const missing = REQUIRED_HEADERS.filter(function (header) {
    return headers.indexOf(header) === -1;
  });
  if (missing.length) throw new Error('Thiếu cột: ' + missing.join(', '));
  return headers;
}

function normalize_(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function normalizeName_(value) {
  return String(value == null ? '' : value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getUsersSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(USERS_SPREADSHEET_ID_KEY);
  if (!spreadsheetId) throw new Error('Chưa chạy setupTeamAccess().');
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(USERS_SHEET_NAME);
  if (!sheet) throw new Error('Không tìm thấy tab Users.');
  return sheet;
}

function findActiveUser_(email) {
  const sheet = getUsersSheet_();
  if (sheet.getLastRow() < 2) return null;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, USERS_HEADERS.length).getDisplayValues();
  const wantedEmail = normalize_(email);
  for (let i = 0; i < rows.length; i++) {
    const active = normalize_(rows[i][4]);
    if (normalize_(rows[i][0]) === wantedEmail && ['true', '1', 'yes', 'x'].indexOf(active) !== -1) {
      return {
        email: wantedEmail,
        name: String(rows[i][1] || '').trim() || wantedEmail,
        role: normalize_(rows[i][2]) === 'manager' ? 'manager' : 'teacher',
        teacherId: normalize_(rows[i][3])
      };
    }
  }
  return null;
}

function verifyGoogleIdToken_(idToken) {
  if (!idToken) throw authError_('Bạn cần đăng nhập lại bằng Google.');
  const expectedClientId = PropertiesService.getScriptProperties().getProperty(GOOGLE_CLIENT_ID_KEY);
  if (!expectedClientId) throw new Error('Chưa đặt Script Property ' + GOOGLE_CLIENT_ID_KEY + '.');
  const response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(String(idToken)),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) throw authError_('Phiên đăng nhập Google không hợp lệ hoặc đã hết hạn.');
  const claims = JSON.parse(response.getContentText());
  if (['accounts.google.com', 'https://accounts.google.com'].indexOf(claims.iss) === -1) {
    throw new Error('Nhà phát hành phiên đăng nhập Google không hợp lệ.');
  }
  if (claims.aud !== expectedClientId) throw new Error('Phiên đăng nhập không thuộc ứng dụng này.');
  if (String(claims.email_verified) !== 'true') throw new Error('Email Google chưa được xác minh.');
  if (!Number.isFinite(Number(claims.exp)) || Number(claims.exp || 0) * 1000 <= Date.now()) throw authError_('Phiên đăng nhập đã hết hạn.');
  const user = findActiveUser_(claims.email);
  if (!user) throw authError_('Tài khoản này chưa được cấp quyền hoặc đã bị khóa.', 'AUTH_FORBIDDEN');
  return user;
}

function assertSchedulePermission_(user, data) {
  if (user.role === 'manager') return;
  const allowedTeacher = TEACHER_NAME_BY_ID[user.teacherId];
  if (!allowedTeacher) throw new Error('Tài khoản chưa được gắn đúng giáo viên.');
  const records = Array.isArray(data) ? data : [data];
  const allowedName = normalizeName_(allowedTeacher);
  const invalid = records.some(function (item) {
    if (!item || normalizeName_(item.GiangVien) !== allowedName) return true;
    if (item.OriginalGiangVien && normalizeName_(item.OriginalGiangVien) !== allowedName) return true;
    return false;
  });
  if (invalid) throw new Error('Giáo viên chỉ được thay đổi lịch của chính mình.');
}

function classKey_(maLop, giangVien) {
  return normalize_(giangVien) + '|' + normalize_(maLop);
}

function getBaseClassNumber(maLop) {
  const match = String(maLop || '').match(/^MB(?:Write|Speak)(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function getMaxClassNumber(data) {
  return data.reduce(function (max, item) {
    return Math.max(max, getBaseClassNumber(item.MaLop));
  }, 0);
}

function rowsAsObjects_(sheet, headers) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 1, lastRow - 1, headers.length)
    .getDisplayValues()
    .filter(function (row) { return row.some(String); })
    .map(function (row) {
      const item = {};
      headers.forEach(function (header, index) { item[header] = row[index]; });
      return item;
    });
}

function findRowByClass_(sheet, headers, maLop, giangVien) {
  const maLopColumn = headers.indexOf('MaLop');
  const teacherColumn = headers.indexOf('GiangVien');
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
  const wanted = classKey_(maLop, giangVien);
  for (let i = 0; i < rows.length; i++) {
    if (classKey_(rows[i][maLopColumn], rows[i][teacherColumn]) === wanted) return i + 2;
  }
  return -1;
}

function objectToRow_(data, headers) {
  return headers.map(function (header) {
    return Object.prototype.hasOwnProperty.call(data, header) ? data[header] : '';
  });
}

function doGet() {
  try {
    const sheet = getSheet_();
    const headers = getHeaders_(sheet);
    const data = rowsAsObjects_(sheet, headers);
    data.sort(function (a, b) {
      return getBaseClassNumber(a.MaLop) - getBaseClassNumber(b.MaLop);
    });
    return json_({ status: 'success', data: data, maxNumber: getMaxClassNumber(data) });
  } catch (error) {
    return json_({ status: 'error', message: error.message });
  }
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  let locked = false;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return json_({ status: 'error', message: 'Không nhận được dữ liệu.' });
    }
    const payload = JSON.parse(e.postData.contents);
    const action = payload.action;
    const data = payload.data;
    if (action === 'AUTH_LOGOUT') {
      revokeTeamSession_(payload.sessionToken);
      return json_({ status: 'success' });
    }
    const user = verifyTeamRequest_(payload);

    if (action === 'AUTH_ME') {
      const session = payload.rememberSession === true && !payload.sessionToken
        ? createTeamSession_(user) : null;
      return json_({ status: 'success', user: user, session: session });
    }

    assertSchedulePermission_(user, data);
    if (!lock.tryLock(10000)) {
      return json_({ status: 'error', message: 'Hệ thống đang bận, vui lòng thử lại.' });
    }
    locked = true;
    const sheet = getSheet_();
    const headers = getHeaders_(sheet);

    if (action === 'BATCH_ADD') {
      if (!Array.isArray(data) || !data.length) {
        return json_({ status: 'error', message: 'Danh sách lớp trống.' });
      }
      const existing = new Set(rowsAsObjects_(sheet, headers).map(function (item) {
        return classKey_(item.MaLop, item.GiangVien);
      }));
      const incoming = new Set();
      for (let i = 0; i < data.length; i++) {
        const key = classKey_(data[i].MaLop, data[i].GiangVien);
        if (!data[i].MaLop || !data[i].GiangVien) {
          return json_({ status: 'error', message: 'Mỗi lớp phải có Mã lớp và Giáo viên.' });
        }
        if (existing.has(key) || incoming.has(key)) {
          return json_({ status: 'error', message: 'Lớp đã tồn tại: ' + data[i].MaLop + ' — ' + data[i].GiangVien });
        }
        incoming.add(key);
      }
      const rowsToAdd = data.map(function (item) { return objectToRow_(item, headers); });
      sheet.getRange(sheet.getLastRow() + 1, 1, rowsToAdd.length, headers.length).setValues(rowsToAdd);
      return json_({ status: 'success', message: 'Đã thêm ' + rowsToAdd.length + ' lớp.' });
    }

    if (action === 'EDIT') {
      if (!data || !data.MaLop || !data.GiangVien) {
        return json_({ status: 'error', message: 'Thiếu Mã lớp hoặc Giáo viên.' });
      }
      const originalMaLop = data.OriginalMaLop || data.MaLop;
      const originalTeacher = data.OriginalGiangVien || data.GiangVien;
      const rowNumber = findRowByClass_(sheet, headers, originalMaLop, originalTeacher);
      if (rowNumber === -1) return json_({ status: 'error', message: 'Không tìm thấy lớp cần sửa.' });
      sheet.getRange(rowNumber, 1, 1, headers.length).setValues([objectToRow_(data, headers)]);
      return json_({ status: 'success', message: 'Đã cập nhật lớp.' });
    }

    if (action === 'BATCH_DELETE') {
      if (!Array.isArray(data) || !data.length || data.some(function (item) { return typeof item !== 'object'; })) {
        return json_({
          status: 'error',
          message: 'Để tránh xóa nhầm lớp trùng mã, dữ liệu xóa phải gồm cả MaLop và GiangVien.'
        });
      }
      const wanted = new Set(data.map(function (item) {
        return classKey_(item.MaLop, item.GiangVien);
      }));
      const maLopColumn = headers.indexOf('MaLop');
      const teacherColumn = headers.indexOf('GiangVien');
      const lastRow = sheet.getLastRow();
      let deleted = 0;
      if (lastRow >= 2) {
        const rows = sheet.getRange(2, 1, lastRow - 1, headers.length).getDisplayValues();
        for (let i = rows.length - 1; i >= 0; i--) {
          if (wanted.has(classKey_(rows[i][maLopColumn], rows[i][teacherColumn]))) {
            sheet.deleteRow(i + 2);
            deleted++;
          }
        }
      }
      return json_({ status: 'success', message: 'Đã xóa ' + deleted + ' lớp.' });
    }

    return json_({ status: 'error', message: 'Action không hợp lệ.' });
  } catch (error) {
    return json_({ status: 'error', message: error.message, code: error.code || '' });
  } finally {
    if (locked) {
      try { lock.releaseLock(); } catch (ignore) {}
    }
  }
}
/**
 * Thirty-day application sessions shared by the two backends through the
 * existing Users spreadsheet. Only SHA-256 digests are stored, never bearer
 * tokens. Role/active status always comes from Users at request time.
 */
const TEAM_SESSION_SHEET = 'TeamSessions';
const TEAM_SESSION_HEADERS = ['TokenHash', 'Email', 'CreatedAt', 'ExpiresAt', 'RevokedAt'];
const TEAM_SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

function authError_(message, code) {
  const error = new Error(message);
  error.code = code || 'AUTH_REQUIRED';
  return error;
}

function teamSessionHash_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) {
    throw authError_('Phiên đăng nhập không hợp lệ. Vui lòng đăng nhập lại.');
  }
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)
    .map(function (byte) { return ('0' + (byte & 255).toString(16)).slice(-2); }).join('');
}

function teamSessionsSheet_(create) {
  const spreadsheet = getUsersSheet_().getParent();
  let sheet = spreadsheet.getSheetByName(TEAM_SESSION_SHEET);
  if (!sheet && create) {
    sheet = spreadsheet.insertSheet(TEAM_SESSION_SHEET);
    sheet.getRange(1, 1, 1, TEAM_SESSION_HEADERS.length).setValues([TEAM_SESSION_HEADERS]);
    sheet.setFrozenRows(1);
    sheet.hideSheet();
    // Match the private Users spreadsheet's existing access. Hiding is only UI
    // hygiene; server verification and the bearer digest enforce authentication.
  }
  if (sheet) {
    const headers = sheet.getRange(1, 1, 1, TEAM_SESSION_HEADERS.length).getDisplayValues()[0];
    if (headers.join('|') !== TEAM_SESSION_HEADERS.join('|')) throw new Error('Tab TeamSessions có tiêu đề khác. Không tự ghi đè.');
  }
  return sheet;
}

function findTeamSession_(token) {
  const hash = teamSessionHash_(token);
  const sheet = teamSessionsSheet_(false);
  if (!sheet || sheet.getLastRow() < 2) throw authError_('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.');
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TEAM_SESSION_HEADERS.length).getValues();
  const index = rows.findIndex(function (row) { return String(row[0]) === hash; });
  if (index === -1 || rows[index][4] || !Number.isFinite(Number(rows[index][3])) || Number(rows[index][3]) <= Date.now()) {
    throw authError_('Phiên đăng nhập đã hết hạn hoặc đã đăng xuất. Vui lòng đăng nhập lại.');
  }
  return { sheet: sheet, row: index + 2, email: String(rows[index][1]), expiresAt: Number(rows[index][3]) };
}

function verifyTeamRequest_(payload) {
  if (!payload.sessionToken) return verifyGoogleIdToken_(payload.idToken);
  const session = findTeamSession_(payload.sessionToken);
  const user = findActiveUser_(session.email);
  if (!user) throw authError_('Tài khoản này chưa được cấp quyền hoặc đã bị khóa.', 'AUTH_FORBIDDEN');
  return user;
}

function createTeamSession_(user) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = teamSessionsSheet_(true);
    const now = Date.now();
    // Bound stored history without ever touching business data.
    if (sheet.getLastRow() > 1) {
      const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TEAM_SESSION_HEADERS.length).getValues();
      for (let i = rows.length - 1; i >= 0; i--) {
        if (rows[i][4] || Number(rows[i][3]) <= now) sheet.deleteRow(i + 2);
      }
    }
    const token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').toLowerCase();
    const expiresAt = now + TEAM_SESSION_LIFETIME_MS;
    sheet.getRange(sheet.getLastRow() + 1, 1, 1, TEAM_SESSION_HEADERS.length)
      .setValues([[teamSessionHash_(token), user.email, now, expiresAt, '']]);
    return { token: token, expiresAt: expiresAt };
  } finally {
    lock.releaseLock();
  }
}

function revokeTeamSession_(token) {
  if (!token) return;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const session = findTeamSession_(token);
    session.sheet.getRange(session.row, 5).setValue(Date.now());
  } catch (error) {
    if (error.code !== 'AUTH_REQUIRED') throw error;
  } finally {
    lock.releaseLock();
  }
}
