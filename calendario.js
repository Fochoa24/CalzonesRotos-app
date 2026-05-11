/**
 * CALENDARIO DE HORNEADAS
 * ────────────────────────
 * Horneada 1: inscripciones Lunes-Martes → hornea Miércoles AM → entrega Miércoles desde 14:00
 * Horneada 2: inscripciones Jueves-Viernes → hornea Sábado AM  → entrega Sábado desde 14:00
 * Domingo: cerrado
 *
 * Si al cierre (martes 23:59 / viernes 23:59) no se completaron los 6 cupos
 * la horneada se CANCELA y se avisa a los clientes inscritos.
 */

// 0=Dom 1=Lun 2=Mar 3=Mié 4=Jue 5=Vie 6=Sáb
const HORNEADA_1 = { inscripcion: [1, 2], hornea: 3, entrega: 3, nombre: 'Horneada 1 (miércoles)' };
const HORNEADA_2 = { inscripcion: [4, 5], hornea: 6, entrega: 6, nombre: 'Horneada 2 (sábado)' };
const HORA_ENTREGA = 14; // 14:00 hrs

/**
 * Retorna el estado completo del sistema según el momento actual.
 * Se puede pasar una fecha falsa para testing.
 *
 * @param {Date} ahora
 * @returns {Object} estado
 */
function obtenerEstado(ahora = new Date()) {
  const dia  = ahora.getDay();  // 0-6
  const hora = ahora.getHours();

  // Determinar qué horneada aplica hoy
  let horneada = null;
  if (HORNEADA_1.inscripcion.includes(dia) || dia === HORNEADA_1.hornea) horneada = HORNEADA_1;
  else if (HORNEADA_2.inscripcion.includes(dia) || dia === HORNEADA_2.hornea)  horneada = HORNEADA_2;

  // ── DOMINGO ─────────────────────────────────────────────────────────────
  if (dia === 0) {
    return {
      fase: 'cerrado',
      horneadaActual: null,
      inscripcionAbierta: false,
      mensaje: 'Hoy no hay horneada. Las inscripciones abren el lunes.',
      proximaApertura: 'Lunes',
    };
  }

  // ── DÍAS DE INSCRIPCIÓN ─────────────────────────────────────────────────
  if (horneada && horneada.inscripcion.includes(dia)) {
    const esCierre = dia === horneada.inscripcion[horneada.inscripcion.length - 1];
    const diaEntrega = horneada === HORNEADA_1 ? 'miércoles' : 'sábado';
    return {
      fase: 'inscripcion',
      horneadaActual: horneada.nombre,
      inscripcionAbierta: true,
      esCierre,      // true si es el último día de inscripción (mar / vie)
      mensaje: `Inscripciones abiertas. Entrega el ${diaEntrega} desde las 14:00.`,
      diaEntrega,
      proximoHornear: horneada === HORNEADA_1 ? 'miércoles' : 'sábado',
    };
  }

  // ── DÍA DE HORNEAR / ENTREGA ────────────────────────────────────────────
  if (horneada && dia === horneada.hornea) {
    if (hora < HORA_ENTREGA) {
      return {
        fase: 'horneando',
        horneadaActual: horneada.nombre,
        inscripcionAbierta: false,
        mensaje: 'Las inscripciones están cerradas. ¡Los calzones están en el horno! Entrega desde las 14:00.',
      };
    } else {
      return {
        fase: 'entregando',
        horneadaActual: horneada.nombre,
        inscripcionAbierta: false,
        mensaje: 'Entrega en curso. Tus calzones están en camino 🛵',
      };
    }
  }

  // Fallback (no debería llegar aquí)
  return { fase: 'cerrado', inscripcionAbierta: false, mensaje: 'No hay horneada activa.' };
}

/**
 * Retorna un texto amigable del próximo evento para mostrar al cliente.
 */
function proximoEvento(ahora = new Date()) {
  const dia = ahora.getDay();
  const mapa = {
    0: 'Inscripciones abren el lunes',
    1: 'Cierre de inscripciones: mañana martes a las 23:59',
    2: 'Último día para inscribirse. ¡Apúrate!',
    3: '¿Te lo perdiste? Inscripciones abren el jueves',
    4: 'Cierre de inscripciones: mañana viernes a las 23:59',
    5: 'Último día para inscribirse. ¡Apúrate!',
    6: '¿Te lo perdiste? Inscripciones abren el lunes',
  };
  return mapa[dia] || '';
}

/**
 * ¿Es momento de cerrar inscripciones y evaluar si la horneada se realiza?
 * Martes 23:45 o Viernes 23:45 → el cron lo llama para verificar cupos.
 */
function esHoraCierre(ahora = new Date()) {
  const dia  = ahora.getDay();
  const hora = ahora.getHours();
  const min  = ahora.getMinutes();
  const esDiaCierre = dia === 2 || dia === 5; // Martes o Viernes
  return esDiaCierre && hora === 23 && min >= 45;
}

module.exports = { obtenerEstado, proximoEvento, esHoraCierre, HORA_ENTREGA };
