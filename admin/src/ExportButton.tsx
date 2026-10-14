import { useState } from 'react'
import { downloadFile } from './api.ts'
import { Button, errorMessage, useUi } from './ui.tsx'

/** Downloads a whole report (no date range) as CSV, for example the catalogue or the stock list. */
export function ExportButton({ report, children = 'Export CSV' }: { report: string; children?: string }) {
  const { toast } = useUi()
  const [busy, setBusy] = useState(false)
  return (
    <Button
      variant="outline"
      loading={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await downloadFile(`/admin/reports/${report}/download`, `clickmart-${report}.csv`)
        } catch (error) {
          toast(errorMessage(error), 'error')
        } finally {
          setBusy(false)
        }
      }}
    >
      {children}
    </Button>
  )
}
