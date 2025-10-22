import mongoose from 'mongoose';

// --- Conexión Mongoose (Optimizada para Vercel) ---
let conn = null;
const uri = process.env.MONGODB_URI;

async function connectToDatabase() {
  if (conn == null) {
    conn = mongoose.connect(uri, {
      serverSelectionTimeoutMS: 15000 // Aumenta el timeout para clústeres fríos
    }).then(() => mongoose);
    await conn;
  }
  return conn;
}

// --- Definición de Esquemas y Modelos ---
const viajeSchema = new mongoose.Schema({
  fechaHoraCreacion: { type: Date, default: Date.now },
  clienteId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cliente' },
  solicitud: {
    origenTexto: String,
    destinoTexto: String,
    pasajeros: Number,
  },
  cotizacion: {
    tipoVehiculo: String,
    precioBs: Number
  },
  pago: {
    referencia: String,
    estadoPago: { type: String, default: 'pendiente' }
  },
  asignacion: {
    conductorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Conductor' },
    nombreConductor: String,
    telefonoConductor: String
  },
  estadoGeneral: { type: String, default: 'cotizado' }
});

const conductorSchema = new mongoose.Schema({
    nombre: String,
    telefono: String,
    estado: String,
    vehiculo: String
});

const precioSchema = new mongoose.Schema({
    origen: String,
    destino: String,
    precio: Number
});

// Registrar modelos para evitar recompilación en Vercel
const Viaje = mongoose.models.Viaje || mongoose.model('Viaje', viajeSchema);
const Conductor = mongoose.models.Conductor || mongoose.model('Conductor', conductorSchema);
const PrecioMoto = mongoose.models.PrecioMoto || mongoose.model('PrecioMoto', precioSchema, 'precios_motos');
const PrecioCarro = mongoose.models.PrecioCarro || mongoose.model('PrecioCarro', precioSchema, 'precios_carros');

// === LÓGICA PRINCIPAL DEL WEBHOOK ===
export default async function handler(req, res) {
    try {
        const { fulfillmentInfo, sessionInfo } = req.body;

        if (!fulfillmentInfo || !fulfillmentInfo.tag) {
            throw new Error("Petición inválida: Falta fulfillmentInfo o tag.");
        }

        const toolTag = fulfillmentInfo.tag;
        let responseData = {};

        switch (toolTag) {
            case 'ConsultarPrecioViaje':
                responseData = await handleConsultarPrecio(sessionInfo.parameters);
                break;

            case 'ConfirmarPagoYAsignarConductor':
                responseData = await handleConfirmarPago(sessionInfo.parameters);
                break;

            default:
                throw new Error(`Tool desconocida: ${toolTag}`);
        }

        const response = {
            sessionInfo: { parameters: { ...responseData } }
        };
        res.status(200).json(response);

    } catch (error) {
        console.error("ERROR FATAL EN EL WEBHOOK:", error);
        res.status(500).json({ error: error.message });
    }
}

// --- Lógica de las Herramientas usando Mongoose ---
async function handleConsultarPrecio(params) {
    await connectToDatabase();
    const { origen, destino, pasajeros } = params;

    const esCarro = pasajeros > 1;
    const PrecioModel = esCarro ? PrecioCarro : PrecioMoto;
    const tipoVehiculo = esCarro ? 'Carro' : 'Moto Taxi';

    const priceData = await PrecioModel.findOne({
        origen: new RegExp(`^${origen}$`, 'i'),
        destino: new RegExp(`^${destino}$`, 'i')
    });

    if (!priceData) {
        const mensajeError = `Lo siento, no tenemos una tarifa definida para la ruta de ${origen} a ${destino}.`;
        return { precioBs: 0, viajeId: "ruta-no-encontrada", error: mensajeError };
    }

    const nuevoViaje = new Viaje({
        solicitud: { origenTexto: origen, destinoTexto: destino, pasajeros },
        cotizacion: { tipoVehiculo, precioBs: priceData.precio },
        estadoGeneral: 'cotizado'
    });

    await nuevoViaje.save();
    
    return {
        precioBs: priceData.precio,
        precioUsd: parseFloat((priceData.precio / 36.5).toFixed(2)),
        tipoVehiculo,
        viajeId: nuevoViaje._id.toString()
    };
}

async function handleConfirmarPago(params) {
    await connectToDatabase();
    const { viajeId, referenciaPago } = params;

    // TODO: Lógica real de validación de pago
    const pagoConfirmado = true;

    if (!pagoConfirmado) {
        return { pagoConfirmado: false, mensajeUsuario: "Hubo un problema al verificar tu pago." };
    }

    const conductor = await Conductor.findOneAndUpdate(
        { estado: 'disponible' },
        { $set: { estado: 'ocupado' } }
    );

    if (!conductor) {
        return { pagoConfirmado: true, mensajeUsuario: "¡Pago confirmado! Todos nuestros conductores están ocupados. Por favor, espera unos minutos." };
    }

    const viajeActualizado = await Viaje.findByIdAndUpdate(viajeId, {
        $set: {
            'pago.referencia': referenciaPago,
            'pago.estadoPago': 'verificado',
            'asignacion.conductorId': conductor._id,
            'asignacion.nombreConductor': conductor.nombre,
            'asignacion.telefonoConductor': conductor.telefono,
            estadoGeneral: 'asignado'
        }
    }, { new: true });

    const mensajeUsuario = `¡Perfecto! El piloto que se te asignó es: ${conductor.nombre}. Teléfono: ${conductor.telefono}. Llegará en unos momentos.`;

    return {
        pagoConfirmado: true,
        nombreConductor: conductor.nombre,
        telefonoConductor: conductor.telefono,
        mensajeUsuario
    };
}
