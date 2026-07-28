import { Hono } from 'hono'
import posts from './posts'

const app = new Hono()
app.get('/', (c) => c.text('OK'))
app.route('/posts', posts)

export default app
