const Router = require('@koa/router');

const router = new Router({
  prefix: '/users',
});

router.get('/sign_in', signIn);
router.post('/sign_in', logIn);
router.get('/logout', logOut);
router.get('/', index);

function signIn(ctx) {
  ctx.body = 'sign_in';
}
function logIn(ctx) {
  ctx.body = 'login';
}
function logOut(ctx) {
  ctx.body = 'logout';
}
function index(ctx) {
  ctx.body = [];
}

module.exports = router;
