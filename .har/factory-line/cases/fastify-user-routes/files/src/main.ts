import fastify from 'fastify';
import userRouter from './routes/user.router';

const server = fastify();

server.register(userRouter, { prefix: '/api/user' });

server.get('/health', async (_request, reply) => {
  reply.status(200).send({ message: 'ok' });
});

server.get('/', (_request, reply) => {
  reply.status(200).send({ message: 'Hello from fastify boilerplate!' });
});

export default server;
