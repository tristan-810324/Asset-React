const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const controller = require('./loss-damage.controller');

// GSO Staff decide cases; the requester reads only their own decision and payment state.
const router = express.Router();
router.use(authenticate);
router.get('/cases', requireRole('GSO_STAFF'), controller.listCases);
router.get('/cases/:id', requireRole('GSO_STAFF'), controller.getCase);
router.post('/cases/:id/start-review', requireRole('GSO_STAFF'), controller.startReview);
router.post('/cases/:id/decision', requireRole('GSO_STAFF'), controller.decide);
router.post('/cases/:id/payment-link', requireRole('GSO_STAFF'), controller.createPaymentLink);
router.post('/cases/:id/cancel-link', requireRole('GSO_STAFF'), controller.cancelPaymentLink);
router.post('/cases/:id/close', requireRole('GSO_STAFF'), controller.closeCase);
router.get('/mine/:id', requireRole('BORROWER'), controller.getMine);

// PayMongo calls this without a login. It reads the raw body, so the signature can be checked against the exact bytes.
const webhookRouter = express.Router();
webhookRouter.post('/paymongo', express.raw({ type: '*/*', limit: '1mb' }), controller.receivePaymongoWebhook);

module.exports = { router, webhookRouter };
