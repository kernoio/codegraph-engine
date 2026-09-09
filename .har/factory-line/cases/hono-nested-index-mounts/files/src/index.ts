import { Hono } from 'hono'
import project from './project'
import task from './task'

// usekaneo/kaneo apps/api/src/index.ts shape: a root app, an `api` sub-app
// mounted at /api in the same file, and directory-module routers mounted on
// `api`. Every route must come out as /api/<module>/…
const app = new Hono()
const api = new Hono()

api.get('/health', (c) => c.json({ status: 'ok' }))
api.route('/project', project)
api.route('/task', task)

app.route('/api', api)

export default app
