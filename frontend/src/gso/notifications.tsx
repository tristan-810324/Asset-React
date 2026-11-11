import { GsoPageFrame } from '../components/navbars/gsonavbar'
import NotificationInbox from '../components/notifbell/notificationinbox'

export default function Notifications() {
  return (
    <GsoPageFrame activePage="Notifications" searchPlaceholder="Search notifications">
      <NotificationInbox
        eyebrow="GSO workspace"
        description="New requests, returns, issuances, and purchase updates that need your action."
      />
    </GsoPageFrame>
  )
}
