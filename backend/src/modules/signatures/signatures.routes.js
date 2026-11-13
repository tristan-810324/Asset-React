const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const signaturesController = require('./signatures.controller');

const router = express.Router();

// Only the GSO Head manages their own signature; the account comes from the signed-in session.
router.use(authenticate, requireRole('GSO_HEAD'));
router.get('/me', signaturesController.getMySignature);
router.put('/me', signaturesController.saveMySignature);

module.exports = router;
