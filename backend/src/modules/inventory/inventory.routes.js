const express = require('express');
const authenticate = require('../../middleware/auth.middleware');
const requireRole = require('../../middleware/role.middleware');
const inventoryController = require('./inventory.controller');

const router = express.Router();

router.use(authenticate);
router.get('/categories', requireRole('GSO_STAFF', 'GSO_HEAD'), inventoryController.listCategories);
router.get('/item-names', requireRole('GSO_STAFF', 'GSO_HEAD'), inventoryController.listCategoryItemNames);
router.get('/items', requireRole('GSO_STAFF', 'GSO_HEAD'), inventoryController.listItems);
router.patch('/item-names/:id/policy', requireRole('GSO_HEAD'), inventoryController.updateCategoryItemNamePolicy);

router.use(requireRole('GSO_STAFF'));
router.post('/categories', inventoryController.createCategory);
router.patch('/categories/:id', inventoryController.renameCategory);
router.delete('/categories/:id', inventoryController.deleteCategory);
router.post('/categories/:id/item-names', inventoryController.createCategoryItemName);
router.delete('/item-names/:id', inventoryController.deleteCategoryItemName);
router.post('/items/bulk', inventoryController.createItems);
router.post('/items', inventoryController.createItem);
router.post('/items/:id/restock', inventoryController.restockItem);
router.put('/items/:id', inventoryController.updateItem);

module.exports = router;
