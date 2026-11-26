import { AdminPageFrame } from '../components/navbars/adminnavbar'
import { ServiceWorkboard } from '../gso/serviceworkboard'

// The IT Admin's view of the ITSS queue. It uses the same workboard as the IT Staff page, inside the admin console.
export default function AdminSupportQueue() {
  return (
    <AdminPageFrame activePath="/admin/support-queue" pageName="Service Workboard" subtitle="Computer laboratory and technical jobs">
      <ServiceWorkboard team="ITSS" />
    </AdminPageFrame>
  )
}
