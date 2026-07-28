import { Hono } from 'hono'
import * as model from './model'

// Hono's docs-recommended RPC shape: verbs chained directly off the
// constructor so `hono/client` can infer the types (BE-2687). This whole
// router previously produced 0 route nodes.
const posts = new Hono<{
  Variables: { userId: string };
}>()
  .get('/', async (c) => {
    return c.json({ posts: await model.getPosts() })
  })
  .post('/', async (c) => {
    const body = await c.req.json()
    return c.json({ post: await model.createPost(body) }, 201)
  })
  .get('/:id', async (c) => {
    return c.json({ post: await model.getPost(c.req.param('id')) })
  })
  .put('/:id', async (c) => {
    const body = await c.req.json()
    return c.json({ post: await model.updatePost(c.req.param('id'), body) })
  })
  .delete('/:id', async (c) => {
    return c.json({ ok: await model.deletePost(c.req.param('id')) })
  })

export default posts
