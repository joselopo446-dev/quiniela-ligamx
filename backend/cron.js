/**
 * Cron Jobs para actualización automática de partidos
 */

const cron = require('node-cron');
const config = require('./config');
const { db, initDatabase } = require('./database');
const footballService = require('./services/footballService');
const twilioService = require('./services/twilioService');
const { calcularGanadores } = require('./services/footballService');

// ==========================================
// CONFIGURACIÓN DE TAREAS CRON
// ==========================================

/**
 * Tarea: Actualizar partidos cada 5 minutos
 * Solo hace fetch si hay partido en vivo
 */
async function tareaActualizarPartidos() {
    try {
        console.log(`[CRON] Verificando actualización de partidos... ${new Date().toISOString()}`);
        
        // Verificar si hay partido en vivo
        const hayEnVivo = await footballService.hayPartidoEnVivo();
        
        if (hayEnVivo) {
            console.log('📺 Partido en vivo detectado, actualizando resultados...');
            await footballService.actualizarPartidosDesdeAPI();
            
            // Obtener partidos actualizados
            const partidos = await footballService.obtenerPartidosCache();
            const enVivo = partidos.filter(p => p.estado === 'live');
            
            if (enVivo.length > 0) {
                console.log(`✅ Resultados actualizados. Partidos en vivo: ${enVivo.length}`);
                
                // Log de los resultados actuales
                enVivo.forEach(p => {
                    console.log(`   ${p.equipo_local} ${p.goles_local} - ${p.goles_visitante} ${p.equipo_visitante} (${p.minuto_juego})`);
                });
            }
        } else {
            console.log('ℹ️ No hay partidos en vivo, omitiendo actualización');
        }
        
    } catch (error) {
        console.error('❌ Error en tarea de actualización:', error.message);
    }
}

/**
 * Tarea: Verificar fin de jornada cada 10 minutos
 * Calcula ganadores cuando todos los partidos terminan
 */
async function tareaVerificarFinJornada() {
    try {
        console.log(`[CRON] Verificando fin de jornada... ${new Date().toISOString()}`);
        
        // Obtener partidos de la jornada actual
        const partidos = await footballService.obtenerPartidosCache();
        
        if (partidos.length === 0) {
            console.log('ℹ️ No hay partidos registrados');
            return;
        }
        
        // Verificar si todos están finalizados
        const todosFinalizados = partidos.every(p => p.estado === 'finished');
        const hayEnVivo = partidos.some(p => p.estado === 'live');
        
        if (todosFinalizados) {
            console.log('🏁 Todos los partidos finalizados. Calculando ganadores...');
            
            const resultado = await calcularGanadores();
            
            if (resultado.success) {
                console.log(`✅ Ganadores calculados:`);
                console.log(`   - Puntos para ganar: ${resultado.maxAciertos}`);
                console.log(`   - Número de ganadores: ${resultado.numGanadores}`);
                console.log(`   - Premio por ganador: $${resultado.premioPorGanador.toLocaleString('es-MX')} MXN`);
                
                // Notificar ganadores
                for (const gan of resultado.ganadores) {
                    const [ganadorData] = await db.query(
                        `SELECT g.*, q.whatsapp, q.nombre_completo 
                         FROM ganadores g
                         JOIN quinielas q ON g.quiniela_id = q.quiniela_id
                         WHERE g.quiniela_id = ?`,
                        [gan.quiniela_id]
                    );
                    
                    if (ganadorData.length > 0) {
                        await twilioService.notificarGanador(ganadorData[0]);
                        await twilioService.notificarAdminNuevoGanador(ganadorData[0]);
                    }
                }
                
            } else {
                console.log(`⚠️ ${resultado.message}`);
            }
        } else if (hayEnVivo) {
            const enVivo = partidos.filter(p => p.estado === 'live');
            console.log(`📺 Partidos en curso: ${enVivo.length}`);
        } else {
            const pendientes = partidos.filter(p => p.estado === 'scheduled');
            console.log(`⏳ Partidos pendientes: ${pendientes.length}`);
        }
        
    } catch (error) {
        console.error('❌ Error verificando fin de jornada:', error.message);
    }
}

/**
 * Tarea: Actualizar acumulados cada 30 minutos
 * Sincroniza el acumulado con la base de datos
 */
async function tareaSincronizarAcumulado() {
    try {
        const temporada = footballService.obtenerTemporadaActual();
        
        const [acum] = await db.query(
            `SELECT SUM(amount_prize) as total, COUNT(*) as num_quinielas
             FROM pagos p
             JOIN quinielas q ON p.quiniela_id = q.quiniela_id
             WHERE q.temporada = ? AND p.status = 'succeeded'`,
            [temporada.nombre]
        );
        
        if (acum && acum[0]) {
            const monto = parseFloat(acum[0].total) || 0;
            const numQuinielas = parseInt(acum[0].num_quinielas) || 0;
            
            await db.query(
                `UPDATE acumulados SET monto_premio = ?, num_quinielas = ? 
                 WHERE temporada = ? ORDER BY id DESC LIMIT 1`,
                [monto, numQuinielas, temporada.nombre]
            );
            
            console.log(`💰 Acumulado sincronizado: $${monto.toLocaleString('es-MX')} MXN (${numQuinielas} quinielas)`);
        }
        
    } catch (error) {
        console.error('❌ Error sincronizando acumulado:', error.message);
    }
}

/**
 * Tarea: Verificar cierre de inscripciones
 * Cada 5 minutos verifica si es hora de cerrar
 */
async function tareaVerificarCierre() {
    try {
        const [partidos] = await db.query(
            `SELECT fecha_hora FROM partidos 
             WHERE estado = 'scheduled' AND fecha_hora > NOW()
             ORDER BY fecha_hora ASC LIMIT 1`
        );
        
        if (partidos.length === 0) return;
        
        const primerPartido = new Date(partidos[0].fecha_hora);
        const ahora = new Date();
        const horaCierre = new Date(primerPartido.getTime() - (config.QUINIELA.horaCierreMinutos * 60 * 1000));
        
        // Si estamos dentro de la ventana de cierre (últimos 5 minutos antes del cierre)
        if (ahora >= horaCierre && ahora < primerPartido) {
            const minutosRestantes = Math.round((primerPartido - ahora) / (60 * 1000));
            
            console.log(`⚠️ CIERRE DE INSCRIPCIONES en ${minutosRestantes} minutos`);
            
            // Actualizar estado de abierto
            await db.query(
                `UPDATE acumulados SET abierto = FALSE WHERE abierto = TRUE`
            );
        }
        
    } catch (error) {
        console.error('❌ Error verificando cierre:', error.message);
    }
}

/**
 * Tarea: Nueva jornada (cada 15 minutos)
 * Verifica si todos los partidos terminaron y pasó 1 hora
 * Si sí, genera nueva jornada con nuevos partidos
 */
async function tareaNuevaJornada() {
    try {
        console.log(`[CRON] Verificando nueva jornada... ${new Date().toISOString()}`);
        
        const temporada = footballService.obtenerTemporadaActual();
        
        // Obtener partidos de la jornada actual
        const [partidos] = await db.query(
            `SELECT * FROM partidos WHERE temporada = ? ORDER BY fecha_hora DESC LIMIT 1`,
            [temporada.nombre]
        );
        
        if (partidos.length === 0) {
            console.log('ℹ️ No hay partidos para verificar');
            return;
        }
        
        const ultimoPartido = partidos[0];
        
        // Verificar si el último partido ya terminó
        if (ultimoPartido.estado !== 'finished') {
            console.log(`⏳ Último partido aún no termina: ${ultimoPartido.equipo_local} vs ${ultimoPartido.equipo_visitante}`);
            return;
        }
        
        // Calcular hace cuánto terminó
        const fechaFin = new Date(ultimoPartido.fecha_hora);
        // Para finished, usar la fecha actual como referencia
        const ahora = new Date();
        const horaTermino = new Date(ahora); // El partido terminó en algún momento
        
        // Verificar si ya pasó 1 hora desde que se marcó como terminado
        // Usamos una marca de tiempo en la tabla para esto
        const [marcas] = await db.query(
            `SELECT * FROM marcas_tiempo WHERE tipo = 'fin_jornada' AND temporada = ? ORDER BY id DESC LIMIT 1`,
            [temporada.nombre]
        );
        
        if (marcas.length === 0) {
            // Primera vez que detectamos que terminó, registrar marca
            await db.query(
                `INSERT INTO marcas_tiempo (tipo, temporada, fecha) VALUES ('fin_jornada', ?, NOW())`,
                [temporada.nombre]
            );
            console.log('🏁 Jornada terminada. Esperando 1 hora para nueva jornada...');
            return;
        }
        
        const tiempoPasado = (ahora - new Date(marcas[0].fecha)) / (1000 * 60 * 60); // horas
        
        if (tiempoPasado < 1) {
            console.log(`⏰ Esperando ${(1 - tiempoPasado).toFixed(1)} horas para nueva jornada...`);
            return;
        }
        
        // Ya pasó 1 hora, crear nueva jornada
        console.log('🚀 Creando nueva jornada...');
        
        // Obtener siguiente número de jornada
        const [maxJornada] = await db.query(
            `SELECT MAX(jornada) as maxj FROM partidos WHERE temporada = ?`,
            [temporada.nombre]
        );
        const sigJornada = (maxJornada[0].maxj || 0) + 1;
        
        // Crear nuevo acumulado
        await db.query(
            `INSERT INTO acumulados (temporada, jornada, monto_premio, monto_admin, num_quinielas, abierto) 
             VALUES (?, ?, 0, 0, 0, TRUE)`,
            [temporada.nombre, sigJornada]
        );
        
        // Limpiar marca de tiempo
        await db.query(
            `DELETE FROM marcas_tiempo WHERE tipo = 'fin_jornada' AND temporada = ?`,
            [temporada.nombre]
        );
        
        // Intentar obtener nuevos partidos de la API
        if (config.FOOTBALL_API.key) {
            try {
                await footballService.actualizarPartidosDesdeAPI();
                const nuevosPartidos = await footballService.obtenerPartidosCache();
                console.log(`✅ ${nuevosPartidos.length} nuevos partidos cargados para jornada ${sigJornada}`);
            } catch (e) {
                console.log('⚠️ No se pudieron cargar partidos de API:', e.message);
                // Crear partidos demo para siguiente jornada
                await crearPartidosDemo(sigJornada, temporada.nombre);
            }
        } else {
            // Crear partidos demo
            await crearPartidosDemo(sigJornada, temporada.nombre);
        }
        
        console.log(`✅ Nueva jornada ${sigJornada} iniciada!`);
        
    } catch (error) {
        console.error('❌ Error creando nueva jornada:', error.message);
    }
}

/**
 * Crea partidos demo para pruebas
 */
async function crearPartidosDemo(jornada, temporada) {
    const equipos = [
        'Club América', 'Guadalajara', 'Tigres UANL', 'CF Monterrey',
        'Deportivo Toluca FC', 'Cruz Azul', 'Pumas UNAM', 'Santos Laguna',
        'Club León', 'Atlas FC', 'Club Necaxa', 'C.F. Pachuca',
        'Mazatlán FC', 'Querétaro FC', 'Club Tijuana', 'FC Juárez',
        'Atlético de San Luis', 'Puebla FC'
    ];
    
    // Obtener fecha del próximo sábado
    const hoy = new Date();
    const diasSigSabado = (6 - hoy.getDay() + 7) % 7 || 7;
    const sabado = new Date(hoy);
    sabado.setDate(hoy.getDate() + diasSigSabado);
    
    const horarios = [19, 21, 21, 19, 21, 19, 21, 19, 21];
    const shuffle = [...equipos].sort(() => Math.random() - 0.5);
    
    for (let i = 0; i < 9; i++) {
        const fecha = new Date(sabado);
        fecha.setDate(sabado.getDate() + (i < 3 ? 0 : i < 5 ? 1 : 2));
        fecha.setHours(horarios[i], 0, 0, 0);
        
        await db.query(
            `INSERT INTO partidos (api_fixture_id, temporada, jornada, equipo_local, equipo_visitante, fecha_hora, estado)
             VALUES (?, ?, ?, ?, ?, ?, 'scheduled')`,
            [-(jornada * 100 + i), temporada, jornada, shuffle[i], shuffle[i + 9], fecha.toISOString().slice(0, 19).replace('T', ' ')]
        );
    }
    
    console.log(`✅ 9 partidos demo creados para jornada ${jornada}`);
}

// ==========================================
// INICIALIZACIÓN DE CRON JOBS
// ==========================================

async function iniciarCronJobs() {
    console.log('\n📅 Iniciando Cron Jobs...');
    
    // Crear tabla de marcas de tiempo si no existe
    try {
        await db.query(
            `CREATE TABLE IF NOT EXISTS marcas_tiempo (
                id INT AUTO_INCREMENT PRIMARY KEY,
                tipo VARCHAR(50) NOT NULL,
                temporada VARCHAR(100) NOT NULL,
                fecha DATETIME NOT NULL,
                INDEX idx_tipo_temporada (tipo, temporada)
            )`
        );
    } catch (e) {
        console.log('ℹ️ Tabla marcas_tiempo ya existe o error:', e.message);
    }
    
    // Solo iniciar si tenemos la API key de football
    if (!config.FOOTBALL_API.key) {
        console.log('⚠️ FOOTBALL_API_KEY no configurada. Cron de partidos deshabilitado.');
    } else {
        // Actualizar partidos cada 15 minutos (96 requests/día - dentro del límite)
        cron.schedule('*/15 * * * *', tareaActualizarPartidos, {
            scheduled: true,
            timezone: 'America/Mexico_City'
        });
        console.log('✅ Cron: Actualizar partidos cada 15 minutos (~96/día)');
    }
    
    // Verificar fin de jornada cada 30 minutos
    cron.schedule('*/30 * * * *', tareaVerificarFinJornada, {
        scheduled: true,
        timezone: 'America/Mexico_City'
    });
    console.log('✅ Cron: Verificar fin de jornada cada 30 minutos');
    
    // Sincronizar acumulado cada 30 minutos
    cron.schedule('*/30 * * * *', tareaSincronizarAcumulado, {
        scheduled: true,
        timezone: 'America/Mexico_City'
    });
    console.log('✅ Cron: Sincronizar acumulado cada 30 minutos');
    
    // Verificar cierre cada 5 minutos
    cron.schedule('*/5 * * * *', tareaVerificarCierre, {
        scheduled: true,  
        timezone: 'America/Mexico_City'
    });
    console.log('✅ Cron: Verificar cierre de inscripciones cada 5 minutos');
    
    // Nueva jornada cada 15 minutos
    cron.schedule('*/15 * * * *', tareaNuevaJornada, {
        scheduled: true,
        timezone: 'America/Mexico_City'
    });
    console.log('✅ Cron: Verificar nueva jornada cada 15 minutos');
    
    console.log('📅 Cron Jobs iniciados\n');
}

// ==========================================
// EJECUCIÓN DIRECTA (para testing)
// ==========================================

async function ejecutarManualmente(tarea) {
    console.log(`\n🔧 Ejecutando tarea manualmente: ${tarea}\n`);
    
    switch (tarea) {
        case 'partidos':
            await tareaActualizarPartidos();
            break;
        case 'ganadores':
            await tareaVerificarFinJornada();
            break;
        case 'acumulado':
            await tareaSincronizarAcumulado();
            break;
        case 'cierre':
            await tareaVerificarCierre();
            break;
        case 'todos':
            await tareaActualizarPartidos();
            await tareaVerificarFinJornada();
            await tareaSincronizarAcumulado();
            await tareaVerificarCierre();
            break;
        default:
            console.log('Tareas disponibles: partidos, ganadores, acumulado, cierre, todos');
    }
    
    console.log('\n✅ Tarea completada');
    process.exit(0);
}

// Si se ejecuta directamente
if (require.main === module) {
    const tarea = process.argv[2] || 'todos';
    initDatabase()
        .then(() => ejecutarManualmente(tarea))
        .catch(err => {
            console.error('❌ Error:', err);
            process.exit(1);
        });
}

module.exports = {
    iniciarCronJobs,
    tareaActualizarPartidos,
    tareaVerificarFinJornada,
    tareaSincronizarAcumulado,
    tareaVerificarCierre,
    tareaNuevaJornada,
    crearPartidosDemo
};
