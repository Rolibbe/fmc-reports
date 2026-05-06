# Publicar en GitHub Pages

## Opcion mas sencilla

1. Crea una cuenta en GitHub si aun no la tienes.
2. Crea un repositorio nuevo, por ejemplo: `inspecciones-gruas`.
3. Sube todos los archivos de esta carpeta al repositorio.
4. En GitHub, entra a `Settings` del repositorio.
5. Abre la seccion `Pages`.
6. En `Build and deployment`, elige:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
7. Guarda los cambios.
8. Espera unos minutos y GitHub te dara una URL parecida a:
   - `https://tuusuario.github.io/inspecciones-gruas/`

## Que archivos debes subir

Sube todo el contenido de la carpeta del proyecto, incluyendo:

- `index.html`
- `app.js`
- `report-generator.js`
- `report-template-config.js`
- `styles.css`
- `manifest.json`
- `sw.js`
- `logo.png`
- `.nojekyll`

## Como editar la plantilla despues

Si luego quieres cambiar logo, revision o nombre de empresa:

1. Abre `report-template-config.js`
2. Haz el cambio
3. Vuelve a subir el archivo a GitHub
4. Espera a que GitHub Pages se actualice

## Ejemplo de configuracion del logo

```js
window.REPORT_TEMPLATE_CONFIG = {
  companyName: "FMC Industrial",
  companySubtitle: "Servicio tecnico especializado",
  logoMode: "image",
  logoText: "FMC",
  logoImageUrl: "logo.png",
  reportTitle: "REPORTE DE SERVICIO",
  reportRevision: "00",
  footerLegend: "Documento generado automaticamente desde la app de inspecciones.",
  accentColor: "#f28c28",
  headerColor: "#1f1f1f"
};
```

## Importante

- No subas solo `index.html`; deben ir todos los archivos.
- Si cambias el logo, usa una ruta relativa como `logo.png` o `assets/logo.png`.
- No uses rutas de Windows como `C:\\Users\\...\\logo.png`.
- Despues de actualizar, en el celular recarga la pagina completamente si no ves los cambios enseguida.
