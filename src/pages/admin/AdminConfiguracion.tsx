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

  const borrarDatosDelNavegador = () => {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(STORAGE_PREFIX) && k !== `${STORAGE_PREFIX}theme`) keys.push(k)
    }
    keys.forEach((k) => removeKey(k.slice(STORAGE_PREFIX.length)))
    setConfirming(false)
    toast('✓ Datos de este navegador borrados')
  }

  return (
    <div className="px-5 py-8 md:px-10">
      <SectionTitle
        eyebrow="Admin · Configuración"
        title="Configuración"
        lead="Tema visual, acceso al panel y datos guardados en este navegador."
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
            Se entra con un <em className="text-accent">código de un solo uso</em> que llega al
            email y vence a los 10 minutos. No hay contraseñas que recordar ni que rotar.
          </p>
          <p className="mt-4 border-t border-line pt-4 text-xs leading-relaxed text-ink-soft">
            Cada persona del equipo entra con su propio email y ve sólo lo que su rol habilita.
            Quién está invitado y con qué rol se administra en Equipo.
          </p>
        </Card>
      </section>

      {/* ─── Datos de este navegador ─── */}
      <section className="mt-14 border-t border-line pt-10">
        <Eyebrow>Datos de este navegador</Eyebrow>
        <Card className="mt-5 max-w-xl p-5 md:p-6">
          <p className="text-[15px] leading-relaxed text-ink-soft">
            {IS_REMOTE
              ? 'Conectado al sistema: lo que carga tu equipo se guarda en la nube, lo ve todo el público y no depende de este navegador.'
              : 'Sin conexión al sistema: todo lo que se carga vive sólo en este navegador — si lo borrás, se pierde.'}
          </p>
          <div className="mt-5 border-t border-line pt-5">
            <OpsDangerButton onClick={() => setConfirming(true)}>
              Borrar los datos de este navegador
            </OpsDangerButton>
            <p className="mt-3 text-xs leading-relaxed text-ink-soft/80">
              Deja la app como recién instalada en este dispositivo. El tema elegido se conserva.
            </p>
          </div>
        </Card>
      </section>

      {/* Confirmación con el sheet propio (no window.confirm — rompe el app-feel) */}
      <Sheet
        open={confirming}
        onClose={() => setConfirming(false)}
        title="¿Borrar los datos de este navegador?"
      >
        {/* La lista tiene que quedar abierta: el botón barre TODAS las claves ccm: menos el tema,
            incluidos los overlays con lo que cargó el panel (eventos, bloques, galerías…), que es
            justo lo que más duele perder sin backend. Y la analítica pendiente no se toca en
            remoto: ahí el buffer sin enviar vive en memoria, no en localStorage. */}
        <p className="text-[15px] leading-relaxed text-ink-soft">
          {IS_REMOTE
            ? 'Se borra todo lo que la app guardó en este navegador: el perfil de quien lo usa, su copia local de inscripciones, órdenes y postulaciones, y la identidad con la que el sistema reconoce a este dispositivo — vuelve a entrar como visitante nuevo. Lo que cargó el equipo está en el sistema y vuelve solo al recargar.'
            : 'Se borra todo lo que la app guardó en este navegador: el perfil, las inscripciones, las órdenes, las postulaciones, la analítica y también lo que hayas cargado desde el panel — eventos, bloques, sponsors, galerías, notas, convocatorias. Sin conexión al sistema eso vive sólo acá: queda la app con los datos originales y lo cargado no se recupera.'}{' '}
          El tema elegido se conserva. Esta acción no se puede deshacer.
        </p>
        <div className="mt-6 flex flex-col gap-2.5">
          <OpsDangerButton onClick={borrarDatosDelNavegador} className="w-full justify-center">
            Sí, borrar todo
          </OpsDangerButton>
          <Button variant="ghost" size="lg" className="w-full" onClick={() => setConfirming(false)}>
            Cancelar
          </Button>
        </div>
      </Sheet>
    </div>
  )
}
