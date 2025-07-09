// routes/youtube.js

// Importamos la librería. Va a buscar el ejecutable yt-dlp o youtube-dl en tu sistema.
const youtubedl = require('youtube-dl-exec');
const template = (VIDEO_ID) =>{
    return `https://www.youtube.com/watch?v=${VIDEO_ID}`;
}
// Definimos una función asíncrona que registra las rutas en Fastify
async function youtubeRoutes(fastify, options) {

  /**
   * Ruta para obtener la información completa de un video (incluyendo formatos).
   * Uso: GET /info?url=https://www.youtube.com/watch?v=...
   */
  fastify.get('/info', async (request, reply) => {
    const videoUrl = request.query.url;

    if (!videoUrl) {
      // Si no se proporciona una URL, devolvemos un error 400
      return reply.code(400).send({ error: 'El parámetro "url" es requerido' });
    }

    try {
      // Usamos la bandera --dump-single-json para obtener toda la info en formato JSON
      const info = await youtubedl(videoUrl, {
        dumpSingleJson: true,
      });

      // Devolvemos la información completa del video
      reply.send(info);

    } catch (error) {
      fastify.log.error(error); // Logueamos el error en la consola del servidor
      reply.code(500).send({ error: 'No se pudo obtener la información del video.', details: error.message });
    }
  });


  /**
   * Ruta para obtener una URL de descarga directa y redirigir al usuario.
   * Uso: GET /download?url=VIDEO_URL&formatId=FORMATO_ID
   * Ejemplo: /download?url=https://...&formatId=22
   */
  fastify.get('/download', async (request, reply) => {
    const { VIDEO_ID, formatId } = request.query;
    const url = template(VIDEO_ID);
    if (!VIDEO_ID) {
      return reply.code(400).send({ error: 'Los parámetros "VIDEO_ID" y "formatId" son requeridos.' });
    }

    try {
      // Usamos la bandera -g (--get-url) para obtener solo la URL de descarga directa
      // y -f (--format) para especificar el formato deseado.
      // por defectivo, youtube-dl se utiliza formato mp3 o audio
        const output = await youtubedl(url, {
            getUrl: true,
            format: formatId || 'bestaudio/best',
        });

        // VERIFICACIÓN: Nos aseguramos de que la salida sea un string.
        // Si es un array, tomamos el primer elemento. Si no, usamos la salida directamente.
        // El .trim() elimina saltos de línea (\n) o espacios que pueda devolver el CLI.
        const downloadUrl = (Array.isArray(output) ? output[0] : output).trim();

        if (!downloadUrl) {
            // Si después de todo no hay URL, enviamos un error.
            return reply.code(404).send({ error: 'No se pudo generar una URL de descarga para este formato.' });
        }

        // En lugar de enviar el archivo a través de nuestro servidor,
        // lo cual consumiría mucho ancho de banda, hacemos una redirección.
        // El navegador del cliente descargará el video directamente desde los servidores de YouTube.
        fastify.log.info(`Redirigiendo a: ${downloadUrl}`);
        
        // Ahora sí, pasamos un string limpio y válido.
        reply.redirect(302, downloadUrl);

    } catch (error) {
      fastify.log.error(error);
      reply.code(500).send({ error: 'No se pudo obtener el enlace de descarga.', details: error.message, url: url, formatId: formatId });
    }
  });
}

// Exportamos la función para poder usarla en server.js
module.exports = youtubeRoutes;