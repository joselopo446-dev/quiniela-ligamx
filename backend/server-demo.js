/**
 * SERVIDOR DE PRUEBA - Sin MySQL
 * Usa datos en memoria para demostración
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = 3000;

// MIDDLEWARES
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: '*' }));
app.use(express.json());

// Rate limiting
app.use('/api', rateLimit({
    windowMs: 60000,
    max: 100,
    message: { success: false, message: 'Demasiadas solicitudes' }
}));

// ==========================================
// DATOS EN MEMORIA
// ==========================================

const datos = {
    acumulados: [{
        monto_premio: 12450,
        monto_admin: 650,
        num_quinielas: 156,
        temporada: 'Clausura 2026',
        jornada: 12,
        abierto: true
    }],
    
    secuenciaId: 342,
    
    partidos: [
        { id: 1, equipo_local: 'Club América', equipo_visitante: 'Guadalajara', fecha_hora: '2026-03-28T01:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 2, equipo_local: 'Tigres UANL', equipo_visitante: 'CF Monterrey', fecha_hora: '2026-03-28T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 3, equipo_local: 'Deportivo Toluca FC', equipo_visitante: 'Cruz Azul', fecha_hora: '2026-03-28T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 4, equipo_local: 'Club León', equipo_visitante: 'Pumas UNAM', fecha_hora: '2026-03-28T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 5, equipo_local: 'Atlas FC', equipo_visitante: 'Santos Laguna', fecha_hora: '2026-03-29T01:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 6, equipo_local: 'Club Necaxa', equipo_visitante: 'FC Juárez', fecha_hora: '2026-03-29T01:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 7, equipo_local: 'C.F. Pachuca', equipo_visitante: 'Club Tijuana', fecha_hora: '2026-03-29T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 8, equipo_local: 'Mazatlán FC', equipo_visitante: 'Querétaro FC', fecha_hora: '2026-03-29T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' },
        { id: 9, equipo_local: 'Atlético de San Luis', equipo_visitante: 'Puebla FC', fecha_hora: '2026-03-29T03:00:00Z', estado: 'scheduled', goles_local: null, goles_visitante: null, jornada: 12, temporada: 'Clausura 2026' }
    ],
    
    quinielas: [],
    pronosticos: [],
    ganadores: []
};

// ==========================================
// RUTAS
// ==========================================

// Partidos
app.get('/api/partidos/jornada-actual', (req, res) => {
    const ahora = new Date();
    const hayEnVivo = datos.partidos.some(p => p.estado === 'live');
    const todosFinalizados = datos.partidos.every(p => p.estado === 'finished');
    
    let estado = 'abierto';
    if (hayEnVivo) estado = 'en_vivo';
    else if (todosFinalizados) estado = 'finalizado';
    
    const primerPartido = new Date(datos.partidos[0].fecha_hora);
    const horaCierre = new Date(primerPartido.getTime() - (60 * 60 * 1000));
    const puedePagar = ahora < horaCierre;
    
    res.json({
        success: true,
        jornada: {
            numero: 12,
            temporada: 'Clausura 2026',
            estado: puedePagar ? estado : 'cerrado',
            puedePagar
        },
        partidos: datos.partidos
    });
});

// Acumulado
app.get('/api/info/acumulado', (req, res) => {
    const acum = datos.acumulados[0];
    res.json({
        success: true,
        monto: acum.monto_premio,
        montoAdmin: acum.monto_admin,
        participantes: acum.num_quinielas,
        jornada: acum.jornada,
        temporada: acum.temporada,
        abierto: acum.abierto
    });
});

// Reglamento
app.get('/api/info/reglamento', (req, res) => {
    res.json({
        success: true,
        reglamento: {
            costo: 20,
            premioPorQuiniela: 19,
            gananciaAdmin: 1,
            partidos: 9,
            cierre: '1 hora antes del primer partido'
        }
    });
});

// Clasificación
app.get('/api/info/clasificacion', (req, res) => {
    res.json({
        success: true,
        activa: false,
        ganadores: datos.ganadores
    });
});

// Contacto
app.post('/api/info/contacto', (req, res) => {
    console.log('Mensaje de contacto:', req.body);
    res.json({ success: true, message: 'Mensaje recibido' });
});

// Crear sesión de pago
app.post('/api/pagos/crear-sesion', (req, res) => {
    const { pronosticos, nombre, whatsapp } = req.body;
    
    if (!pronosticos || Object.keys(pronosticos).length !== 9) {
        return res.status(400).json({ success: false, message: 'Selecciona 9 pronósticos' });
    }
    
    if (!nombre || nombre.length < 3) {
        return res.status(400).json({ success: false, message: 'Nombre inválido' });
    }
    
    if (!whatsapp || !/^[0-9]{10,15}$/.test(whatsapp)) {
        return res.status(400).json({ success: false, message: 'WhatsApp inválido' });
    }
    
    // Generar ID
    datos.secuenciaId++;
    const quinielaId = `QL-2026-${String(datos.secuenciaId).padStart(4, '0')}`;
    
    // Guardar quiniela
    const quiniela = {
        quiniela_id: quinielaId,
        nombre_completo: nombre,
        whatsapp: whatsapp,
        pronosticos: pronosticos,
        pagada: true,
        created_at: new Date()
    };
    datos.quinielas.push(quiniela);
    
    // Actualizar acumulado
    datos.acumulados[0].monto_premio += 19;
    datos.acumulados[0].monto_admin += 1;
    datos.acumulados[0].num_quinielas++;
    
    console.log(`✅ Nueva quiniela: ${quinielaId} - ${nombre}`);
    
    // En modo demo, redirigir directamente a éxito
    res.json({
        success: true,
        sessionId: quinielaId,
        sessionUrl: `http://localhost:8080/index.html?success=true&quiniela_id=${quinielaId}`
    });
});

// Webhook (demo)
app.post('/api/webhooks/stripe', (req, res) => {
    console.log('Webhook recibido (demo):', req.body.type || 'checkout.session.completed');
    res.json({ received: true });
});

// Admin: Ver quinielas
app.get('/api/admin/quinielas', (req, res) => {
    res.json({ success: true, quinielas: datos.quinielas });
});

// ==========================================
// INICIO
// ==========================================

app.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════╗
║     QUINIELA LIGA MX - BACKEND (DEMO)         ║
╠═══════════════════════════════════════════════╣
║  Puerto: ${PORT}                                  
║  Modo: Sin base de datos (demo)               
║  Frontend: http://localhost:5500              
╚═══════════════════════════════════════════════╝
    `);
});
