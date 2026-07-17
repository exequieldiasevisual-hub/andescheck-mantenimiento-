import { useEffect, useRef } from 'react'

export default function Modal({ titulo, onClose, children, ancho = 'max-w-md', alto = '' }) {
  const contenedorRef = useRef(null)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const primerCampo = contenedorRef.current?.querySelector('input, select, textarea, button')
    primerCampo?.focus()
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" style={{ overscrollBehavior: 'contain' }}>
      <div
        ref={contenedorRef}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        className={`bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 w-full ${ancho} ${alto} p-6 max-h-[90vh] overflow-y-auto${alto ? ' flex flex-col' : ''}`}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-medium text-gray-900 dark:text-gray-100">{titulo}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none ml-4 flex-shrink-0">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
