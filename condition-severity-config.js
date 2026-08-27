// condition-severity-config.js
// Niveles de condicion del equipo y gravedad de cada punto del checklist.
// Editable: si cambia el criterio, ajusta las listas de abajo.

window.CONDITION_LEVELS = [
  {
    id: "satisfactorio",
    label: "Satisfactorio",
    description: "Cumple, sin observaciones",
    tone: "ok",
    className: "condition-ok",
    legacy: ["bueno", "buena", "ok", "satisfactorio"]
  },
  {
    id: "atencion",
    label: "Requiere atención",
    description: "Deficiencia menor, no representa riesgo inmediato",
    tone: "warning",
    className: "condition-warning",
    legacy: ["regular", "atencion", "requiere atencion", "requiere atención"]
  },
  {
    id: "critico",
    label: "Crítico / No conforme",
    description: "Representa riesgo y requiere corrección inmediata",
    tone: "danger",
    className: "condition-danger",
    legacy: ["malo", "mala", "critico", "crítico", "no conforme", "critico / no conforme", "crítico / no conforme"]
  }
];

// Gravedad de los 116 puntos del checklist.
//
// Criterio aplicado (NOM-006-STPS-2023, ASME B30.2 / B30.10, OSHA 1910.179, CMAA 70):
// se marca CRITICO cuando el punto pertenece a la trayectoria de la carga, al
// sistema de frenado, a un dispositivo de limite o sobrecarga, al paro de
// emergencia, a la estructura principal, o expone partes electricas vivas.
// Todo lo demas (lubricacion, etiquetas, registros, guardas, cubiertas,
// reductores de traslacion, accesorios de senalizacion) se considera una
// deficiencia menor que no representa riesgo inmediato.
window.FINDING_SEVERITY_CONFIG = {
  critical: [
    // Aparejo inferior: gancho, pernos y tornilleria de la trayectoria de carga
    4, 5, 7, 8, 10, 11,
    // Cable de carga
    13, 14, 16, 17, 18, 19,
    // Cadena de carga
    20, 21, 23, 24, 25,
    // Aparejo superior
    27, 28, 29, 31, 32,
    // Carro: freno, limites, riel, topes, ruedas, flechas y tornilleria
    33, 38, 39, 40, 41, 42, 46, 47, 48,
    // Izaje mecanico: tambor, poleas, guia, soldadura, baleros, freno
    49, 50, 51, 53, 54, 55, 56, 57, 58,
    // Izaje electrico: freno, gabinete, limites y sobrecarga
    59, 64, 65, 66,
    // Puente mecanico: riel, topes, ruedas, flechas, freno, tornilleria, endtrucks
    67, 68, 69, 70, 74, 75, 76, 78,
    // Puente electrico: freno, limites y gabinete
    79, 84, 85,
    // Festoon: conductores de fuerza y gabinetes de interconexion
    92, 94,
    // Mando: radiocontrol, paro de emergencia, cable de tension y botones
    99, 100, 101, 102,
    // Alimentacion electrica: interruptor y bus
    104, 105,
    // Estructura completa
    110, 111, 112, 113, 114, 115, 116
  ]
};
