import { AdminPageFrame } from '../components/navbars/adminnavbar'
import ToRepaired from '../gso/torepaired'

// IT Admin's Repair & Maintenance page: the same repair check as GSO's To Be Repaired page, inside the admin console.
export default function AdminRepairMaintenance() {
  return (
    <AdminPageFrame activePath="/admin/repair" pageName="Repair & Maintenance" subtitle="Repair checks for returned units">
      <ToRepaired embedded owner="ITSS" />
    </AdminPageFrame>
  )
}
