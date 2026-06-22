import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as photoService from '../services/photoService.js'

export const photosRouter = Router()

/** GET /api/v1/favorites — photoIds favoritos del device. */
photosRouter.get('/favorites', requireDevice, async (req, res, next) => {
  try {
    res.json(await photoService.getFavorites(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

/** PUT /api/v1/favorites/:photoId — marcar favorito (idempotente). */
photosRouter.put('/favorites/:photoId', requireDevice, async (req, res, next) => {
  try {
    await photoService.addFavorite(req.deviceId!, req.params.photoId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

/** DELETE /api/v1/favorites/:photoId — desmarcar favorito. */
photosRouter.delete('/favorites/:photoId', requireDevice, async (req, res, next) => {
  try {
    await photoService.removeFavorite(req.deviceId!, req.params.photoId)
    res.status(204).end()
  } catch (err) {
    next(err)
  }
})

const downloadSchema = z.object({ photoId: z.string().min(1), galleryId: z.string().min(1) })

/** POST /api/v1/downloads — registrar descarga (alimenta el reporte por sponsor). */
photosRouter.post('/downloads', requireDevice, async (req, res, next) => {
  try {
    const { photoId, galleryId } = downloadSchema.parse(req.body)
    await photoService.recordDownload(req.deviceId!, photoId, galleryId)
    res.status(201).json({ ok: true })
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/downloads — descargas del device. */
photosRouter.get('/downloads', requireDevice, async (req, res, next) => {
  try {
    res.json(await photoService.getDownloads(req.deviceId!))
  } catch (err) {
    next(err)
  }
})
