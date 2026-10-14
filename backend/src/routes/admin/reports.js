import { Router } from 'express'
import { audit } from '../../services/audit.js'
import { permissionsFor } from '../../services/permissions.js'
import { findReport, loadReport, rangeQuery, reports } from '../../services/reports.js'
import { actor } from '../../middleware/auth.js'
import { forbidden, notFound } from '../../utils/errors.js'
import { toCsv } from '../../utils/csv.js'

export const adminReportsRouter = Router()

/** Reports guard themselves: each one lists the permissions that may run it. */
async function allowedReports(req) {
  const me = actor(req)
  const mine = await permissionsFor(me.id, me.role)
  return reports.filter((report) => me.role === 'ADMIN' || report.access.some((key) => mine.includes(key)))
}
async function pick(req) {
  const report = findReport(String(req.params.id))
  if (!report) throw notFound('Report')
  if (!(await allowedReports(req)).includes(report)) throw forbidden('Your account does not have access to this report. Ask an administrator.')
  return report
}

adminReportsRouter.get('/reports', async (req, res) => {
  res.json({
    items: (await allowedReports(req)).map((report) => ({ id: report.id, title: report.title, description: report.description, range: report.range })),
  })
})

adminReportsRouter.get('/reports/:id/preview', async (req, res) => {
  const report = await pick(req)
  const dates = rangeQuery.parse(req.query)
  const data = await loadReport(report, dates)
  res.json({
    columns: report.columns,
    rows: data.slice(0, 25),
    total: data.length,
    range: report.range ? dates : null,
  })
})

adminReportsRouter.get('/reports/:id/download', async (req, res) => {
  const report = await pick(req)
  const dates = rangeQuery.parse(req.query)
  const data = await loadReport(report, dates)
  await audit(actor(req).id, 'report.download', 'Report', report.id, { ...(report.range ? dates : {}), rows: data.length })
  const stamp = report.range ? `${dates.from}_to_${dates.to}` : new Date().toISOString().slice(0, 10)
  res
    .type('text/csv; charset=utf-8')
    .set('Content-Disposition', `attachment; filename="clickmart-${report.id}-${stamp}.csv"`)
    .set('Cache-Control', 'no-store')
    .send(toCsv(report.columns, data))
})
