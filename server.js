// server.js

// Inicializamos Fastify con un logger para ver lo que pasa en la consola
const fastify = require('fastify')({
  logger: true
});

// Registramos nuestras rutas de YouTube
fastify.register(require('./routes/youtube'));

// Ruta de bienvenida para saber que el servidor funciona
fastify.get('/', async (request, reply) => {
  return { message: 'API de YouTube Downloader funcionando. Usa /info o /download.' };
});

// Función para iniciar el servidor
const start = async () => {
  try {
    // Escuchamos en el puerto 3000 o el que esté definido en las variables de entorno
    await fastify.listen({ port: process.env.PORT || 3000, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Ejecutamos la función de inicio
start();