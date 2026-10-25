const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const controller = require('./notifications.controller');

const router = express.Router();
router.use(authenticate);
router.get('/mine', controller.listMine);
router.post('/mine/read-all', controller.markAllRead);
router.post('/mine/:id/read', controller.markRead);
module.exports = router;
