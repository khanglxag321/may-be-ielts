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

const LEGACY_STUDENT_HEADERS = Object.freeze([
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

const BUSINESS_HEADERS = Object.freeze([
  'Tháng',
  'TeacherId',
  'Giáo viên phụ trách',
  'Đã đóng cọc',
  'Số tiền cọc',
  'Ngày đóng cọc',
  'Đã đóng đủ học phí',
  'Học phí',
  'Đã thu',
  'Còn lại',
  'Trạng thái học viên',
  'Ghi chú',
]);

const STUDENT_HEADERS = Object.freeze([
  ...LEGACY_STUDENT_HEADERS,
  ...BUSINESS_HEADERS,
]);

const ARCHIVE_HEADERS = Object.freeze([
  ...LEGACY_STUDENT_HEADERS,
  'Ngày lưu trữ',
  'Người lưu trữ',
  ...BUSINESS_HEADERS,
]);

const AUDIT_HEADERS = Object.freeze([
  'Thời gian',
  'Người dùng',
  'Hành động',
  'Chi tiết',
  'ID học viên',
]);

/**
 * Có thể chạy lại an toàn sau khi cập nhật code.
 * Hàm ghi lại ID Google Sheet, nâng cấp cột cũ và định dạng các tab quản lý.
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
  backfillBusinessData_(spreadsheet);
  formatManagedSheets_(spreadsheet);

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
    else if (action === 'setPaymentStatus') result = setPaymentStatus(payload, user);
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
  const visibleStudents = filterRecordsForUser_(readStudents_(spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET), false), user);
  const visibleArchive = filterRecordsForUser_(readStudents_(spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET), true), user);
  const teachers = listActiveTeamUsers_().map(function (item) {
    return { teacherId: item.teacherId, name: item.name, email: item.email };
  });
  return {
    students: visibleStudents,
    archived: visibleArchive,
    teachers: user.role === 'manager' ? teachers : teachers.filter(function (item) { return item.teacherId === user.teacherId; }),
    spreadsheetName: spreadsheet.getName(),
    spreadsheetUrl: spreadsheet.getUrl(),
    viewerEmail: user.email,
    viewerRole: user.role,
    refreshedAt: new Date().toISOString(),
  };
}

function addStudents(input, user) {
  requireTeamUser_(user);
  const request = Array.isArray(input) ? { records: input } : (input || {});
  const records = request.records;
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
    const owner = resolveTeacherOwner_(request.teacherId, user);
    const intakeMonth = normalizeMonth_(request.intakeMonth) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
    const usedKeys = new Set(existing.map(enrollmentKey_));
    const now = new Date().toISOString();
    const actor = user.email;
    const rows = [];
    const added = [];
    const skipped = [];

    records.forEach(function (input) {
      const record = sanitizeStudent_(input || {});
      record.intakeMonth = intakeMonth;
      record.teacherId = owner.teacherId;
      record.teacherName = owner.name;
      record.studentStatus = record.studentStatus || 'Mới';
      const duplicateKey = enrollmentKey_(record);
      if (usedKeys.has(duplicateKey)) {
        skipped.push({
          fullName: record.fullName || 'Không rõ tên',
          reason: 'Đã có trong cùng lớp và tháng',
        });
        return;
      }

      record.id = Utilities.getUuid();
      record.createdAt = now;
      record.updatedAt = now;
      record.createdBy = actor;
      rows.push(studentToRow_(record));
      added.push(record);
      usedKeys.add(duplicateKey);
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

    return { ok: true, addedCount: added.length, added: added, skipped: skipped };
  });
}

function updateStudent(input, user) {
  requireTeamUser_(user);
  return withDocumentLock_(function () {
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const requestedId = cleanText_(input && input.id, 80);
    if (!requestedId) throw new Error('Thiếu ID học viên cần cập nhật.');
    const rowNumber = findRowById_(sheet, requestedId);
    if (!rowNumber) throw new Error('Không tìm thấy học viên. Hãy tải lại dữ liệu.');

    const oldRecord = studentFromRow_(sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getValues()[0], false);
    assertCanAccessRecord_(oldRecord, user);
    const record = sanitizeStudent_(input || {});
    const owner = resolveTeacherOwner_(record.teacherId || oldRecord.teacherId, user);
    record.teacherId = owner.teacherId;
    record.teacherName = owner.name;
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

function setPaymentStatus(input, user) {
  requireTeamUser_(user);
  return withDocumentLock_(function () {
    const id = cleanText_(input && input.id, 80);
    const field = cleanText_(input && input.field, 40);
    if (!id || ['depositPaid', 'tuitionPaid'].indexOf(field) === -1) throw new Error('Yêu cầu cập nhật học phí không hợp lệ.');
    const spreadsheet = getSpreadsheet_();
    const sheet = spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET);
    const rowNumber = findRowById_(sheet, id);
    if (!rowNumber) throw new Error('Không tìm thấy học viên. Hãy tải lại dữ liệu.');
    const record = studentFromRow_(sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getValues()[0], false);
    assertCanAccessRecord_(record, user);
    record[field] = toBoolean_(input.value);
    if (field === 'depositPaid') record.depositDate = record.depositPaid ? (record.depositDate || today_()) : '';
    if (field === 'tuitionPaid' && record.tuitionPaid) {
      record.amountPaid = record.tuitionAmount;
    }
    record.amountRemaining = Math.max(record.tuitionAmount - record.amountPaid, 0);
    record.updatedAt = new Date().toISOString();
    sheet.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).setValues([studentToRow_(record)]);
    formatDataRows_(sheet, rowNumber, 1, STUDENT_HEADERS.length);
    appendAudit_('PAYMENT', 'Cập nhật học phí: ' + record.fullName + ' · ' + field + '=' + record[field], record.id, user.email);
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

    const row = source.getRange(rowNumber, 1, 1, STUDENT_HEADERS.length).getValues()[0];
    const record = studentFromRow_(row, false);
    assertCanAccessRecord_(record, user);
    const now = new Date().toISOString();
    const actor = user.email;
    const targetRow = target.getLastRow() + 1;
    target.getRange(targetRow, 3).setNumberFormat('@');
    target.getRange(targetRow, 1, 1, ARCHIVE_HEADERS.length).setValues([studentToArchiveRow_(record, now, actor)]);
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

    const row = source.getRange(rowNumber, 1, 1, ARCHIVE_HEADERS.length).getValues()[0];
    const record = studentFromRow_(row, true);
    assertCanAccessRecord_(record, user);
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
    const record = studentFromRow_(sheet.getRange(rowNumber, 1, 1, ARCHIVE_HEADERS.length).getValues()[0], true);
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
  let needsFormatting = false;
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    needsFormatting = true;
  }
  if (sheet.getMaxColumns() < headers.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  }
  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (currentHeaders.join('|') !== headers.join('|')) {
    if (canUpgradeLegacyHeaders_(name, currentHeaders)) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      needsFormatting = true;
    } else if (sheet.getLastRow() > 1 && currentHeaders.some(Boolean)) {
      throw new Error('Tab ' + name + ' có tiêu đề cột không đúng. Không tự ghi đè để tránh mất dữ liệu.');
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      needsFormatting = true;
    }
  }
  if (needsFormatting) formatManagedSheet_(sheet, name, headers.length, color);
  return sheet;
}

function canUpgradeLegacyHeaders_(name, currentHeaders) {
  if (name === APP_CONFIG.STUDENTS_SHEET) {
    return currentHeaders.slice(0, LEGACY_STUDENT_HEADERS.length).join('|') === LEGACY_STUDENT_HEADERS.join('|') &&
      currentHeaders.slice(LEGACY_STUDENT_HEADERS.length).every(function (value) { return !value; });
  }
  if (name === APP_CONFIG.ARCHIVE_SHEET) {
    const legacyArchive = LEGACY_STUDENT_HEADERS.concat(['Ngày lưu trữ', 'Người lưu trữ']);
    return currentHeaders.slice(0, legacyArchive.length).join('|') === legacyArchive.join('|') &&
      currentHeaders.slice(legacyArchive.length).every(function (value) { return !value; });
  }
  return false;
}

function backfillBusinessData_(spreadsheet) {
  let usersByEmail = {};
  try {
    listActiveTeamUsers_().forEach(function (user) { usersByEmail[user.email] = user; });
  } catch (_) {}
  backfillSheet_(spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET), false, usersByEmail);
  backfillSheet_(spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET), true, usersByEmail);
}

function backfillSheet_(sheet, archived, usersByEmail) {
  if (!sheet || sheet.getLastRow() < 2) return;
  const startColumn = archived ? LEGACY_STUDENT_HEADERS.length + 3 : LEGACY_STUDENT_HEADERS.length + 1;
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, archived ? ARCHIVE_HEADERS.length : STUDENT_HEADERS.length).getValues();
  const values = rows.map(function (row) {
    const offset = startColumn - 1;
    const creator = String(row[9] || '').trim().toLowerCase();
    const owner = usersByEmail[creator] || {};
    const tuitionAmount = toNumber_(row[offset + 7]);
    const amountPaid = toNumber_(row[offset + 8]);
    return [
      normalizeMonth_(row[offset]) || monthFromDate_(row[7]) || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM'),
      cleanText_(row[offset + 1], 80).toLowerCase() || owner.teacherId || '',
      cleanText_(row[offset + 2], 150) || owner.name || 'Chưa gán',
      toBoolean_(row[offset + 3]),
      toNumber_(row[offset + 4]),
      normalizeDateValue_(row[offset + 5]),
      toBoolean_(row[offset + 6]),
      tuitionAmount,
      amountPaid,
      Math.max(tuitionAmount - amountPaid, 0),
      normalizeStudentStatus_(row[offset + 10]),
      cleanText_(row[offset + 11], 500),
    ];
  });
  sheet.getRange(2, startColumn, values.length, BUSINESS_HEADERS.length).setValues(values);
}

function formatManagedSheets_(spreadsheet) {
  formatManagedSheet_(spreadsheet.getSheetByName(APP_CONFIG.STUDENTS_SHEET), APP_CONFIG.STUDENTS_SHEET, STUDENT_HEADERS.length, '#1d4ed8');
  formatManagedSheet_(spreadsheet.getSheetByName(APP_CONFIG.ARCHIVE_SHEET), APP_CONFIG.ARCHIVE_SHEET, ARCHIVE_HEADERS.length, '#64748b');
  formatManagedSheet_(spreadsheet.getSheetByName(APP_CONFIG.AUDIT_SHEET), APP_CONFIG.AUDIT_SHEET, AUDIT_HEADERS.length, '#0f766e');
}

function formatManagedSheet_(sheet, name, columnCount, color) {
  if (!sheet) return;
  sheet.setFrozenRows(1);
  sheet.setTabColor(color);
  sheet.setHiddenGridlines(true);
  sheet.setRowHeight(1, 42);
  sheet.getRange(1, 1, 1, columnCount)
    .setBackground(color)
    .setFontColor('#ffffff')
    .setFontFamily('Arial')
    .setFontSize(10)
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);

  const widths = name === APP_CONFIG.AUDIT_SHEET
    ? [150, 190, 150, 360, 120]
    : (name === APP_CONFIG.ARCHIVE_SHEET
      ? [90, 180, 125, 220, 220, 135, 120, 155, 155, 190, 320, 155, 190, 110, 90, 170, 90, 115, 115, 105, 120, 120, 120, 150, 260]
      : [90, 180, 125, 220, 220, 135, 120, 155, 155, 190, 320, 110, 90, 170, 90, 115, 115, 105, 120, 120, 120, 150, 260]);
  widths.slice(0, columnCount).forEach(function (width, index) {
    sheet.setColumnWidth(index + 1, width);
  });

  if (name !== APP_CONFIG.AUDIT_SHEET) {
    sheet.hideColumns(1);
    sheet.hideColumns(7, 5);
    sheet.hideColumns(name === APP_CONFIG.ARCHIVE_SHEET ? 15 : 13);
    sheet.setFrozenColumns(2);
  }
  if (sheet.getLastRow() > 1) {
    formatDataRows_(sheet, 2, sheet.getLastRow() - 1, columnCount);
  }
}

function readStudents_(sheet, archived) {
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = archived ? ARCHIVE_HEADERS.length : STUDENT_HEADERS.length;
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, width)
    .getValues()
    .filter(function (row) { return row[0]; })
    .map(function (row) { return studentFromRow_(row, archived); })
    .reverse();
}

function studentFromRow_(row, archived) {
  const businessOffset = archived ? LEGACY_STUDENT_HEADERS.length + 2 : LEGACY_STUDENT_HEADERS.length;
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
    intakeMonth: row[businessOffset] || '',
    teacherId: row[businessOffset + 1] || '',
    teacherName: row[businessOffset + 2] || '',
    depositPaid: toBoolean_(row[businessOffset + 3]),
    depositAmount: toNumber_(row[businessOffset + 4]),
    depositDate: normalizeDateValue_(row[businessOffset + 5]),
    tuitionPaid: toBoolean_(row[businessOffset + 6]),
    tuitionAmount: toNumber_(row[businessOffset + 7]),
    amountPaid: toNumber_(row[businessOffset + 8]),
    amountRemaining: toNumber_(row[businessOffset + 9]),
    studentStatus: row[businessOffset + 10] || 'Mới',
    notes: row[businessOffset + 11] || '',
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
    safeCell_(record.intakeMonth),
    safeCell_(record.teacherId),
    safeCell_(record.teacherName),
    Boolean(record.depositPaid),
    toNumber_(record.depositAmount),
    safeCell_(record.depositDate),
    Boolean(record.tuitionPaid),
    toNumber_(record.tuitionAmount),
    toNumber_(record.amountPaid),
    Math.max(toNumber_(record.tuitionAmount) - toNumber_(record.amountPaid), 0),
    safeCell_(record.studentStatus || 'Mới'),
    safeCell_(record.notes),
  ];
}

function studentToArchiveRow_(record, archivedAt, archivedBy) {
  const activeRow = studentToRow_(record);
  return activeRow.slice(0, LEGACY_STUDENT_HEADERS.length)
    .concat([archivedAt, archivedBy])
    .concat(activeRow.slice(LEGACY_STUDENT_HEADERS.length));
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
    intakeMonth: normalizeMonth_(input.intakeMonth),
    teacherId: cleanText_(input.teacherId, 80).toLowerCase(),
    teacherName: cleanText_(input.teacherName, 150),
    depositPaid: toBoolean_(input.depositPaid),
    depositAmount: toNumber_(input.depositAmount),
    depositDate: cleanText_(input.depositDate, 30),
    tuitionPaid: toBoolean_(input.tuitionPaid),
    tuitionAmount: toNumber_(input.tuitionAmount),
    amountPaid: toNumber_(input.amountPaid),
    amountRemaining: toNumber_(input.amountRemaining),
    studentStatus: normalizeStudentStatus_(input.studentStatus),
    notes: cleanText_(input.notes, 500),
  };
  const missing = [];
  if (!record.fullName) missing.push('Họ tên');
  if (!record.phoneNumber) missing.push('SĐT');
  if (!record.email) missing.push('Email');
  if (!record.facebookUrl) missing.push('Facebook');
  if (!record.classCode) missing.push('Mã lớp');
  record.status = missing.length ? 'Thiếu ' + missing.join(', ') : 'Đầy đủ';
  record.amountRemaining = Math.max(record.tuitionAmount - record.amountPaid, 0);
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

function normalizeMonth_(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(0[1-9]|1[0-2])/);
  return match ? match[1] + '-' + match[2] : '';
}

function monthFromDate_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM');
  }
  return normalizeMonth_(String(value || '').slice(0, 7));
}

function normalizeDateValue_(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const match = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function today_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function toBoolean_(value) {
  if (value === true) return true;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return ['true', '1', 'yes', 'x', 'đã đóng', 'đã cọc'].indexOf(text) !== -1;
}

function toNumber_(value) {
  if (typeof value === 'number') return isFinite(value) ? Math.max(value, 0) : 0;
  const normalized = String(value == null ? '' : value).replace(/[^0-9.-]/g, '');
  const number = Number(normalized);
  return isFinite(number) ? Math.max(number, 0) : 0;
}

function normalizeStudentStatus_(value) {
  const allowed = ['Mới', 'Đang tư vấn', 'Đã xếp lớp', 'Đang học', 'Hoàn thành', 'Ngưng'];
  const text = cleanText_(value, 80);
  return allowed.indexOf(text) !== -1 ? text : 'Mới';
}

function enrollmentKey_(record) {
  const contact = normalizePhone_(record.phoneNumber) || String(record.email || '').trim().toLowerCase() || String(record.fullName || '').trim().toLowerCase();
  return [contact, normalizeClass_(record.classCode), normalizeMonth_(record.intakeMonth)].join('|');
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
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, rows.length, AUDIT_HEADERS.length).setValues(rows);
  formatDataRows_(sheet, startRow, rows.length, AUDIT_HEADERS.length);
}

function formatDataRows_(sheet, startRow, rowCount, columnCount) {
  if (!rowCount) return;
  const sheetName = sheet.getName();
  sheet.getRange(startRow, 1, rowCount, columnCount)
    .setFontFamily('Arial')
    .setFontSize(10)
    .setVerticalAlignment('middle')
    .setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP)
    .setBorder(null, null, true, null, null, true, '#e2e8f0', SpreadsheetApp.BorderStyle.SOLID);
  sheet.setRowHeights(startRow, rowCount, 38);
  if (sheetName === APP_CONFIG.STUDENTS_SHEET || sheetName === APP_CONFIG.ARCHIVE_SHEET) {
    const businessStart = sheetName === APP_CONFIG.ARCHIVE_SHEET ? 14 : 12;
    sheet.getRange(startRow, 2, rowCount, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    sheet.getRange(startRow, 7, rowCount, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.WRAP);
    sheet.getRange(startRow, 3, rowCount, 1).setNumberFormat('@');
    sheet.getRange(startRow, 3, rowCount, 1).setHorizontalAlignment('center');
    sheet.getRange(startRow, 6, rowCount, 4).setHorizontalAlignment('center');
    formatCheckboxRange_(sheet.getRange(startRow, businessStart + 3, rowCount, 1));
    formatCheckboxRange_(sheet.getRange(startRow, businessStart + 6, rowCount, 1));
    sheet.getRange(startRow, businessStart + 4, rowCount, 1).setNumberFormat('#,##0');
    sheet.getRange(startRow, businessStart + 7, rowCount, 3).setNumberFormat('#,##0');
    sheet.getRange(startRow, businessStart + 10, rowCount, 1).setDataValidation(
      SpreadsheetApp.newDataValidation()
        .requireValueInList(['Mới', 'Đang tư vấn', 'Đã xếp lớp', 'Đang học', 'Hoàn thành', 'Ngưng'], true)
        .setAllowInvalid(false)
        .build()
    );
    sheet.getRange(startRow, businessStart, rowCount, 1).setHorizontalAlignment('center');
    sheet.getRange(startRow, businessStart + 2, rowCount, 1).setHorizontalAlignment('left');
    sheet.getRange(startRow, businessStart + 3, rowCount, 8).setHorizontalAlignment('center');
  }
}

function formatCheckboxRange_(range) {
  const values = range.getValues().map(function (row) { return [toBoolean_(row[0])]; });
  range.insertCheckboxes();
  range.setValues(values);
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

function filterRecordsForUser_(records, user) {
  if (user.role === 'manager') return records;
  return records.filter(function (record) { return record.teacherId === user.teacherId; });
}

function assertCanAccessRecord_(record, user) {
  if (user.role !== 'manager' && record.teacherId !== user.teacherId) {
    throw new Error('Bạn chỉ được thao tác với học viên do mình phụ trách.');
  }
}

function resolveTeacherOwner_(requestedTeacherId, user) {
  const wanted = user.role === 'manager'
    ? (cleanText_(requestedTeacherId, 80).toLowerCase() || user.teacherId)
    : user.teacherId;
  const owner = listActiveTeamUsers_().find(function (item) { return item.teacherId === wanted; });
  if (!owner) throw new Error('Không tìm thấy giáo viên phụ trách trong tab Users.');
  return owner;
}

function getTeamUsersSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty(APP_CONFIG.USERS_SPREADSHEET_ID_KEY);
  if (!spreadsheetId) throw new Error('Chưa đặt Script Property ' + APP_CONFIG.USERS_SPREADSHEET_ID_KEY + '.');
  const sheet = SpreadsheetApp.openById(spreadsheetId).getSheetByName(TEAM_USERS_SHEET);
  if (!sheet) throw new Error('Không tìm thấy tab Users trong Sheet phân quyền.');
  return sheet;
}

function findActiveTeamUser_(email) {
  const wanted = String(email || '').trim().toLowerCase();
  return listActiveTeamUsers_().find(function (user) { return user.email === wanted; }) || null;
}

function listActiveTeamUsers_() {
  const sheet = getTeamUsersSheet_();
  if (sheet.getLastRow() < 2) return [];
  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, TEAM_USERS_HEADERS.length).getDisplayValues();
  const users = [];
  for (let i = 0; i < rows.length; i++) {
    const active = String(rows[i][4] || '').trim().toLowerCase();
    if (['true', '1', 'yes', 'x'].includes(active)) {
      const email = String(rows[i][0] || '').trim().toLowerCase();
      users.push({
        email: email,
        name: String(rows[i][1] || '').trim() || email,
        role: String(rows[i][2] || '').trim().toLowerCase() === 'manager' ? 'manager' : 'teacher',
        teacherId: String(rows[i][3] || '').trim().toLowerCase(),
      });
    }
  }
  return users.filter(function (user) { return user.email && user.teacherId; });
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
