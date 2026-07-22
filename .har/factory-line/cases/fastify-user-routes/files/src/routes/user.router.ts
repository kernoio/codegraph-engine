import { FastifyInstance } from 'fastify';

async function login() {}
async function signUp() {}

async function userRouter(fastify: FastifyInstance) {
  fastify.post('/login', login);
  fastify.post('/signup', signUp);
}

export default userRouter;
