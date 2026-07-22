'use strict';

const Hapi = require('@hapi/hapi');

const createServer = async () => {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
  });

  await server.register([
    require('../../interfaces/routes/users'),
  ]);

  return server;
};

module.exports = createServer;
