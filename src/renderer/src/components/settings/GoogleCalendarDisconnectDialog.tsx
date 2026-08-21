import { useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog'
import { translate } from '@/i18n/i18n'

type GoogleCalendarDisconnectDialogProps = {
  open: boolean
  busy: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}

export function GoogleCalendarDisconnectDialog({
  open,
  busy,
  onOpenChange,
  onConfirm
}: GoogleCalendarDisconnectDialogProps): React.JSX.Element {
  const cancelRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          cancelRef.current?.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {translate(
              'auto.components.settings.calendar.disconnectTitle',
              'Disconnect Google Calendar?'
            )}
          </DialogTitle>
          <DialogDescription>
            {translate(
              'auto.components.settings.calendar.disconnectDescription',
              'This deletes the imported Google events from this computer and revokes Orca’s access to your Google account. Events you created in Orca are not affected.'
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            ref={cancelRef}
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {translate('auto.components.settings.calendar.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" disabled={busy} onClick={onConfirm}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            {translate(
              'auto.components.settings.calendar.disconnectConfirm',
              'Disconnect Google Calendar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
