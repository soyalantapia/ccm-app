import { Router } from 'express'
import { z } from 'zod'
import { requireDevice } from '../middlewares/device.js'
import * as catalogService from '../services/catalogService.js'
import * as applicationService from '../services/applicationService.js'

export const catalogRouter = Router()

/** GET /api/v1/catalog — expositores (con portfolio). Público. */
catalogRouter.get('/catalog', async (_req, res, next) => {
  try {
    res.json(await catalogService.getCatalog())
  } catch (err) {
    next(err)
  }
})

catalogRouter.get('/catalog/:slug', async (req, res, next) => {
  try {
    res.json(await catalogService.getCatalogProfile(req.params.slug))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/galleries — galerías (con fotos). Público. */
catalogRouter.get('/galleries', async (_req, res, next) => {
  try {
    res.json(await catalogService.getGalleries())
  } catch (err) {
    next(err)
  }
})

catalogRouter.get('/galleries/:slug', async (req, res, next) => {
  try {
    res.json(await catalogService.getGallery(req.params.slug))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/contents — videos del archivo. Público. */
catalogRouter.get('/contents', async (req, res, next) => {
  try {
    // deviceContext ya seteó req.deviceId si vino un X-Device-Token válido (público: no lo exige).
    // El servicio gatea el youtubeId de items socioOnly según la membresía de ese device.
    res.json(await catalogService.getContents(req.deviceId))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/sponsors — sponsors (con creatives). Público. */
catalogRouter.get('/sponsors', async (_req, res, next) => {
  try {
    res.json(await catalogService.getSponsors())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/plans — planes de entrada. Público. */
catalogRouter.get('/plans', async (_req, res, next) => {
  try {
    res.json(await catalogService.getPlans())
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/convocatorias/:slug — formulario de convocatoria. Público. */
catalogRouter.get('/convocatorias/:slug', async (req, res, next) => {
  try {
    res.json(await catalogService.getConvocatoria(req.params.slug))
  } catch (err) {
    next(err)
  }
})

/** GET /api/v1/applications — postulaciones del PROPIO device ("Mis postulaciones"). */
catalogRouter.get('/applications', requireDevice, async (req, res, next) => {
  try {
    res.json(await applicationService.getDeviceApplications(req.deviceId!))
  } catch (err) {
    next(err)
  }
})

const applicationSchema = z.object({
  convocatoriaId: z.string().min(1),
  data: z.record(z.string(), z.string()),
})

/** POST /api/v1/applications — postularse (preinscripta). Público. */
catalogRouter.post('/applications', async (req, res, next) => {
  try {
    const { convocatoriaId, data } = applicationSchema.parse(req.body)
    const app = await applicationService.submitApplication(convocatoriaId, data, req.deviceId)
    res.status(201).json(app)
  } catch (err) {
    next(err)
  }
})
