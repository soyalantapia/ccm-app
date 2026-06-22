import { Router } from 'express'
import * as catalogService from '../services/catalogService.js'

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
catalogRouter.get('/contents', async (_req, res, next) => {
  try {
    res.json(await catalogService.getContents())
  } catch (err) {
    next(err)
  }
})
