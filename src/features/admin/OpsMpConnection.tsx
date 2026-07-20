import { useState } from 'react'
import { Button, Card, Eyebrow, Modal, toast } from '../../components/ui'
import { store, useStore } from '../../data/store'

/** Formatea una fecha ISO en algo legible para el organizador. */
function cuando(iso?: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
}

/**
 * Cobros: conectar/desconectar Mercado Pago desde el panel (Tarea 6).
 *
 * Quién puede VER esta sección la decide quien la monta (AdminConfiguracion, con
 * `can('team:manage')`) — este componente no conoce permisos, solo dibuja el estado que le
 * pasa el store. El backend igual rechaza con 403 cualquier acción sin el permiso, aunque
 * alguien llegara acá por otro camino: esconder el botón es cosmética, no seguridad.
 */
export function OpsMpConnection() {
  const estado = useStore((s) => s.getMpStatus())
  const [confirmando, setConfirmando] = useState(false)
  const [yendo, setYendo] = useState(false)

  const conectar = async () => {
    setYendo(true)
    try {
      window.location.href = await store.connectMp()
    } catch {
      toast('No pudimos abrir Mercado Pago. Revisá que la aplicación esté configurada.', 'info')
      setYendo(false)
    }
  }

  const desconectar = async () => {
    await store.disconnectMp()
    setConfirmando(false)
    toast('✓ Mercado Pago desconectado')
  }

  const conectado = estado?.conectado === true

  return (
    <>
      <Eyebrow>Cobros</Eyebrow>
      <Card className="mt-5 max-w-xl p-5 md:p-6">
        <div className="flex items-center gap-2.5">
          <span className={`size-2 rounded-full ${conectado ? 'bg-success' : 'bg-line'}`} />
          <span className="text-[15px] font-medium text-ink">
            Mercado Pago · {conectado ? 'conectado' : 'desconectado'}
          </span>
        </div>

        {conectado ? (
          <>
            <dl className="mt-4 space-y-1.5 text-[13px]">
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Cuenta</dt>
                <dd className="text-ink">{estado?.cuenta}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Conectada desde</dt>
                <dd className="text-ink">{cuando(estado?.desde)}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-ink-soft">Permiso vigente hasta</dt>
                <dd className="text-ink">{cuando(estado?.vence)} · se renueva sola</dd>
              </div>
            </dl>
            <Button variant="ghost" size="sm" className="mt-5" onClick={() => setConfirmando(true)}>
              Desconectar
            </Button>
          </>
        ) : (
          <>
            <p className="mt-3 text-[13px] leading-relaxed text-ink-soft">
              Mientras esté desconectado, las compras siguen andando con el link manual que cargaste
              por plan y confirmás las órdenes a mano.
            </p>
            <Button className="mt-5" onClick={conectar} disabled={yendo}>
              {yendo ? 'Abriendo Mercado Pago…' : 'Conectar con Mercado Pago'}
            </Button>
          </>
        )}
      </Card>

      <Modal open={confirmando} onClose={() => setConfirmando(false)}>
        <h3 className="text-[17px] font-medium text-ink">Desconectar Mercado Pago</h3>
        <p className="mt-2.5 text-[14px] leading-relaxed text-ink">
          CCM deja de poder cobrar al instante y las compras vuelven al link manual.
        </p>
        <p className="mt-3 rounded-sm bg-accent/10 p-3 text-[13px] leading-relaxed text-ink">
          Mercado Pago no permite que una aplicación se quite a sí misma el permiso. Para borrarlo
          del todo, entrá a las aplicaciones autorizadas de tu cuenta y quitá CCM desde ahí.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)}>Cancelar</Button>
          <Button size="sm" onClick={desconectar}>Desconectar</Button>
        </div>
      </Modal>
    </>
  )
}
