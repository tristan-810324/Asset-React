const SERVICE_CATEGORY_META = Object.freeze({
  ELECTRICAL_LIGHTING: { routeTeam: 'GSO', label: 'Electrical & Lighting' },
  PLUMBING_WATER: { routeTeam: 'GSO', label: 'Plumbing & Water' },
  FURNITURE_CARPENTRY: { routeTeam: 'GSO', label: 'Furniture & Carpentry' },
  BUILDING_REPAIR: { routeTeam: 'GSO', label: 'Classroom / Building Repair' },
  CLEANING_SANITATION: { routeTeam: 'GSO', label: 'Cleaning & Sanitation' },
  EVENT_SETUP_MOVING: { routeTeam: 'GSO', label: 'Event Setup & Moving' },
  SAFETY_HAZARD: { routeTeam: 'GSO', label: 'Safety Hazard' },
  COMPUTER_DEVICE: { routeTeam: 'ITSS', label: 'Computer Device' },
  NETWORK_CONNECTIVITY: { routeTeam: 'ITSS', label: 'Network & Connectivity' },
  SOFTWARE_ACCESS: { routeTeam: 'ITSS', label: 'Software & Access' },
  PERIPHERALS_PRINTING: { routeTeam: 'ITSS', label: 'Peripherals & Printing' },
  OTHER_GENERAL: { routeTeam: 'GSO', label: 'Other General Service' },
  // The requester types what the service is; GSO reads it and can reroute it.
  OTHERS: { routeTeam: 'GSO', label: 'Others' },
});

const SERVICE_CATEGORIES = new Set(Object.keys(SERVICE_CATEGORY_META));
const SERVICE_TEAMS = new Set(['GSO', 'ITSS']);
// IT Admin works the ITSS queue alongside IT Staff, so the admin dashboard can show and handle computer lab jobs.
const TEAM_ROLES = Object.freeze({ GSO: Object.freeze(['GSO_STAFF']), ITSS: Object.freeze(['IT_STAFF', 'IT_ADMIN']) });
const ACTIVE_SERVICE_STATUSES = new Set(['Submitted', 'Under Review', 'Needs Information', 'In Progress', 'Awaiting Requester Confirmation']);
const TERMINAL_SERVICE_STATUSES = new Set(['Closed', 'Rejected', 'Cancelled']);

function routeForCategory(category) {
  return SERVICE_CATEGORY_META[category]?.routeTeam || 'GSO';
}

function priorityForService({ category, targetDate, today = null }) {
  if (category === 'SAFETY_HAZARD') return 'URGENT';
  if (!targetDate) return 'STANDARD';
  const reference = today || new Date();
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const target = new Date(`${targetDate}T00:00:00Z`);
  if (Number.isNaN(target.getTime())) return 'STANDARD';
  const days = Math.floor((target - start) / 86400000);
  if (days <= 1) return 'URGENT';
  if (days <= 3) return 'HIGH';
  return 'STANDARD';
}

module.exports = {
  SERVICE_CATEGORY_META,
  SERVICE_CATEGORIES,
  SERVICE_TEAMS,
  TEAM_ROLES,
  ACTIVE_SERVICE_STATUSES,
  TERMINAL_SERVICE_STATUSES,
  routeForCategory,
  priorityForService,
};
