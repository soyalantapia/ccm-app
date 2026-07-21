import { useState } from 'react'
import { Button, Card, Eyebrow, SectionTitle, Sheet, toast } from '../../components/ui'
import { IS_REMOTE } from '../../data/store'
import { removeKey } from '../../lib/storage'
import { can } from '../../data/adminSession'
import { OpsThemeEditor } from '../../features/admin/OpsThemeEditor'
import { OpsDangerButton } from '../../features/admin/OpsDangerButton'
import { OpsMpConnection } from '../../features/admin/OpsMpConnection'

const STORAGE_PREFIX = 'ccm:'

export default function AdminConfiguracion() {
  const [confirming, setConfirming] = useState(false)

  const resetDemo = () => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX) && k !== `${STORAGE_PREFIX}theme`) keys.push(k)
    }
    keys.forEach((k) => removeKey(k.slice(STORAGE_PREFIX.length)))
    setConfirming(false)
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

      {/* ─── Cobros con Mercado Pago ───
          Solo la ve quien puede conectar/desconectar: mostrarla a alguien sin team:manage
          sería ofrecerle un botón que el backend le va a rechazar con 403 igual. Esconderla
          es cosmética (la seguridad real la aplica el server), pero mostrarla de más confunde. */}
      {can('team:manage') && (
        <section className="mt-14 border-t border-line pt-10">
          <OpsMpConnection />
        </section>
      )}

      {/* ─── Acceso ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <Eyebrow>Acceso</Eyebrow>
        <Card className="mt-5 max-w-xl p-5 md:p-6">
          <p className="text-[15px] leading-relaxed text-ink">
            En esta demo, <em className="text-accent">cualquier clave</em> habilita el panel — así no
            hay nada que recordar al presentar.
          </p>
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
            {IS_REMOTE
              ? 'Conectado al sistema: lo que carga tu equipo se guarda en la nube y lo ve todo el público.'
              : 'Demo local · sin backend: los datos viven solo en este dispositivo.'}
          </p>
          <div className="mt-5 border-t border-line pt-5">
            <OpsDangerButton onClick={() => setConfirming(true)}>
              Reiniciar datos de la demo
            </OpsDangerButton>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft/80">
              Deja la app como recién instalada (el tema elegido se conserva). Útil para resetear
              antes de presentar.
            </p>
          </div>
        </Card>
      </section>

      {/* Confirmación con el sheet propio (no window.confirm — rompe el app-feel) */}
      <Sheet open={confirming} onClose={() => setConfirming(false)} title="¿Reiniciar la demo?">
        <p className="text-[15px] leading-relaxed text-ink-soft">
          Se borran inscripciones, órdenes, postulaciones, perfil y analytics de este dispositivo.
          El tema elegido se conserva. Esta acción no se puede deshacer.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton onClick={resetDemo} className="w-full justify-center">
            Sí, reiniciar todo
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
