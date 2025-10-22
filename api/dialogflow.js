// ... (código de conexión a MongoDB) ...

export default async function handler(req, res) {
    // La petición de un agente generativo es diferente.
    // Buscamos el "tag" de la herramienta que se activó.
    const toolTag = req.body.fulfillmentInfo.tag;

    let responseData;

    switch (toolTag) {
        case 'ConsultarPrecioViaje':
            responseData = await handleConsultarPrecio(req.body.sessionInfo.parameters);
            break;

        case 'ConfirmarPagoYAsignarConductor':
            responseData = await handleConfirmarPago(req.body.sessionInfo.parameters);
            break;

        default:
            throw new Error(`Unknown tool tag: ${toolTag}`);
    }

    // La respuesta a Dialogflow también tiene un formato específico.
    const response = {
        fulfillmentResponse: {
            messages: [{
                // Puedes enviar un mensaje de texto aquí, pero la magia
                // es que Gemini usará los datos de 'toolOutput' para hablar.
                text: { text: ["Procesando..."] }
            }]
        },
        sessionInfo: {
            parameters: {
                // Aquí devolvemos la data de salida de la herramienta.
                ...responseData
            }
        }
    };

    res.status(200).json(response);
}

async function handleConsultarPrecio(params) {
    const { origen, destino, pasajeros } = params;
    const db = await connectToDatabase();
    
    // 1. LÓGICA DE VEHÍCULO:
    const esCarro = pasajeros > 1;
    const collectionName = esCarro ? 'precios_carros' : 'precios_motos';
    const tipoVehiculo = esCarro ? 'Carro' : 'Moto Taxi';

    // 2. LÓGICA DE PRECIO:
    // Aquí iría tu lógica para manejar links de Google Maps vs. texto.
    // Por ahora, buscamos una coincidencia directa.
    const priceData = await db.collection(collectionName).findOne({ origen: origen, destino: destino });
    
    // TODO: Manejar el caso donde no se encuentra el precio.
    const precioBs = priceData ? priceData.precio : 50; // Precio por defecto si no se encuentra
    const precioUsd = priceData ? priceData.precio / 309 : 1; // Tasa de cambio de ejemplo

    // 3. CREAR VIAJE TEMPORAL:
    const result = await db.collection('viajes').insertOne({
        origen, destino, pasajeros, precioBs,
        estado: 'cotizado',
        fechaCreacion: new Date()
    });
    const viajeId = result.insertedId.toString();

    // 4. DEVOLVER DATOS DE SALIDA:
    return { precioBs, precioUsd, tipoVehiculo, viajeId };
}

async function handleConfirmarPago(params) {
    const { viajeId, referenciaPago } = params;
    const db = await connectToDatabase();
    
    // 1. VALIDACIÓN DE PAGO (SIMULADA):
    // En un sistema real, aquí llamarías a una API del banco.
    // Para empezar, asumimos que cualquier referencia es válida.
    const pagoConfirmado = true;

    if (!pagoConfirmado) {
        // ... Lógica si el pago falla
    }

    // 2. ASIGNAR CONDUCTOR:
    // Buscamos un conductor disponible.
    const conductor = await db.collection('conductores').findOne({ estado: 'disponible' });
    
    // TODO: Manejar el caso donde no hay conductores disponibles.
    
    // 3. ACTUALIZAR ESTADO DEL VIAJE Y CONDUCTOR:
    await db.collection('viajes').updateOne({ _id: new ObjectId(viajeId) }, { $set: { estado: 'asignado', conductorId: conductor._id } });
    await db.collection('conductores').updateOne({ _id: conductor._id }, { $set: { estado: 'ocupado' } });

    // 4. DEVOLVER DATOS DE SALIDA:
    const mensajeUsuario = `¡Perfecto! El piloto que se te asignó es: ${conductor.nombre}. Teléfono: ${conductor.telefono}. Este atento, llegará en unos momentos.`;
    
    return {
        pagoConfirmado: true,
        nombreConductor: conductor.nombre,
        telefonoConductor: conductor.telefono,
        mensajeUsuario: mensajeUsuario
    };
}
