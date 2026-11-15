const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const facilitiesController = require('./facilities.controller');

const router = express.Router();

// The requester Facility Use form reads the places GSO has not hidden.
router.get('/', authenticate, requireRole('BORROWER'), facilitiesController.listVenues);
// GSO Staff manage the places: every place, add one, edit it, hide or show it, or delete it.
router.get('/manage', authenticate, requireRole('GSO_STAFF'), facilitiesController.listManagedVenues);
router.post('/', authenticate, requireRole('GSO_STAFF'), facilitiesController.createVenue);
router.patch('/:id', authenticate, requireRole('GSO_STAFF'), facilitiesController.updateVenue);
router.delete('/:id', authenticate, requireRole('GSO_STAFF'), facilitiesController.deleteVenue);

module.exports = router;
