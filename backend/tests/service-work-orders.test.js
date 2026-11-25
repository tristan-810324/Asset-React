// Tests for Job / Service Requests: routing by category, the GSO and ITSS staff workflow, requester confirmation,
// and the automatic reminder and closing. They run against a real PostgreSQL database, the same way as the other tests.
//
//   $env:TEST_DATABASE_URL = "postgres://postgres@127.0.0.1:55432/asset_test"
//   node --test --test-concurrency=1 tests/service-work-orders.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  test('service work orders (set TEST_DATABASE_URL to an empty *_test database to run)', { skip: true }, () => {});
  return;
}
if (!new URL(testDatabaseUrl).pathname.endsWith('_test')) {
  throw new Error('TEST_DATABASE_URL must point at a database whose name ends in "_test".');
}

Object.assign(process.env, {
  DATABASE_URL: testDatabaseUrl,
  JWT_SECRET: 'service-work-orders-test-secret-'.padEnd(40, 'x'),
  SMTP_HOST: 'smtp.invalid',
  SMTP_PORT: '587',
  SMTP_USER: 'gso@invalid',
  SMTP_PASS: 'not-used',
});
// Nothing is sent for real: the fake transport records each message so the tests can check it.
const nodemailer = require('nodemailer');
const sentMail = [];
nodemailer.createTransport = () => ({ sendMail: async (message) => { sentMail.push(message); } });

const pool = require('../src/config/db');
const requestsService = require('../src/modules/requests/requests.service');
const workOrders = require('../src/modules/requests/service-work-orders.service');

const requester = { id: '3', name: 'Requester One', email: 'requester@invalid', roles: ['BORROWER'] };
const gsoOne = { id: '1', name: 'GSO Staff One', roles: ['GSO_STAFF'] };
// A 1x1 PNG, enough to pass the photo format check.
const tinyPhoto = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const gsoTwo = { id: '2', name: 'GSO Staff Two', roles: ['GSO_STAFF'] };
const itStaff = { id: '4', name: 'IT Staff One', roles: ['IT_STAFF'] };
const itAdmin = { id: '5', name: 'IT Admin One', roles: ['IT_ADMIN'] };

const one = async (sql, params) => (await pool.query(sql, params)).rows[0];
const rejects = (promise, pattern, status) => assert.rejects(promise, (error) => {
  assert.match(error.message, pattern);
  if (status) assert.equal(error.status, status);
  return true;
});
const isoDate = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const submitJob = (overrides = {}, user = requester) => requestsService.createRequest({
  requestType: 'JOB_REQUEST',
  formData: {
    departmentOrganization: 'Registrar',
    location: 'Room 204',
    serviceCategory: 'ELECTRICAL_LIGHTING',
    purpose: 'The lights flicker during class.',
    requiredDate: isoDate(10),
    tasks: [{ quantity: 1, particulars: 'Ceiling light', natureOfWork: 'Check and replace the tube' }],
    remarks: '',
    ...overrides,
  },
}, user);

const workOrderRow = (id) => one('SELECT * FROM service_work_orders WHERE request_id = $1', [id]);
const requestStatus = async (id) => (await one('SELECT status FROM service_requests WHERE id = $1', [id])).status;
const notificationsFor = async (userId, title, referenceNo) => (await one(
  `SELECT COUNT(*)::INTEGER AS n FROM app_notifications
    WHERE recipient_user_id = $1 AND title = $2 AND message LIKE $3`,
  [userId, title, `${referenceNo}:%`],
)).n;
const firstTask = async (id, user) => (await workOrders.getWorkOrder(id, user)).tasks[0];

const seed = `
  INSERT INTO users (id, name, email, password_hash) VALUES
    (1, 'GSO Staff One', 'gso@invalid', 'x'),
    (2, 'GSO Staff Two', 'gso2@invalid', 'x'),
    (3, 'Requester One', 'requester@invalid', 'x'),
    (4, 'IT Staff One', 'it@invalid', 'x'),
    (5, 'IT Admin One', 'itadmin@invalid', 'x');
  INSERT INTO user_roles (user_id, role_id)
    SELECT account.id, role.id
      FROM (VALUES (1, 'GSO_STAFF'), (2, 'GSO_STAFF'), (3, 'BORROWER'), (4, 'IT_STAFF'), (5, 'IT_ADMIN')) AS account(id, role_key)
      JOIN roles AS role ON role.role_key = account.role_key;
  INSERT INTO requester_identity_profiles (user_id, employee_code, first_name, last_name, department, position, contact_number, verification_status)
    VALUES (3, 'EMP-3', 'Ana', 'Reyes', 'Registrar', 'Clerk', '09171234567', 'Verified');
`;

test.before(async () => {
  const { rows } = await pool.query("SELECT COUNT(*)::INTEGER AS tables FROM information_schema.tables WHERE table_schema = 'public'");
  if (rows[0].tables) throw new Error('The test database must be empty; it already has tables.');
  const migrationsDir = path.join(__dirname, '../database/migrations');
  for (const file of fs.readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(fs.readFileSync(path.join(migrationsDir, file), 'utf8'));
  }
  await pool.query(seed);
});

test.after(async () => {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await pool.end();
});

test('the category decides the team and the client cannot choose either', async () => {
  const request = await submitJob({ serviceCategory: 'ELECTRICAL_LIGHTING', serviceRoute: 'ITSS', servicePriority: 'URGENT' });
  const work = await workOrderRow(request.id);
  assert.equal(work.route_team, 'GSO');
  assert.equal(work.service_category, 'ELECTRICAL_LIGHTING');
  assert.equal(work.priority, 'STANDARD', 'a job ten days away starts as Standard');
  assert.equal(request.serviceWorkflow.routeTeam, 'GSO');
  assert.equal(request.status, 'Submitted');
  assert.equal((await workOrderRow(request.id)).route_team, 'GSO');
});

test('a computer job goes to ITSS, and only IT Staff are told about it', async () => {
  const request = await submitJob({ serviceCategory: 'NETWORK_CONNECTIVITY', location: 'Computer Lab 3' });
  assert.equal((await workOrderRow(request.id)).route_team, 'ITSS');
  assert.equal(await notificationsFor(4, 'New service request', request.referenceNo), 1);
  assert.equal(await notificationsFor(1, 'New service request', request.referenceNo), 0);
});

test('a safety hazard is urgent, and a job due today is urgent', async () => {
  const hazard = await submitJob({ serviceCategory: 'SAFETY_HAZARD' });
  assert.equal(hazard.priority, 'Urgent');
  const dueToday = await submitJob({ requiredDate: isoDate(0) });
  assert.equal(dueToday.priority, 'Urgent');
  const later = await submitJob({ requiredDate: isoDate(2) });
  assert.equal(later.priority, 'High');
});

test('an unknown category or a missing location is refused', async () => {
  await rejects(submitJob({ serviceCategory: 'PAINTING' }), /service category/, 400);
  await rejects(submitJob({ location: '' }), /location/, 400);
});

test('claiming assigns the job without moving it, and a second staff member is refused', async () => {
  const request = await submitJob();
  const claimed = await workOrders.claimWorkOrder(request.id, gsoOne);
  assert.equal(claimed.status, 'Submitted');
  assert.equal(claimed.assignedStaffId, '1');
  await rejects(workOrders.claimWorkOrder(request.id, gsoTwo), /already claimed/, 409);
});

test('only the staff member who claimed the job can start its review, and the review starts once', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await rejects(workOrders.reviewWorkOrder(request.id, {}, gsoTwo), /Claim this job first/, 403);
  const reviewed = await workOrders.reviewWorkOrder(request.id, {}, gsoOne);
  assert.equal(reviewed.status, 'Under Review');
  await rejects(workOrders.reviewWorkOrder(request.id, {}, gsoOne), /already under review/, 409);
});

test('more information goes to the requester, who replies, and work can start again with the same staff member', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  const asked = await workOrders.requestMoreInformation(request.id, { message: 'Which floor is Room 204 on?' }, gsoOne);
  assert.equal(asked.status, 'Needs Information');
  assert.equal(await notificationsFor(3, 'More information needed', request.referenceNo), 1);
  const replied = await requestsService.respondMine(request.id, { message: 'Second floor' }, requester);
  assert.equal(replied.status, 'Submitted');
  const started = await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  assert.equal(started.status, 'In Progress');
});

test('a job routed to the wrong team becomes a new job in the other queue, with its transfer history', async () => {
  const request = await submitJob({ serviceCategory: 'ELECTRICAL_LIGHTING' });
  await workOrders.claimWorkOrder(request.id, gsoOne);
  const forwarded = await workOrders.forwardWorkOrder(request.id, { team: 'ITSS', note: 'Projector cable problem' }, gsoOne);
  assert.equal(forwarded.routeTeam, 'ITSS');
  assert.equal(forwarded.status, 'Submitted');
  assert.equal(forwarded.assignedStaffId, null);
  assert.equal(forwarded.transfers.length, 1);
  assert.match(forwarded.transfers[0].note, /Forwarded from GSO to ITSS/);
  await rejects(workOrders.getWorkOrder(request.id, gsoOne), /do not have access to the ITSS/, 403);
  const claimedByIt = await workOrders.claimWorkOrder(request.id, itStaff);
  assert.equal(claimedByIt.assignedStaffId, '4');
});

test('IT Staff can reject a job that has not started, and the requester is told the reason', async () => {
  const request = await submitJob({ serviceCategory: 'SOFTWARE_ACCESS' });
  await workOrders.claimWorkOrder(request.id, itStaff);
  const rejected = await workOrders.rejectWorkOrder(request.id, { reason: 'Not an ITSS concern. Please contact GSO.' }, itStaff);
  assert.equal(rejected.status, 'Rejected');
  assert.equal(rejected.closureType, 'REJECTED');
  assert.equal(await notificationsFor(3, 'Service request declined', request.referenceNo), 1);
});

test('work cannot be rejected or started by someone who did not claim it', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await rejects(workOrders.rejectWorkOrder(request.id, { reason: 'No' }, gsoTwo), /Claim this job first/, 403);
  await rejects(workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoTwo), /Claim this job first/, 403);
});

test('a completed job waits for the requester, who confirms it, and the record keeps the closure type', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  const task = await firstTask(request.id, gsoOne);
  await rejects(workOrders.completeWork(request.id, {
    completionNote: 'Checked.',
    resolutionType: 'FIXED',
    taskUpdates: [{ id: task.id, completed: false }],
  }, gsoOne), /Complete every task/, 400);
  const done = await workOrders.completeWork(request.id, {
    completionNote: 'Replaced the tube and tested the switch.',
    resolutionType: 'REPLACED',
    taskUpdates: [{ id: task.id, completed: true }],
  }, gsoOne);
  assert.equal(done.status, 'Awaiting Requester Confirmation');
  assert.ok(sentMail.some((message) => message.to === 'requester@invalid' && message.subject.includes('Please confirm your service request')));

  const confirmed = await requestsService.confirmServiceMine(request.id, { note: 'Thank you' }, requester);
  assert.equal(confirmed.status, 'Closed');
  assert.equal(confirmed.serviceWorkflow.closureType, 'REQUESTER_CONFIRMED');
});

test('an unfinished checklist can be completed when the remaining item is explained', async () => {
  const request = await submitJob({
    tasks: [
      { quantity: 1, particulars: 'Light A', natureOfWork: 'Replace the tube' },
      { quantity: 1, particulars: 'Light B', natureOfWork: 'Replace the starter' },
    ],
  });
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  const tasks = (await workOrders.getWorkOrder(request.id, gsoOne)).tasks;
  const done = await workOrders.completeWork(request.id, {
    completionNote: 'Light A is fixed.',
    resolutionType: 'FIXED',
    taskUpdates: [{ id: tasks[0].id, completed: true }, { id: tasks[1].id, completed: false }],
    incompleteReason: 'Light B needs a new starter that is on order.',
  }, gsoOne);
  assert.equal(done.status, 'Awaiting Requester Confirmation');
  assert.equal(done.incompleteReason, 'Light B needs a new starter that is on order.');
});

test('a reopened job returns to In Progress and the reopen count is kept', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  await workOrders.completeWork(request.id, {
    completionNote: 'Fixed.',
    resolutionType: 'FIXED',
    taskUpdates: [{ id: (await firstTask(request.id, gsoOne)).id, completed: true }],
  }, gsoOne);
  const reopened = await requestsService.reopenServiceMine(request.id, { message: 'The light still flickers.' }, requester);
  assert.equal(reopened.status, 'In Progress');
  assert.equal((await workOrderRow(request.id)).reopen_count, 1);
});

test('a requester who does not answer gets one reminder, then the completed job closes automatically', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  await workOrders.completeWork(request.id, {
    completionNote: 'Fixed.',
    resolutionType: 'FIXED',
    taskUpdates: [{ id: (await firstTask(request.id, gsoOne)).id, completed: true }],
  }, gsoOne);

  await pool.query("UPDATE service_work_orders SET auto_close_at = NOW() + INTERVAL '12 hours' WHERE request_id = $1", [request.id]);
  await workOrders.runServiceWorkOrderAutomation();
  await workOrders.runServiceWorkOrderAutomation();
  const reminders = (await one(
    `SELECT COUNT(*)::INTEGER AS n FROM app_notifications
      WHERE recipient_user_id = 3 AND message LIKE $1 AND message LIKE '%still needs your confirmation%'`,
    [`${request.referenceNo}:%`],
  )).n;
  assert.equal(reminders, 1, 'the reminder is sent once, not on every sweep');

  await pool.query("UPDATE service_work_orders SET auto_close_at = NOW() - INTERVAL '1 minute' WHERE request_id = $1", [request.id]);
  await workOrders.runServiceWorkOrderAutomation();
  assert.equal(await requestStatus(request.id), 'Closed');
  assert.equal((await workOrderRow(request.id)).closure_type, 'AUTO_CLOSED');
});

test('a job cannot be moved from the general GSO request page', async () => {
  const request = await submitJob();
  await rejects(requestsService.updateStatus(request.id, { status: 'Approved' }, gsoOne), /Service Workboard/, 409);
});

test('the requester can cancel a new job, and the team is told it no longer needs action', async () => {
  const request = await submitJob();
  const cancelled = await requestsService.cancelMine(request.id, requester);
  assert.equal(cancelled.status, 'Cancelled');
  assert.equal(await notificationsFor(1, 'Request cancelled by requester', request.referenceNo), 1);
});

test('the New queue shows only unclaimed jobs, and a claimed job moves to My Active Jobs', async () => {
  const before = await workOrders.listWorkOrders({ team: 'GSO', queue: 'NEW', limit: 50, offset: 0 }, gsoOne);
  const request = await submitJob();
  const withNew = await workOrders.listWorkOrders({ team: 'GSO', queue: 'NEW', limit: 50, offset: 0 }, gsoOne);
  assert.equal(withNew.total, before.total + 1);
  await workOrders.claimWorkOrder(request.id, gsoOne);
  const afterClaim = await workOrders.listWorkOrders({ team: 'GSO', queue: 'NEW', limit: 50, offset: 0 }, gsoOne);
  assert.equal(afterClaim.total, before.total);
  const mine = await workOrders.listWorkOrders({ team: 'GSO', queue: 'MY_ACTIVE', limit: 50, offset: 0 }, gsoOne);
  assert.ok(mine.workOrders.some((order) => order.id === String(request.id)));
  assert.ok(mine.summary.inProgress >= 0);
});

test('an IT Admin works the ITSS queue, sees the deadline label, and cannot open the GSO queue', async () => {
  const request = await submitJob({ serviceCategory: 'SOFTWARE_ACCESS', requiredDate: isoDate(0) });
  assert.equal((await workOrderRow(request.id)).route_team, 'ITSS');
  assert.equal(await notificationsFor(5, 'New service request', request.referenceNo), 1, 'IT Admin is told about the new ITSS job');
  const claimed = await workOrders.claimWorkOrder(request.id, itAdmin);
  assert.equal(claimed.assignedStaffId, '5');
  const listed = await workOrders.listWorkOrders({ team: 'ITSS', queue: 'ACTIVE', limit: 50, offset: 0 }, itAdmin);
  const row = listed.workOrders.find((order) => order.id === String(request.id));
  assert.ok(row, 'the claimed job appears in the IT Admin list');
  assert.equal(row.deadlineLabel, 'Due today');
  await rejects(workOrders.listWorkOrders({ team: 'GSO', limit: 5, offset: 0 }, itAdmin), /do not have access to the GSO/, 403);
});

test('a job without a work checklist is accepted, and it completes with only the completion note', async () => {
  const request = await submitJob({ tasks: [] });
  assert.equal(request.checklist.length, 0);
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  const done = await workOrders.completeWork(request.id, { completionNote: 'Replaced the bulb and tested the switch.', resolutionType: 'FIXED' }, gsoOne);
  assert.equal(done.status, 'Awaiting Requester Confirmation');
});

test('completion accepts no resolution type, rejects an unknown one, and progress and requester photos must be images', async () => {
  const request = await submitJob({ tasks: [] });
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: gsoOne.name }, gsoOne);
  await rejects(workOrders.completeWork(request.id, { completionNote: 'Done.', resolutionType: 'MAYBE' }, gsoOne), /Choose a valid resolution/, 400);
  await rejects(workOrders.progressWork(request.id, { note: 'Checking.', photos: ['https://example.invalid/a.jpg'] }, gsoOne), /JPG, PNG, or WebP/, 400);
  const progressed = await workOrders.progressWork(request.id, { note: 'Waiting for the part.', photos: [tinyPhoto] }, gsoOne);
  assert.equal(progressed.status, 'In Progress');
  const withInfo = await workOrders.addRequesterInfo(request.id, { message: 'It is Room 201, the projector near the door.', photos: [tinyPhoto] }, requester);
  assert.ok(withInfo.photos.some((photo) => photo.source === 'REQUESTER_UPDATE'));
});

test('Others goes to GSO, keeps the description the requester typed, and needs that description', async () => {
  const request = await submitJob({ serviceCategory: 'OTHERS', serviceOther: 'Replace the school bell in Building B' });
  const work = await workOrderRow(request.id);
  assert.equal(work.route_team, 'GSO');
  assert.equal(work.service_category, 'OTHERS');
  assert.equal(request.formData.serviceOther, 'Replace the school bell in Building B');
  await rejects(submitJob({ serviceCategory: 'OTHERS', serviceOther: '   ' }), /description of the service/, 400);
});

test('starting work takes the typed name of the person in charge, and the claimed staff member keeps doing the work', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await rejects(workOrders.startWork(request.id, {}, gsoOne), /Name of the person in charge is required/, 400);
  const started = await workOrders.startWork(request.id, { inChargeName: 'Juan Dela Cruz' }, gsoOne);
  assert.equal(started.inChargeStaffName, 'Juan Dela Cruz');
  assert.match(started.history.at(-1).note, /Work started\. In charge: Juan Dela Cruz\./);
  const progressed = await workOrders.progressWork(request.id, { note: 'Wiring started.', photos: [] }, gsoOne);
  assert.equal(progressed.status, 'In Progress');
  await rejects(workOrders.progressWork(request.id, { note: 'Wiring started.', photos: [] }, gsoTwo), /Claim this job first/, 403);
});

test('taking over a started job moves the claim and keeps the typed name of the person in charge', async () => {
  const request = await submitJob();
  await workOrders.claimWorkOrder(request.id, gsoOne);
  await workOrders.startWork(request.id, { inChargeName: 'Juan Dela Cruz' }, gsoOne);
  const taken = await workOrders.takeOverWorkOrder(request.id, { note: 'The first staff member is on leave.' }, gsoTwo);
  assert.equal(taken.assignedStaffId, '2');
  assert.equal(taken.inChargeStaffName, 'Juan Dela Cruz');
});

test('the team members list shows active staff of that team only, and only that team can read it', async () => {
  const gso = (await workOrders.listTeamMembers({ team: 'GSO' }, gsoOne)).map((member) => member.id);
  assert.ok(gso.includes('1') && gso.includes('2') && !gso.includes('4'));
  const itss = (await workOrders.listTeamMembers({ team: 'ITSS' }, itStaff)).map((member) => member.id);
  assert.ok(itss.includes('4') && itss.includes('5') && !itss.includes('1'));
  await rejects(workOrders.listTeamMembers({ team: 'ITSS' }, gsoOne), /do not have access to the ITSS/, 403);
});
