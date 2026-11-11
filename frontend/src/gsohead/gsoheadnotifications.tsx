import NotificationInbox from '../components/notifbell/notificationinbox'
import { GsoHeadPageFrame } from './gsoheadnavbar'

export default function GsoHeadNotifications() {
  return (
    <GsoHeadPageFrame activePage="notifications">
      <NotificationInbox
        eyebrow="GSO Head workspace"
        description="Requests waiting for your decision, Finance follow-up, and returns to review."
      />
    </GsoHeadPageFrame>
  )
}
