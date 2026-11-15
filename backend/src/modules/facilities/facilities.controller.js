const facilitiesService = require('./facilities.service');

function asyncHandler(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const listVenues = asyncHandler(async (_req, res) => {
  const venues = await facilitiesService.listVenues();
  res.json({ success: true, data: { venues } });
});

const listManagedVenues = asyncHandler(async (_req, res) => {
  const venues = await facilitiesService.listManagedVenues();
  res.json({ success: true, data: { venues } });
});

const createVenue = asyncHandler(async (req, res) => {
  const venue = await facilitiesService.createVenue(req.user, req.body);
  res.status(201).json({ success: true, data: { venue } });
});

const updateVenue = asyncHandler(async (req, res) => {
  const venue = await facilitiesService.updateVenue(req.user, req.params.id, req.body);
  res.json({ success: true, data: { venue } });
});

const deleteVenue = asyncHandler(async (req, res) => {
  const venue = await facilitiesService.deleteVenue(req.user, req.params.id);
  res.json({ success: true, data: { venue } });
});

module.exports = { listVenues, listManagedVenues, createVenue, updateVenue, deleteVenue };
