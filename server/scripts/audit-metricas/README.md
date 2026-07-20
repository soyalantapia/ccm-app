# Auditoría de las métricas del Dashboard

Banco de pruebas reproducible que contrasta **lo que muestra el Dashboard** contra **la verdad de la base**.

Existe porque el Dashboard actual no cuenta hechos: cuenta eventos de `AnalyticsEvent`, y los cuenta en el navegador sobre una lista que la API entrega truncada a 500 filas. Leer el código sugiere que eso rompe; esto lo demuestra con números.

## Cómo correrlo

Necesita un Postgres local. No toca ninguna base existente: crea `ccm_audit` desde cero.

```bash
cd server
U="postgresql://$USER@localhost:5432/ccm_audit?schema=public"

# 1. crear la base y aplicar el schema
echo "CREATE DATABASE ccm_audit;" > /tmp/c.sql
DATABASE_URL="postgresql://$USER@localhost:5432/postgres" \
  npx prisma db execute --file /tmp/c.sql --schema prisma/schema.prisma
DATABASE_URL="$U" npx prisma db push --skip-generate --accept-data-loss

# 2. sembrar cantidades conocidas
DATABASE_URL="$U" node scripts/audit-metricas/audit-seed.mjs

# 3. comparar dashboard vs verdad
DATABASE_URL="$U" node scripts/audit-metricas/audit-run.mjs
```

Para volver a empezar: `DROP SCHEMA public CASCADE; CREATE SCHEMA public;` y repetir desde el paso 1.

## Qué siembra

Cantidades elegidas a mano, para poder afirmar cuál es el número correcto:

| Entidad | Cantidad | Detalle |
|---|---|---|
| Devices | 10 | la verdad de "Registrados" |
| Registrations | 6 confirmadas + 2 canceladas | |
| Memberships | 3 socios + 2 free | ingreso: 5000 + 5000 + 10000 = **20000** |
| TicketOrders | 2 cobradas, 4 trabadas, 1 cancelada | trabadas: 3×10000 + 15000 = **45000** |
| Applications | 4 reales pendientes + 2 `fromSeed` + 1 resuelta | |
| PhotoDownloads | 7 | |
| AnalyticsEvent | 600 `user_created` + 300 `ad_impression` | **900 > 500 a propósito** |

Tres bloques cubren los bordes: uno lleno, uno flojo y uno con `capacity: 0` (para verificar que no se divide por cero). Tres convocatorias: una que cierra en 3 días, otra en 30 y otra vencida ayer.

## Resultado medido (2026-07-20)

```
Eventos en la base: 900  ·  la API entrega como máximo: 500

MÉTRICA                 DASHBOARD      VERDAD    VEREDICTO
Registrados                  200          10     MAL (infla 20x)
Inscripciones                  0           6     MAL
Socios CCM                     0           3     MAL
Ingreso socios                 0       20000     MAL
Órdenes cobradas               0           2     MAL
Plata trabada                  —       45000     NO SE PUEDE CALCULAR HOY
Postulaciones pend.            —           4     NO SE PUEDE CALCULAR HOY
Descargas de fotos             0           7     MAL

6 métricas dan un número equivocado · 2 no se pueden calcular con eventos
```

## Las dos causas, que son distintas

**Los ceros.** Los hechos existen en la base —6 inscripciones, 3 socios, 2 órdenes cobradas, 7 descargas— pero el Dashboard muestra 0 porque no había eventos de analytics correspondientes. La telemetría es best-effort: si se pierde el flush, el hecho ocurrió y el número lo niega. Un dashboard que informa cero ventas cuando cobraste dos.

**El 200.** No es solo el techo. De las 500 filas que entrega la API, 200 son `user_created`; las otras 300 son `ad_impression` más recientes que empujaron al resto fuera de la ventana. Y como cuenta eventos y no devices, cualquier reemisión (un retry, un doble montaje en StrictMode) infla el número. Techo y contar-eventos se suman.

Las dos métricas marcadas "—" no son un caso de mala precisión: **no existe ningún evento que las represente**. Plata trabada necesita `TicketOrder.total` filtrado por estado; postulaciones pendientes necesita `Application.status` con su antigüedad. Son consultas sobre tablas, no conteos de telemetría.

## Después de implementar

Volver a correrlo. Con `GET /admin/stats` andando, las ocho filas tienen que coincidir con la columna "verdad".
