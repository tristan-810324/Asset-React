const repository = require('./notifications.repository');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listMine = asyncHandler(async (req, res) => {
  const notifications = await repository.listForUser(req.user);
  res.json({ success: true, data: { notifications } });
});

const markRead = asyncHandler(async (req, res) => {
  if (!/^\d{1,20}$/.test(req.params.id)) throw Object.assign(new Error('Hindi valid ang notification ID.'), { status: 400 });
  await repository.markRead(req.params.id, req.user);
  res.json({ success: true, data: { markedRead: true } });
});

const markAllRead = asyncHandler(async (req, res) => {
  await repository.markAllRead(req.user);
  res.json({ success: true, data: { markedRead: true } });
});

module.exports = { listMine, markRead, markAllRead };
