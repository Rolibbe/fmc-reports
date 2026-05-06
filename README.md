# Inspecciones de Gruas Offline

Aplicacion web progresiva (PWA) para capturar inspecciones de gruas en sitio, guardar reportes localmente y generar una salida imprimible desde celular, tableta o escritorio.

## Lo que ya hace esta version

- Funciona como app web instalable.
- Guarda inspecciones en el dispositivo usando IndexedDB.
- Captura datos del cliente, caracteristicas de la grua y normas aplicables.
- Permite agregar hallazgos con categoria, incidencia, descripcion y evidencia fotografica.
- Captura firma del responsable en sitio.
- Genera un reporte formal listo para imprimir o guardar como PDF.
- Permite definir manualmente el numero de reporte.

## Archivo para personalizar la plantilla del PDF

Puedes editar la apariencia general del reporte sin tocar la logica de la app en:

- `report-template-config.js`

Ahi puedes cambiar, por ejemplo:

- `companyName`
- `companySubtitle`
- `logoMode` (`text` o `image`)
- `logoText`
- `logoImageUrl`
- `reportTitle`
- `reportRevision`
- `footerLegend`
- `accentColor`
- `headerColor`

### Ejemplo para usar un logotipo real

1. Coloca tu archivo de logo dentro del proyecto, por ejemplo: `assets/logo.png`
2. En `report-template-config.js` usa:

```js
logoMode: "image",
logoImageUrl: "assets/logo.png"
```

Importante:

- Usa rutas relativas como `logo.png` o `assets/logo.png`.
- No uses rutas completas de Windows como `C:\Users\...\logo.png`, porque eso rompe el archivo `.js` y hace que la app deje de responder.

## Archivo para personalizar los menus de hallazgos

Puedes cambiar las categorias y las incidencias del formulario `Anadir Hallazgo` en:

- `finding-catalog-config.js`

La estructura es esta:

```js
window.FINDING_CATALOG_CONFIG = {
  Estructural: [
    "Deformacion en viga o estructura",
    "Grieta en soldadura o union"
  ],
  Mecanica: [
    "Desgaste en cable o cadena",
    "Falla en freno"
  ]
};
```

### Como editarlo

- Cada palabra principal de la izquierda, como `Estructural` o `Mecanica`, es una categoria.
- Cada lista entre corchetes `[]` son las opciones que apareceran en el segundo menu.
- Si agregas una nueva categoria, aparecera automaticamente en el primer menu.
- Si agregas o quitas incidencias dentro de una categoria, cambiaran automaticamente las opciones del segundo menu.

### Ejemplo de nueva categoria

```js
window.FINDING_CATALOG_CONFIG = {
  Estructural: [
    "Deformacion en viga o estructura"
  ],
  Pintura: [
    "Desprendimiento de pintura",
    "Corrosion superficial",
    "Recubrimiento deteriorado"
  ]
};
```

## Como usarla localmente

Como es una PWA, conviene abrirla desde un servidor local sencillo. Si la abres directamente como archivo local, las funciones principales tambien deben seguir operando, pero para cache offline es mejor usar un servidor estatico.

## Flujo sugerido en campo

1. El tecnico crea una nueva inspeccion.
2. Define o captura el numero de reporte.
3. Llena datos de planta y grua.
4. Registra hallazgos y evidencia fotografica.
5. Captura firma del responsable.
6. Guarda y genera el PDF.

## Siguientes pasos recomendados

- Ajustar la plantilla para replicar aun mas el formato corporativo real.
- Agregar logo real e informacion fiscal de la empresa.
- Generar PDF descargable sin depender del dialogo de impresion.
- Sincronizar con una base central cuando haya internet.
- Manejar usuarios, roles y consecutivos de reporte.
