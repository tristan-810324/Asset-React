const inventoryRepository = require('./inventory.repository');
const requestsService = require('../requests/requests.service');
const {
  validateCreateInventoryItem,
  validateCreateInventoryItems,
  validateRestockInventoryItem,
  validateUpdateInventoryItem,
  validateCreateCategory,
  validateCategoryChange,
  validateCreateCategoryItemName,
  validateCategoryItemNamePolicy,
} = require('./inventory.validation');

function validateId(value, label) {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || value === '0') {
    throw Object.assign(new Error(`Hindi valid ang ${label}.`), { status: 400 });
  }
  return value;
}

function duplicateCategory(error) {
  if (error.code === '23505' && error.constraint === 'item_categories_name_lower_unique_idx') {
    throw Object.assign(new Error('May category na kapareho ng pangalan na iyan.'), { status: 409 });
  }
}

async function listItems() {
  return inventoryRepository.listItems();
}

// Stock is already committed before this runs. A reconciliation failure must never make a saved
// inventory receipt look unsuccessful; unmatched or similar names stay available for manual linking.
async function reconcileReceivedPurchaseStock(items, receiptReference, user) {
  try {
    return await requestsService.autoReserveReceivedPurchaseStock({ items, receiptReference, user });
  } catch (error) {
    console.error('New inventory stock could not be automatically linked to a purchase requisition.', {
      code: error.code,
      message: error.message,
    });
    return { deliveries: [], readyRequests: [] };
  }
}

function withPurchaseReconciliation(item, reconciliation) {
  return { ...item, purchaseReconciliation: reconciliation };
}

async function createItem(input, user) {
  const item = validateCreateInventoryItem(input);

  try {
    const createdItem = await inventoryRepository.createItem({ ...item, createdByUserId: user.id });
    const purchaseReconciliation = await reconcileReceivedPurchaseStock(
      [{ itemId: createdItem.id, quantity: item.quantity }],
      item.receiptReference,
      user,
    );
    return withPurchaseReconciliation({ ...createdItem, createdBy: user.name }, purchaseReconciliation);
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND') {
      throw Object.assign(new Error(error.message), { status: 400 });
    }
    if (error.code === '23505' && error.constraint === 'item_catalog_code_lower_unique_idx') {
      throw Object.assign(new Error('May inventory item na gumagamit ng Item Code na iyan.'), { status: 409 });
    }
    if (error.code === '23505' && error.constraint === 'asset_unit_tags_serial_number_lower_unique_idx') {
      throw Object.assign(new Error('May asset nang gumagamit ng manufacturer serial number na iyan.'), { status: 409 });
    }
    if (error.code === '23505' && error.constraint === 'item_catalog_serial_number_lower_unique_idx') {
      throw Object.assign(new Error('May inventory item nang gumagamit ng manufacturer serial number na iyan.'), { status: 409 });
    }
    throw error;
  }
}

async function createItems(input, user) {
  const items = validateCreateInventoryItems(input);

  try {
    const createdItems = await inventoryRepository.createItems(items, { createdByUserId: user.id });
    const purchaseReconciliation = await reconcileReceivedPurchaseStock(
      createdItems.map((item) => ({ itemId: item.id, quantity: item.quantity })),
      items[0]?.receiptReference || '',
      user,
    );
    return createdItems.map((item) => withPurchaseReconciliation({ ...item, createdBy: user.name }, purchaseReconciliation));
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND') {
      throw Object.assign(new Error(error.message), { status: 400 });
    }
    if (error.code === '23505' && error.constraint === 'item_catalog_code_lower_unique_idx') {
      throw Object.assign(new Error('May inventory item na gumagamit ng isa sa mga Item Code na iyan. I-refresh ang page at subukan muli.'), { status: 409 });
    }
    if (error.code === '23505' && error.constraint === 'asset_unit_tags_serial_number_lower_unique_idx') {
      throw Object.assign(new Error('May asset nang gumagamit ng isa sa mga manufacturer serial number na iyan.'), { status: 409 });
    }
    if (error.code === '23505' && error.constraint === 'item_catalog_serial_number_lower_unique_idx') {
      throw Object.assign(new Error('May inventory item nang gumagamit ng isa sa mga manufacturer serial number na iyan.'), { status: 409 });
    }
    throw error;
  }
}

async function restockItem(idValue, input, user) {
  const id = validateId(idValue, 'item ID');
  const receipt = validateRestockInventoryItem(input);
  const restockedItem = await inventoryRepository.restockItem(id, { ...receipt, recordedByUserId: user.id });
  const purchaseReconciliation = await reconcileReceivedPurchaseStock(
    [{ itemId: restockedItem.id, quantity: receipt.quantity }],
    receipt.receiptReference,
    user,
  );
  return withPurchaseReconciliation(restockedItem, purchaseReconciliation);
}

async function updateItem(idValue, input, user) {
  const id = validateId(idValue, 'item ID');
  const item = validateUpdateInventoryItem(input);
  try {
    const updatedItem = await inventoryRepository.updateItem(id, item, { changedByUserId: user.id });
    const { stockIncreaseQuantity = 0, ...savedItem } = updatedItem;
    const purchaseReconciliation = Number(stockIncreaseQuantity) > 0
      ? await reconcileReceivedPurchaseStock([{ itemId: savedItem.id, quantity: stockIncreaseQuantity }], '', user)
      : { deliveries: [], readyRequests: [] };
    return withPurchaseReconciliation(savedItem, purchaseReconciliation);
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND') {
      throw Object.assign(new Error(error.message), { status: 400 });
    }
    if (error.code === '23505' && error.constraint === 'item_catalog_code_lower_unique_idx') {
      throw Object.assign(new Error('May inventory item na gumagamit ng Item Code na iyan.'), { status: 409 });
    }
    throw error;
  }
}

async function listCategories() {
  return inventoryRepository.listCategories();
}

async function createCategory(input, user) {
  const category = validateCreateCategory(input);
  try {
    return await inventoryRepository.createCategory({ ...category, createdByUserId: user.id });
  } catch (error) {
    duplicateCategory(error);
    throw error;
  }
}

async function renameCategory(idValue, input, user) {
  const id = validateId(idValue, 'category ID');
  const category = validateCategoryChange(input, true);
  try {
    return await inventoryRepository.renameCategory(id, { ...category, changedByUserId: user.id });
  } catch (error) {
    duplicateCategory(error);
    throw error;
  }
}

async function deleteCategory(idValue, input, user) {
  const id = validateId(idValue, 'category ID');
  const change = validateCategoryChange(input, false);
  return inventoryRepository.deleteCategory(id, { ...change, changedByUserId: user.id });
}

async function listCategoryItemNames() {
  return inventoryRepository.listCategoryItemNames();
}

async function createCategoryItemName(categoryIdValue, input, user) {
  const categoryId = validateId(categoryIdValue, 'category ID');
  const itemName = validateCreateCategoryItemName(input);
  try {
    return await inventoryRepository.createCategoryItemName(categoryId, {
      ...itemName,
      createdByUserId: user.id,
    });
  } catch (error) {
    if (error.code === 'CATEGORY_NOT_FOUND') {
      throw Object.assign(new Error(error.message), { status: 404 });
    }
    if (error.code === '23505' && error.constraint === 'item_category_item_names_category_name_lower_unique_idx') {
      throw Object.assign(new Error('May item name na kapareho niyan sa category na ito.'), { status: 409 });
    }
    throw error;
  }
}

async function updateCategoryItemNamePolicy(idValue, input, user) {
  const id = validateId(idValue, 'item name ID');
  const policy = validateCategoryItemNamePolicy(input);
  return inventoryRepository.updateCategoryItemNamePolicy(id, {
    ...policy,
    changedByUserId: user.id,
  });
}

async function deleteCategoryItemName(idValue) {
  const id = validateId(idValue, 'item name ID');
  return inventoryRepository.deleteCategoryItemName(id);
}

module.exports = {
  listItems,
  createItem,
  createItems,
  restockItem,
  updateItem,
  listCategories,
  createCategory,
  renameCategory,
  deleteCategory,
  listCategoryItemNames,
  createCategoryItemName,
  updateCategoryItemNamePolicy,
  deleteCategoryItemName,
};
