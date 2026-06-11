import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Card, Eyebrow, SectionTitle, toast } from '../../components/ui'
import { config } from '../../config'
import { removeKey } from '../../lib/storage'
import { OpsThemeEditor } from '../../features/admin/OpsThemeEditor'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'

const STORAGE_PREFIX = 'ccm:'

export default function AdminConfiguracion() {
  const [showKey, setShowKey] = useState(false)

  const resetDemo = () => {
    const ok = window.confirm(
      '¿Reiniciar todos los datos de la demo? Se borran inscripciones, órdenes, postulaciones, perfil y analytics de este dispositivo. El tema actual se conserva.',
    )
    if (!ok) return
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX) && k !== `${STORAGE_PREFIX}theme`) keys.push(k)
    }
    keys.forEach((k) => removeKey(k.slice(STORAGE_PREFIX.length)))
    toast('✓ Datos de la demo reiniciados')
  }

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Configuración"
        title="Configuración"
        lead="Branding por tenant, acceso al panel y datos de la demo."
      />

      {/* ─── Editor de tema (D23 / PRD §10.16) ─── */}
      <section className="mt-10">
        <OpsThemeEditor />
      </section>

      {/* ─── Acceso ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <Eyebrow>Acceso</Eyebrow>
        <Card className="mt-5 max-w-xl p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="eyebrow text-[10px] text-ink-soft">Clave actual del panel</div>
              <div className="type-serif mt-1.5 text-2xl tracking-wide text-ink">
                {showKey ? config.adminKey : '••••••••'}
              </div>
            </div>
            <button
              onClick={() => setShowKey((v) => !v)}
              className="eyebrow flex items-center gap-1.5 text-[10px] text-ink-soft transition-colors hover:text-ink"
              aria-label={showKey ? 'Ocultar clave' : 'Mostrar clave'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              {showKey ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
            Mecanismo provisorio de Fase 0 — en Fase 1 se reemplaza por usuarios con email,
            contraseña y roles por sección.
          </p>
        </Card>
      </section>

      {/* ─── Demo ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <Eyebrow>Demo</Eyebrow>
        <Card className="mt-5 max-w-xl p-5 md:p-6">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            Demo local · los datos viven en este dispositivo; la sincronización en la nube llega en
            Fase 1.
          </p>
          <div className="mt-5 border-t border-line pt-5">
            <OpsDangerButton onClick={resetDemo}>Reiniciar datos de la demo</OpsDangerButton>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft/80">
              Deja la app como recién instalada (el tema elegido se conserva). Útil para resetear
              antes de presentar.
            </p>
          </div>
        </Card>
      </section>
    </div>
  )
}
