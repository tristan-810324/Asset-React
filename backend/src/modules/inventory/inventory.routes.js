const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const inventoryController = require('./inventory.controller');

const router = express.Router();

router.use(authenticate, requireRole('GSO_STAFF'));
router.get('/categories', inventoryController.listCategories);
router.post('/categories', inventoryController.createCategory);
router.patch('/categories/:id', inventoryController.renameCategory);
router.delete('/categories/:id', inventoryController.deleteCategory);
router.get('/items', inventoryController.listItems);
router.post('/items', inventoryController.createItem);
router.put('/items/:id', inventoryController.updateItem);

module.exports = router;
