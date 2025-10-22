// Importamos MongoClient Y TAMBIÉN ObjectId, que necesitaremos más tarde
const { MongoClient, ObjectId } = require('mongodb');

// URI de conexión. Lee la variable de entorno que configuraste en Vercel.
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri);

// --- FIX #1: LA FUNCIÓN QUE FALTABA ---
// Esta es la función de ayuda que establece la conexión con la base de datos.
// Ahora está definida y disponible para ser usada por nuestras otras funciones.
async function connectToDatabase() {
    if (!client.topology || !client.topology.isConnected()) {
        await client.connect();
    }
    // Recuerda cambiar "chatbot_delivery" si tu base de datos tiene otro nombre.
    return client.db("chatbot_delivery"); 
}

// === LÓGICA PRINCIPAL DEL WEBHOOK ===
export default async function handler(req, res) {
    try {
        // --- FIX #2: ACCEDEMOS A LOS DATOS DE FORMA SEGURA ---
        // Extraemos la información de la raíz del cuerpo de la petición.
        const { fulfillmentInfo, sessionInfo } = req.body;

        // Verificamos que la información necesaria exista antes de usarla.
        if (!fulfillmentInfo || !fulfillmentInfo.tag) {
            throw new Error("Petición inválida: Falta fulfillmentInfo o tag.");
        }

        const toolTag = fulfillmentInfo.tag;
        let responseData = {};

        console.log(`Tool a ejecutar: ${toolTag}`); // Log para depuración

        switch (toolTag) {
            case 'ConsultarPrecioViaje':
                // Pasamos solo los parámetros necesarios.
                responseData = await handleConsultarPrecio(sessionInfo.parameters);
                break;

            case 'ConfirmarPagoYAsignarConductor':
                responseData = await handleConfirmarPago(sessionInfo.parameters);
                break;

            default:
                throw new Error(`Tool desconocida: ${toolTag}`);
        }

        // Construimos la respuesta para Dialogflow CX
        const response = {
            sessionInfo: {
                parameters: {
                    ...responseData // Devolvemos los datos de salida de la herramienta
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        console.error("ERROR FATAL EN EL WEBHOOK:", error);
        // Devolvemos un error 500 si algo falla.
        res.status(500).json({ error: error.message });
    }
}


// --- Las funciones de las herramientas (con las mejoras de seguridad que vimos) ---

async function handleConsultarPrecio(params) {
    // ... (El código de esta función que ya teníamos, con la mejora para manejar precios no encontrados)
    const { origen, destino, pasajeros } = params;
    const db = await connectToDatabase();
    
    const esCarro = pasajeros > 1;
    const collectionName = esCarro ? 'precios_carros' : 'precios_motos';
    const tipoVehiculo = esCarro ? 'Carro' : 'Moto Taxi';

    const priceData = await db.collection(collectionName).findOne({ 
        origen: new RegExp(`^${origen}$`, 'i'), 
        destino: new RegExp(`^${destino}$`, 'i') 
    });
    
    if (!priceData) {
        console.warn(`No se encontró precio para la ruta: ${origen} -> ${destino}`);
        const precioBs = 0;
        const precioUsd = 0;
        const viajeId = "ruta-no-encontrada";
        const mensajeError = `Lo siento, no tenemos una tarifa definida para la ruta de ${origen} a ${destino}.`;
        // Devolvemos un parámetro de error que Gemini puede usar para hablar con el usuario.
        return { precioBs, precioUsd, tipoVehiculo, viajeId, error: mensajeError };
    }

    const precioBs = priceData.precio;
    const precioUsd = parseFloat((priceData.precio / 36.5).toFixed(2));

    const result = await db.collection('viajes').insertOne({
        origen, destino, pasajeros, precioBs,
        estado: 'cotizado',
        fechaCreacion: new Date()
    });
    const viajeId = result.insertedId.toString();

    return { precioBs, precioUsd, tipoVehiculo, viajeId };
}

async function handleConfirmarPago(params) {
    // ... (El código de esta función que ya teníamos)
    const { viajeId, referenciaPago } = params;
    const db = await connectToDatabase();
    
    const pagoConfirmado = true;

    if (!pagoConfirmado) {
        return { pagoConfirmado: false, mensajeUsuario: "Hubo un problema al verificar tu pago. Por favor, intenta de nuevo."};
    }

    const conductor = await db.collection('conductores').findOne({ estado: 'disponible' });
    
    if (!conductor) {
        return { pagoConfirmado: true, mensajeUsuario: "¡Pago confirmado! Todos nuestros conductores están ocupados en este momento. Por favor, espera unos minutos e intenta de nuevo."};
    }
    
    await db.collection('viajes').updateOne({ _id: new ObjectId(viajeId) }, { $set: { estado: 'asignado', conductorId: conductor._id, referenciaPago: referenciaPago } });
    await db.collection('conductores').updateOne({ _id: conductor._id }, { $set: { estado: 'ocupado' } });

    const mensajeUsuario = `¡Perfecto! El piloto que se te asignó es: ${conductor.nombre}. Teléfono: ${conductor.telefono}. Este atento, llegará en unos momentos.`;
    
    return {
        pagoConfirmado: true,
        nombreConductor: conductor.nombre,
        telefonoConductor: conductor.telefono,
        mensajeUsuario: mensajeUsuario
    };
}
