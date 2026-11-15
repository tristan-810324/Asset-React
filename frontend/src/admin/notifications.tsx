import { AdminPageFrame } from '../components/navbars/adminnavbar'
import NotificationInbox from '../components/notifbell/notificationinbox'

// Everything the bell shows, with the full list. Job requests for the computer lab appear here.
export default function AdminNotifications() {
  return (
    <AdminPageFrame activePath="" pageName="Notifications">
      <NotificationInbox
        eyebrow="IT Admin workspace"
        variant="timeline"
        description="New computer lab job requests and system updates that need your action."
      />
    </AdminPageFrame>
  )
}
