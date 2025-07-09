### **Roadmap para tu Bot de Música de Discord**

#### **Fase 0: Preparación del Entorno**

Antes de escribir código del bot, asegúrate de tener todo lo necesario.

1.  **Crear una Aplicación de Bot en Discord:**
    *   Ve al [Portal de Desarrolladores de Discord](https://discord.com/developers/applications).
    *   Crea una "New Application".
    *   Ve a la pestaña "Bot", haz clic en "Add Bot".
    *   **Importante:** Activa los **"Privileged Gateway Intents"**. Necesitarás `SERVER MEMBERS INTENT` y `MESSAGE CONTENT INTENT` (aunque con Slash Commands, el segundo es menos crítico).
    *   Copia el **Token** del bot. ¡Mantenlo en secreto!

2.  **Instalar las Librerías Necesarias:**
    Tu `package.json` debería incluir estas dependencias:

    ```bash
    # Librería principal para interactuar con la API de Discord
    npm install discord.js

    # Librería oficial para manejar audio y conexiones de voz
    npm install @discordjs/voice

    # Dependencias para el cifrado de audio (requerido por @discordjs/voice)
    npm install sodium-native libsodium-wrappers

    # Tu librería para obtener info y streams de YouTube
    npm install youtube-dl-exec

    # Para manejar variables de entorno (como tu token) de forma segura
    npm install dotenv
    ```

3.  **Configurar tu Proyecto:**
    *   Crea un archivo `.env` en la raíz de tu proyecto para guardar tu token:
        ```
        DISCORD_TOKEN=AQUI_VA_TU_TOKEN_SECRETO
        ```
    *   Crea un archivo principal para tu bot, por ejemplo, `bot.js`.

---

#### **Fase 1: Estructura Básica del Bot y Conexión**

El objetivo aquí es tener un bot que se conecte a Discord y responda a un comando simple.

1.  **Código de Conexión (`bot.js`):**
    ```javascript
    require('dotenv').config(); // Cargar variables de entorno
    const { Client, GatewayIntentBits } = require('discord.js');

    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildVoiceStates, // ¡Esencial para saber quién está en qué canal de voz!
        GatewayIntentBits.MessageContent
      ]
    });

    client.on('ready', () => {
      console.log(`¡Bot conectado como ${client.user.tag}!`);
    });

    // Aquí registraremos los comandos y manejaremos las interacciones

    client.login(process.env.DISCORD_TOKEN);
    ```

2.  **Registro de Comandos (Slash Commands):**
    Los bots modernos usan comandos de barra (`/play`, `/skip`). Son más limpios y recomendados por Discord. Deberás crear un script para registrar estos comandos una sola vez.

---

#### **Fase 2: Integrar tu Lógica de YouTube y Reproducir una Canción**

Aquí es donde adaptamos tu código `youtube.js`. **No lo usaremos como una API de Fastify**, sino que integraremos su lógica directamente en el bot para mayor eficiencia.

1.  **Adaptar `youtube.js` para ser un Módulo de Utilidad:**
    Crea un archivo, por ejemplo, `utils/youtube.js`. Su función no será responder a peticiones HTTP, sino devolver la información y la URL del stream.

    **Cambio Crítico:** Tu ruta `/download` hace una redirección (`reply.redirect`). Para el bot, **necesitamos la URL del stream, no la redirección**.

    ```javascript
    // utils/youtube.js
    const youtubedl = require('youtube-dl-exec');

    // Función para buscar y obtener la info básica de una canción
    async function searchSong(query) {
      try {
        const result = await youtubedl(query, {
          dumpSingleJson: true,
          defaultSearch: 'ytsearch', // Busca en YouTube en lugar de esperar una URL directa
        });
        // Si es una playlist, tomamos el primer video
        const videoInfo = result.entries ? result.entries[0] : result;
        return {
          title: videoInfo.title,
          url: videoInfo.webpage_url,
          thumbnail: videoInfo.thumbnail,
          duration: videoInfo.duration_string,
        };
      } catch (error) {
        console.error("Error buscando la canción:", error);
        return null;
      }
    }

    // Función para obtener solo la URL del stream de audio
    async function getStreamUrl(videoUrl) {
      try {
        const output = await youtubedl(videoUrl, {
          getUrl: true,
          format: 'bestaudio/best', // Siempre preferir el mejor formato de solo audio
        });
        return (Array.isArray(output) ? output[0] : output).trim();
      } catch (error) {
        console.error("Error obteniendo la URL del stream:", error);
        return null;
      }
    }

    module.exports = { searchSong, getStreamUrl };
    ```

2.  **Crear el Comando `/play`:**
    Este comando hará lo siguiente:
    *   Verificar que el usuario está en un canal de voz.
    *   Unirse al canal de voz del usuario.
    *   Usar `searchSong` para encontrar el video.
    *   Usar `getStreamUrl` para obtener el enlace de audio.
    *   Usar `@discordjs/voice` para reproducir el audio.

    ```javascript
    // En tu manejador de comandos para /play
    const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
    const { searchSong, getStreamUrl } = require('../utils/youtube.js');

    // ... dentro del execute del comando ...
    const voiceChannel = interaction.member.voice.channel;
    if (!voiceChannel) {
        return interaction.reply('¡Necesitas estar en un canal de voz para usar este comando!');
    }

    const query = interaction.options.getString('cancion');

    try {
        await interaction.deferReply(); // Informa a Discord que estamos trabajando en ello

        const songInfo = await searchSong(query);
        if (!songInfo) {
            return interaction.editReply('No pude encontrar esa canción.');
        }

        const streamUrl = await getStreamUrl(songInfo.url);
        if (!streamUrl) {
            return interaction.editReply('No pude obtener el stream para esta canción.');
        }

        // Conectarse al canal de voz
        const connection = joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        // Crear el reproductor y el recurso de audio
        const player = createAudioPlayer();
        const resource = createAudioResource(streamUrl);

        player.play(resource);
        connection.subscribe(player); // ¡Crucial! Conecta el reproductor a la conexión de voz

        player.on(AudioPlayerStatus.Idle, () => {
            // La canción terminó. Por ahora, simplemente nos desconectamos.
            // En la siguiente fase, aquí llamaremos a la siguiente canción de la cola.
            connection.destroy();
        });

        await interaction.editReply(`Reproduciendo ahora: **${songInfo.title}**`);

    } catch (error) {
        console.error(error);
        await interaction.editReply('Hubo un error al intentar reproducir la canción.');
    }
    ```

---

#### **Fase 3: Implementación de la Cola (Queue)**

Este es el núcleo de un bot de música. Necesitamos una estructura de datos para gestionar las colas de cada servidor (guild).

1.  **Estructura de Datos para la Cola:**
    Un `Map` de JavaScript es perfecto para esto. La clave será el `guild.id` y el valor será un objeto que contiene el estado de la cola para ese servidor.

    ```javascript
    // En tu archivo principal `bot.js` o en un `utils/queueManager.js`
    client.queues = new Map();

    // Estructura de un objeto de cola para un servidor:
    const queueContruct = {
        voiceChannel: null,
        connection: null,
        player: null,
        songs: [], // Array de objetos { title, url, thumbnail, ... }
        isPlaying: false,
    };
    ```

2.  **Modificar el Comando `/play` para Usar la Cola:**

    ```javascript
    // ... dentro del execute del comando /play ...
    const serverQueue = client.queues.get(interaction.guild.id);
    const songInfo = await searchSong(query); // (misma lógica de antes)

    if (!serverQueue) {
        // No hay una cola, creamos una nueva
        const queueContruct = {
            voiceChannel: voiceChannel,
            connection: null, // Se establecerá al conectarse
            player: createAudioPlayer(),
            songs: [songInfo],
            isPlaying: true,
        };
        client.queues.set(interaction.guild.id, queueContruct);

        try {
            const connection = joinVoiceChannel({ ... }); // misma lógica de conexión
            queueContruct.connection = connection;
            connection.subscribe(queueContruct.player);
            playNextSong(interaction.guild, client.queues); // Función para iniciar la reproducción
        } catch (error) {
            client.queues.delete(interaction.guild.id);
            return interaction.editReply('No pude unirme al canal de voz.');
        }
    } else {
        // Ya hay una cola, simplemente añadimos la canción
        serverQueue.songs.push(songInfo);
        return interaction.editReply(`**${songInfo.title}** ha sido añadido a la cola.`);
    }
    ```

3.  **La Función `playNextSong` (El Corazón de la Cola):**
    Esta función se encarga de reproducir la siguiente canción. Se llama cuando se añade la primera canción a una cola vacía y se llama a sí misma cada vez que una canción termina.

    ```javascript
    // En un archivo de utilidad o en el mismo bot.js
    async function playNextSong(guild, queues) {
        const serverQueue = queues.get(guild.id);

        if (!serverQueue.songs.length) {
            // Cola vacía, nos desconectamos después de un tiempo
            setTimeout(() => {
                if (serverQueue.songs.length === 0) {
                    serverQueue.connection.destroy();
                    queues.delete(guild.id);
                }
            }, 300000); // 5 minutos de inactividad
            return;
        }

        const song = serverQueue.songs[0]; // La siguiente canción es la primera del array
        const streamUrl = await getStreamUrl(song.url);

        if (!streamUrl) {
            // No se pudo obtener el stream, saltamos a la siguiente
            serverQueue.songs.shift();
            return playNextSong(guild, queues);
        }

        const resource = createAudioResource(streamUrl);
        serverQueue.player.play(resource);

        // Listener para cuando la canción actual termine
        serverQueue.player.once(AudioPlayerStatus.Idle, () => {
            serverQueue.songs.shift(); // Elimina la canción que acaba de terminar
            playNextSong(guild, queues); // Llama a la siguiente
        });

        // (Opcional) Enviar un mensaje al canal de texto
        // interaction.channel.send(`Reproduciendo ahora: **${song.title}**`);
    }
    ```

---

#### **Fase 4: Comandos Adicionales y Mejoras**

Una vez que la cola funciona, puedes añadir más funcionalidades.

*   **`/skip`**:
    *   Verifica si hay una cola y si hay canciones en ella.
    *   Llama a `serverQueue.player.stop()`. Esto hará que el estado del reproductor cambie a `Idle`, activando el listener que llama a `playNextSong()`.
*   **`/stop`**:
    *   Vacía el array `serverQueue.songs`.
    *   Detiene el reproductor (`player.stop()`).
    *   Destruye la conexión (`connection.destroy()`).
    *   Elimina la cola del `Map` (`client.queues.delete(guild.id)`).
*   **`/queue`**:
    *   Muestra las canciones que están en el array `serverQueue.songs`. Puedes usar un `Embed` de Discord para que se vea bonito.
*   **`/nowplaying`**:
    *   Muestra la información de `serverQueue.songs[0]`.

### **Estructura de Archivos Recomendada**

```
/tu-proyecto
|-- /commands
|   |-- /music
|   |   |-- play.js
|   |   |-- skip.js
|   |   |-- stop.js
|   |   `-- queue.js
|-- /utils
|   |-- youtube.js      <-- Tu lógica de ytdl adaptada
|   `-- play.js         <-- La función playNextSong podría ir aquí
|-- bot.js              <-- El cliente principal, listeners y manejador de comandos
|-- deploy-commands.js  <-- Script para registrar los slash commands
|-- .env                <-- Tu token y otras variables
`-- package.json
