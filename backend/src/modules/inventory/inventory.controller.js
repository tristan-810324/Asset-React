const inventoryService = require('./inventory.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listItems = asyncHandler(async (req, res) => {
  const items = await inventoryService.listItems();
  res.json({ success: true, data: { items } });
});

const createItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.createItem(req.body, req.user);
  res.status(201).json({ success: true, data: { item } });
});

const createItems = asyncHandler(async (req, res) => {
  const items = await inventoryService.createItems(req.body, req.user);
  res.status(201).json({ success: true, data: { items } });
});

const updateItem = asyncHandler(async (req, res) => {
  const item = await inventoryService.updateItem(req.params.id, req.body, req.user);
  res.json({ success: true, data: { item } });
});

const listCategories = asyncHandler(async (req, res) => {
  const categories = await inventoryService.listCategories();
  res.json({ success: true, data: { categories } });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.createCategory(req.body, req.user);
  res.status(201).json({ success: true, data: { category } });
});

const renameCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.renameCategory(req.params.id, req.body, req.user);
  res.json({ success: true, data: { category } });
});

const deleteCategory = asyncHandler(async (req, res) => {
  const category = await inventoryService.deleteCategory(req.params.id, req.body, req.user);
  res.json({ success: true, data: { category } });
});

const listCategoryItemNames = asyncHandler(async (req, res) => {
  const itemNames = await inventoryService.listCategoryItemNames();
  res.json({ success: true, data: { itemNames } });
});

const createCategoryItemName = asyncHandler(async (req, res) => {
  const itemName = await inventoryService.createCategoryItemName(req.params.id, req.body, req.user);
  res.status(201).json({ success: true, data: { itemName } });
});

const deleteCategoryItemName = asyncHandler(async (req, res) => {
  const itemName = await inventoryService.deleteCategoryItemName(req.params.id);
  res.json({ success: true, data: { itemName } });
});

module.exports = {
  listItems,
  createItem,
  createItems,
  updateItem,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  listCategoryItemNames,
  createCategoryItemName,
  deleteCategoryItemName,
};
