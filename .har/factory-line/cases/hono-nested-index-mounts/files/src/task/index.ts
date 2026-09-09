import { Hono } from 'hono'

const task = new Hono<{
  Variables: {
    userId: string;
    onDone: (ok: boolean) => void;
  };
}>()
  .get('/tasks/:projectId', (c) => c.json({ projectId: c.req.param('projectId') }))
  .post('/:projectId', async (c) => c.json(await c.req.json(), 201))
  .put('/title/:id', async (c) => c.json({ id: c.req.param('id') }))

export default task
