const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'Code.gs'), 'utf8');
const teamEmail = 'mbi.maybebach@gmail.com';
const sample = {
  name: 'Nguyễn Minh Anh',
  email: 'student@example.test',
  phone: '0900000000',
  facebook: 'https://www.facebook.com/example.student',
  className: 'MBWrite01 dec26 | Hồ Bách'
};

function createApp({ mailError = null } = {}) {
  const mailCalls = [];
  const formatCalls = [];
  const errors = [];
  const context = vm.createContext({
    console: { error: (...args) => errors.push(args) },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput(text) {
        return {
          text,
          setMimeType(mimeType) {
            this.mimeType = mimeType;
            return this;
          }
        };
      }
    },
    MailApp: {
      sendEmail(message) {
        mailCalls.push(message);
        if (mailError) throw mailError;
      }
    },
    Utilities: {
      formatDate(date, timeZone, pattern) {
        formatCalls.push({ date, timeZone, pattern });
        return '24/11/2026 09:15:00';
      }
    }
  });
  vm.runInContext(source, context, { filename: 'Code.gs' });
  return {
    mailCalls,
    formatCalls,
    errors,
    request(event) {
      const output = context.doPost(event);
      assert.equal(output.mimeType, 'application/json');
      return JSON.parse(output.text);
    },
    submit(payload) {
      return this.request({ postData: { contents: JSON.stringify(payload) } });
    }
  };
}

const currentTeachers = [
  { name: 'Hồ Bách', code: 'MBWrite01+ dec26', recipients: [teamEmail] },
  { name: 'Tuệ Nhi', code: 'MBWrite02 dec26', recipients: [teamEmail, 'miiiimeoooo911@gmail.com'] },
  { name: 'Gia Khang', code: 'MBWrite06 dec26', recipients: [teamEmail, 'khanglxagwwe@gmail.com'] },
  { name: 'Bình An', code: 'MBWrite19 dec26', recipients: [teamEmail, 'mbi.binhan@gmail.com'] },
  { name: 'Lan Trinh', code: 'MBSpeak07 dec26', recipients: [teamEmail, 'mbi.cicintcilly@gmail.com'] },
  { name: 'Quỳnh Kem', code: 'MBSpeak08 dec26', recipients: [teamEmail, 'mbi.qkem@gmail.com'] }
];

for (const teacher of currentTeachers) {
  test(`accepts ${teacher.name} and routes one registration email`, () => {
    const app = createApp();
    const payload = { ...sample, className: `${teacher.code} | ${teacher.name}` };
    assert.deepEqual(app.submit(payload), { status: 'success' });
    assert.equal(app.mailCalls.length, 1);
    const email = app.mailCalls[0];
    const recipients = email.to.split(',');
    assert.deepEqual(recipients, teacher.recipients);
    assert.equal(new Set(recipients).size, recipients.length);
    assert.equal(email.replyTo, sample.email);
    assert.equal(email.name, 'may(be)ielts.');
    assert.ok(email.subject.includes(payload.className));
    for (const value of Object.values(payload)) assert.ok(email.body.includes(value));
    assert.ok(email.body.includes('Giáo viên: ' + teacher.name));
    assert.ok(email.body.includes('24/11/2026 09:15:00'));
    assert.equal(app.formatCalls.length, 1);
    assert.equal(app.formatCalls[0].timeZone, 'Asia/Ho_Chi_Minh');
    assert.equal(app.formatCalls[0].pattern, 'dd/MM/yyyy HH:mm:ss');
    assert.equal(app.errors.length, 0);
  });
}

test('routes an unmapped future teacher to the shared team inbox', () => {
  const app = createApp();
  assert.deepEqual(app.submit({ ...sample, className: 'MBWrite25 jan27 | Nguyễn Mai' }), { status: 'success' });
  assert.equal(app.mailCalls.length, 1);
  assert.equal(app.mailCalls[0].to, teamEmail);
  assert.ok(app.mailCalls[0].body.includes('Giáo viên: Nguyễn Mai'));
});

test('preserves existing routing after normalizing accents, case and spacing', () => {
  for (const [teacher, recipients] of [
    ['  HO  BACH ', [teamEmail]],
    [' TUỆ   NHI ', [teamEmail, 'miiiimeoooo911@gmail.com']],
    [' gia   khang ', [teamEmail, 'khanglxagwwe@gmail.com']]
  ]) {
    const app = createApp();
    assert.equal(app.submit({ ...sample, className: 'MBWrite01 dec26 | ' + teacher }).status, 'success');
    assert.deepEqual(app.mailCalls[0].to.split(','), recipients);
  }
});

test('routes each new teacher alias to the personal inbox and team', () => {
  for (const [teacher, address] of [
    ['Kem', 'mbi.qkem@gmail.com'],
    ['Quỳnh Kem', 'mbi.qkem@gmail.com'],
    [' QUYNH   KEM ', 'mbi.qkem@gmail.com'],
    ['Cici', 'mbi.cicintcilly@gmail.com'],
    ['CC', 'mbi.cicintcilly@gmail.com'],
    ['Lan Trinh', 'mbi.cicintcilly@gmail.com'],
    [' LAN   TRINH ', 'mbi.cicintcilly@gmail.com'],
    ['Bình An', 'mbi.binhan@gmail.com'],
    [' BINH   AN ', 'mbi.binhan@gmail.com']
  ]) {
    const app = createApp();
    assert.deepEqual(app.submit({ ...sample, className: 'MBSpeak07 dec26 | ' + teacher }), { status: 'success' });
    assert.equal(app.mailCalls.length, 1);
    assert.deepEqual(app.mailCalls[0].to.split(','), [teamEmail, address]);
  }
});

test('rejects malformed or missing payloads before sending email', () => {
  const invalidEvents = [
    undefined,
    {},
    { postData: {} },
    { postData: { contents: '' } },
    { postData: { contents: '{invalid' } },
    { postData: { contents: 'null' } },
    { postData: { contents: '[]' } }
  ];
  for (const event of invalidEvents) {
    const app = createApp();
    const result = app.request(event);
    assert.equal(result.status, 'error');
    assert.ok(result.message);
    assert.equal(app.mailCalls.length, 0);
  }
});

test('rejects every missing or blank required field without sending email', () => {
  for (const field of Object.keys(sample)) {
    for (const value of [undefined, null, '', ' \r\n ']) {
      const app = createApp();
      assert.equal(app.submit({ ...sample, [field]: value }).status, 'error');
      assert.equal(app.mailCalls.length, 0);
    }
  }
});

test('rejects invalid learner email addresses without sending email', () => {
  for (const address of ['student', 'student@', 'student@example', '@example.test', 'student @example.test', 'student@example.test\r\nBcc: other@example.test']) {
    const app = createApp();
    assert.equal(app.submit({ ...sample, email: address }).status, 'error');
    assert.equal(app.mailCalls.length, 0);
  }
});

test('requires the teacher component of a selected class', () => {
  for (const className of ['MBWrite01 dec26', 'MBWrite01 dec26 |', 'MBWrite01 dec26 |   ']) {
    const app = createApp();
    assert.equal(app.submit({ ...sample, className }).status, 'error');
    assert.equal(app.mailCalls.length, 0);
  }
});

test('returns an error when email delivery fails', () => {
  const app = createApp({ mailError: new Error('Email service unavailable') });
  const result = app.submit(sample);
  assert.deepEqual(result, { status: 'error', message: 'Email service unavailable' });
  assert.equal(app.mailCalls.length, 1);
  assert.equal(app.errors.length, 1);
});
