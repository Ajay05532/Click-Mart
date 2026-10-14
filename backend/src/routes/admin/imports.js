import { Router } from 'express'
import { actor } from '../../middleware/auth.js'
import { importBody, runProductImport, runStockImport } from '../../services/importer.js'

export const adminImportsRouter = Router()

/** Preview with dryRun true (the default), then send the same rows with dryRun false to save. */
adminImportsRouter.post('/imports/products', async (req, res) => {
  const body = importBody.parse(req.body)
  res.json(await runProductImport(body.rows, { dryRun: body.dryRun, userId: actor(req).id }))
})

adminImportsRouter.post('/imports/stock', async (req, res) => {
  const body = importBody.parse(req.body)
  res.json(await runStockImport(body.rows, { dryRun: body.dryRun, userId: actor(req).id }))
})
