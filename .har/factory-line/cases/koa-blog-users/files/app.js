const router = require('@koa/router')();
const Koa = require('koa');
const users = require('./routes/users');

const app = (module.exports = new Koa());

router
  .get('/', list)
  .get('/post/new', add)
  .get('/post/:id', show)
  .post('/post', create);


app.use(router.routes());
app.use(users.routes());

async function list(ctx) {
  ctx.body = [];
}
async function add(ctx) {
  ctx.body = 'new';
}
async function show(ctx) {
  ctx.body = { id: ctx.params.id };
}
async function create(ctx) {
  ctx.status = 201;
}
