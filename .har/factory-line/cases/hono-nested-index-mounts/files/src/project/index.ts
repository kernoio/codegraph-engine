import { Hono } from 'hono'

const project = new Hono<{ Variables: { userId: string } }>()
  .get('/', (c) => c.json([]))
  .post('/', async (c) => c.json(await c.req.json(), 201))
  .get('/:id', (c) => c.json({ id: c.req.param('id') }))

export default project
