// Importamos el cliente de MongoDB
const { MongoClient } = require('mongodb');

// URI de conexión. ¡IMPORTANTE! Usa variables de entorno para esto por seguridad.
// En Vercel, puedes configurar esto en la sección "Environment Variables" de tu proyecto.
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// Una función helper para conectar a la BD y evitar conexiones múltiples
async function connectToDatabase() {
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    return client.db("tu_nombre_de_base_de_datos"); // Cambia "tu_nombre_de_base_de_datos"
}

// === LÓGICA PRINCIPAL DEL WEBHOOK ===
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    const intentName = req.body.queryResult.intent.displayName;
    let response;

    try {
        switch (intentName) {
            case 'PedirMotoTaxi':
                response = await handlePedirMotoTaxi(req.body.queryResult.parameters);
                break;
            // Aquí puedes añadir más 'case' para otros intents en el futuro
            default:
                response = {
                    fulfillmentText: `El intent ${intentName} se activó, pero no tiene lógica de webhook definida.`
                };
        }
        res.status(200).json(response);
    } catch (error) {
        console.error("Error en el webhook:", error);
        res.status(500).json({ fulfillmentText: 'Lo siento, ocurrió un error interno al procesar tu solicitud.' });
    }
}


// === LÓGICA PARA EL INTENT "PedirMotoTaxi" ===
async function handlePedirMotoTaxi(parameters) {
    // 1. Extraemos los parámetros de Dialogflow
    const origen = parameters.origen || 'No especificado';
    const destino = parameters.destino || 'No especificado';
    const pasajeros = parameters.pasajeros || 1;
    const horaSalida = parameters.horaSalida ? new Date(parameters.horaSalida) : new Date(); // Si no hay hora, es inmediato

    // 2. Calculamos el precio estimado (Lógica de placeholder)
    // TODO: Reemplazar esto con una llamada real a una API de mapas (Google Maps, etc.)
    const precioEstimado = calculatePrice(origen, destino);

    // 3. Guardamos el viaje en MongoDB
    const db = await connectToDatabase();
    const viajesCollection = db.collection('viajes');
    
    const nuevoViaje = {
        origen: origen,
        destino: destino,
        pasajeros: pasajeros,
        horaSalida: horaSalida,
        precioEstimado: precioEstimado,
        estado: 'buscando_conductor',
        fechaCreacion: new Date()
        // TODO: Aquí podrías añadir un ID de usuario si tu bot tiene sistema de login
    };

    const result = await viajesCollection.insertOne(nuevoViaje);
    console.log(`Nuevo viaje creado con el ID: ${result.insertedId}`);
    
    // 4. Respondemos al usuario con un mensaje dinámico
    const fulfillmentText = getRandomConfirmationMessage(origen, destino);
    
    return {
        fulfillmentMessages: [{
            text: {
                text: [fulfillmentText]
            }
        }]
    };
}

// === FUNCIONES HELPER ===

/**
 * Simula el cálculo de un precio.
 * DEBES reemplazar esta función con tu lógica real de precios.
 * @param {string} origen - El punto de origen.
 * @param {string} destino - El punto de destino.
 * @returns {number} - Un precio estimado.
 */
function calculatePrice(origen, destino) {
    // Lógica de ejemplo: un precio base + un costo aleatorio por "distancia"
    console.log(`Calculando precio para ${origen} -> ${destino}`);
    const basePrice = 2.5; // Precio base en USD (ejemplo)
    const randomDistanceCost = Math.random() * 5; 
    return parseFloat((basePrice + randomDistanceCost).toFixed(2));
}

/**
 * Selecciona un mensaje de confirmación al azar para dar dinamismo.
 * @param {string} origen - El punto de origen para incluir en el mensaje.
 * @param {string} destino - El punto de destino para incluir en el mensaje.
 * @returns {string} - Un mensaje de confirmación.
 */
function getRandomConfirmationMessage(origen, destino) {
    const messages = [
        `¡Listo! Tu viaje de ${origen} a ${destino} está registrado. Ya estamos buscando un conductor.`,
        `Recibido. Hemos agendado tu trayecto desde ${origen} hasta ${destino} y la búsqueda de tu mototaxi ha comenzado.`,
        // ... (Aquí irían los 100 mensajes que te doy a continuación)
        // Por brevedad, solo pongo 2 aquí, pero la lógica es la misma.
    ];

    // Para el código real, pega la lista completa de mensajes abajo aquí.
    const randomIndex = Math.floor(Math.random() * confirmationMessages.length);
    return confirmationMessages[randomIndex].replace('[origen]', origen).replace('[destino]', destino);
}

// Pega la lista completa de 100 mensajes aquí
const confirmationMessages = [
  `¡Listo! Tu viaje de [origen] a [destino] está registrado. Ya estamos buscando un conductor.`,
  `Recibido. Hemos agendado tu trayecto desde [origen] hasta [destino] y la búsqueda de tu mototaxi ha comenzado.`,
  `¡Perfecto! Tu solicitud para ir de [origen] a [destino] ha sido procesada. En breve te asignaremos un conductor.`,
  `Entendido. Estamos gestionando tu viaje desde [origen] hasta [destino].`,
  `¡Hecho! Tu mototaxi para el recorrido de [origen] a [destino] está siendo localizado.`,
  `Registrado. Estamos buscando un conductor disponible para tu viaje de [origen] a [destino].`,
  `¡Confirmado! Tu viaje desde [origen] a [destino] está en marcha. Te notificaremos en cuanto un conductor acepte.`,
  `Ok, solicitud de viaje de [origen] a [destino] creada. Iniciando búsqueda de motorizado.`,
  `¡Claro que sí! Tu viaje de [origen] a [destino] fue creado exitosamente.`,
  `Tu solicitud ha sido recibida. Ya estamos ubicando un conductor para llevarte de [origen] a [destino].`,
  `¡Genial! Acabamos de registrar tu viaje de [origen] a [destino]. Estamos en la búsqueda de tu conductor.`,
  `Anotado. El sistema ya está buscando un mototaxi para tu ruta: [origen] - [destino].`,
  `Misión recibida: llevarte de [origen] a [destino]. ¡Estamos en ello!`,
  `Tu viaje está programado. Origen: [origen]. Destino: [destino]. Buscando al conductor ideal para ti.`,
  `¡Excelente! Tu petición de viaje de [origen] a [destino] está siendo atendida.`,
  `Hemos procesado tu solicitud. Un conductor para tu viaje de [origen] a [destino] será asignado pronto.`,
  `¡En marcha! La coordinación de tu viaje desde [origen] hasta [destino] ha comenzado.`,
  `Tu viaje de [origen] a [destino] ha sido ingresado al sistema. Esperando la confirmación de un conductor.`,
  `¡Todo en orden! Solicitud para [origen] - [destino] creada. Estamos notificando a los conductores cercanos.`,
  `Aceptado. Tu viaje de [origen] a [destino] está pendiente de asignación de conductor.`,
  `¡Estupendo! Ya estamos trabajando en tu viaje de [origen] a [destino].`,
  `Solicitud completada. La ruta de [origen] a [destino] está activa y buscando conductor.`,
  `Considera tu viaje de [origen] a [destino] como hecho. Solo falta que un conductor lo tome.`,
  `Hemos recibido tu petición para ir de [origen] a [destino]. La búsqueda está activa.`,
  `¡Por supuesto! Tu viaje de [origen] a [destino] está en cola para ser asignado.`,
  `Afirmativo. Procesando tu viaje de [origen] a [destino].`,
  `Tu viaje ha sido creado. Estamos contactando a los conductores para la ruta [origen] - [destino].`,
  `¡Cuenta con ello! Tu mototaxi de [origen] a [destino] está a un paso de ser confirmado.`,
  `La solicitud para tu viaje de [origen] a [destino] fue un éxito. Iniciando el proceso de asignación.`,
  `¡Vale! Viaje de [origen] a [destino] agendado. Ahora a encontrar tu conductor.`,
  `Sistema activado para tu viaje de [origen] a [destino]. Buscando la mejor opción para ti.`,
  `Tu recorrido de [origen] a [destino] ya está en nuestro sistema. Te avisaremos del conductor asignado.`,
  `¡Así de fácil! Viaje de [origen] a [destino] solicitado.`,
  `La orden está dada: un mototaxi para ir de [origen] a [destino]. Estamos buscando candidatos.`,
  `Hemos puesto en marcha la búsqueda de un conductor para tu viaje de [origen] a [destino].`,
  `¡Bien! Tu viaje de [origen] a [destino] está ahora en el sistema.`,
  `Capturamos tu solicitud para el viaje de [origen] a [destino].`,
  `Tu viaje está en el radar. Ruta: [origen] a [destino]. Estado: Buscando.`,
  `¡Sin problema! Viaje de [origen] a [destino] en proceso de asignación.`,
  `Dale, ya está pedido tu viaje de [origen] a [destino].`,
  `Tu viaje de [origen] a [destino] está confirmado y pendiente de conductor.`,
  `Hemos abierto una nueva solicitud de viaje para ti: de [origen] a [destino].`,
  `¡A la orden! Buscando un motorizado para llevarte de [origen] a [destino].`,
  `Solicitud para el trayecto [origen] - [destino] ingresada.`,
  `Ya iniciamos la búsqueda para tu viaje de [origen] a [destino].`,
  `¡Ok! Solicitud de [origen] a [destino] enviada a nuestros conductores.`,
  `Tu viaje de [origen] a [destino] ha sido agendado. Estamos esperando que un conductor lo acepte.`,
  `¡Entendido! Ya estamos moviendo hilos para tu viaje de [origen] a [destino].`,
  `Tu petición está en el sistema. En cuanto un conductor esté disponible para ir de [origen] a [destino], te lo haremos saber.`,
  `¡Copiado! Buscando un mototaxi para tu viaje de [origen] a [destino].`,
  `El primer paso está listo: tu viaje de [origen] a [destino] ha sido registrado.`,
  `¡Claro! Tu viaje de [origen] a [destino] está siendo procesado por nuestro sistema.`,
  `¡Activando la red! Buscando conductor para tu viaje desde [origen] hasta [destino].`,
  `Tu viaje de [origen] a [destino] está ahora visible para nuestra red de conductores.`,
  `¡Muy bien! Solicitud para [origen] a [destino] creada y en espera de conductor.`,
  `La solicitud se ha creado. El viaje es de [origen] a [destino].`,
  `¡Ya está! Tu viaje de [origen] a [destino] está listo para ser tomado por un conductor.`,
  `Tu viaje de [origen] a [destino] está oficialmente en el sistema.`,
  `¡Perfecto! Estamos alertando a los conductores cercanos sobre tu viaje de [origen] a [destino].`,
  `Tu solicitud para la ruta [origen] - [destino] está en buenas manos.`,
  `¡Seguro! Ya estamos en la búsqueda activa de un conductor para tu viaje de [origen] a [destino].`,
  `Hemos registrado tu solicitud y los conductores ya están siendo notificados para tu viaje de [origen] a [destino].`,
  `¡Como digas! Viaje de [origen] a [destino] creado.`,
  `El sistema ha aceptado tu solicitud de viaje de [origen] a [destino].`,
  `¡Marchando! Un viaje de [origen] a [destino] está siendo preparado.`,
  `Recibimos tu solicitud. En cuanto un conductor confirme tu viaje de [origen] a [destino], te avisamos.`,
  `¡OK! Tu viaje de [origen] a [destino] está en el sistema, buscando un match con un conductor.`,
  `Tu viaje de [origen] a [destino] está listo. Solo falta la confirmación del conductor.`,
  `¡Trato hecho! Viaje de [origen] a [destino] solicitado.`,
  `Estamos en ello. Tu viaje de [origen] a [destino] está siendo asignado.`,
  `Tu solicitud de viaje de [origen] a [destino] ha sido registrada con éxito.`,
  `¡Chévere! Tu viaje de [origen] a [destino] ya está en la cola.`,
  `Hemos puesto tu viaje de [origen] a [destino] en el mapa. Buscando al conductor más cercano.`,
  `Tu viaje de [origen] a [destino] ha sido creado. La asignación de conductor está en progreso.`,
  `¡Listo para rodar! Bueno, casi. Tu viaje de [origen] a [destino] está buscando conductor.`,
  `Tu viaje de [origen] a [destino] está en nuestra lista de tareas.`,
  `¡Ya lo tienes! Solicitud para [origen] a [destino] en el sistema.`,
  `Hemos disparado la alerta a nuestros conductores para tu viaje de [origen] a [destino].`,
  `¡OK! Tu viaje de [origen] a [destino] está esperando ser reclamado por un conductor.`,
  `Hemos agendado tu viaje. La ruta es [origen] - [destino].`,
  `¡Fino! Buscando a alguien que te lleve de [origen] a [destino].`,
  `Tu viaje de [origen] a [destino] ha sido aceptado por nuestro sistema y ahora busca conductor.`,
  `La solicitud está dentro. Esperando conductor para el viaje de [origen] a [destino].`,
  `¡No se diga más! A buscar conductor para tu viaje de [origen] a [destino].`,
  `Tu viaje de [origen] a [destino] está en el horno. Te avisamos cuando esté listo (¡y asignado!).`,
  `Hemos dado de alta tu viaje de [origen] a [destino].`,
  `¡Estás en la lista! Tu viaje de [origen] a [destino] será asignado en breve.`,
  `Tu solicitud para moverte de [origen] a [destino] está siendo procesada.`,
  `¡Visto! Creando tu solicitud de viaje de [origen] a [destino].`,
  `Tu viaje de [origen] a [destino] está en la parrilla de salida.`,
  `¡Recibido y procesando! Viaje: [origen] a [destino].`,
  `Ya está tu solicitud en el sistema para ir de [origen] a [destino].`,
  `¡Dalo por hecho! Estamos buscando un conductor para tu viaje de [origen] a [destino].`,
  `Hemos emitido una solicitud de viaje en tu nombre de [origen] a [destino].`,
  `¡Pan comido! Tu viaje de [origen] a [destino] está agendado.`,
  `Tu viaje de [origen] a [destino] está ahora en el tablero de viajes disponibles.`,
  `¡Anotado! Estamos localizando un mototaxi para tu trayecto de [origen] a [destino].`,
  `Hemos iniciado el protocolo de búsqueda de conductor para tu viaje de [origen] a [destino].`,
  `Tu viaje de [origen] a [destino] está en nuestro radar. En cuanto tengamos un conductor, te lo haremos saber.`,
  `¡Solicitud confirmada! Tu viaje desde [origen] hasta [destino] está siendo gestionado en este momento.`
];




