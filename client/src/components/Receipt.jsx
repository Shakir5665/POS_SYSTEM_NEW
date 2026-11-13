import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useSettings } from '../hooks/useSettings'
import { Button } from './Button'
import { ReceiptContent } from './ReceiptContent'

export function Receipt({ sale, onClose }) {
  const settings = useSettings()

  function handlePrint() {
    window.print()
  }

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        handlePrint()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  // Ensure #print-root exists in document body (even in headless test environments)
  let printRoot = typeof document !== 'undefined' ? document.getElementById('print-root') : null
  if (typeof document !== 'undefined' && !printRoot) {
    printRoot = document.createElement('div')
    printRoot.id = 'print-root'
    document.body.appendChild(printRoot)
  }

  if (!sale) return null

  return (
    <>
      {/* On-screen view rendered inside the Modal dialog */}
      <div className="receipt-screen-view max-w-sm mx-auto">
        <ReceiptContent sale={sale} settings={settings} isPrint={false} />

        <div className="flex justify-end gap-3 mt-6 border-t border-gray-100 pt-4">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print Receipt
          </Button>
        </div>
      </div>

      {/* Printable thermal receipt rendered outside #root directly into #print-root */}
      {printRoot && createPortal(
        <ReceiptContent sale={sale} settings={settings} isPrint={true} />,
        printRoot
      )}
    </>
  )
}
