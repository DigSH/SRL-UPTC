# Herramienta de diagnóstico SRL y valoración HELIX (SocialTech) — UPTC

- **Aplicación publicada**: [https://digsh.github.io/SRL-UPTC/](https://digsh.github.io/SRL-UPTC/)
- **Repositorio oficial**: `https://github.com/DigSH/SRL-UPTC.git`

Versión web institucional de **SocialTech (SRL-UPTC)**, que integra:
1. **Diagnóstico del Nivel de Preparación Social (SRL 1 a 9)**, basado en la escala *Societal Readiness Level* de Innovation Fund Denmark.
2. **Valoración de Innovación Social Aplicada (HELIX)**, basada en la metodología HELIX promovida por el Observatorio de la Realidad Social del Gobierno de Navarra y Humani.

Es un sitio estático sin dependencias externas, sin servidor y sin base de datos: **ninguna respuesta sale del navegador** de la persona que responde (todo se guarda en `localStorage`).

## Qué hace

### Módulo 1 — Nivel de Preparación Social (SRL 1–9)
- **Cuestionario de 45 preguntas** organizadas en los 9 niveles SRL (5 preguntas por nivel), con escala de tres opciones: **Sí** (2 pts), **Parcialmente** (1 pto) y **No** (0 pts).
- **Cálculo automático del nivel SRL** (1–9): cada nivel suma hasta 10 puntos y se consolida al alcanzar al menos **7 puntos (70 %)**.
- **Ruta de maduración hasta SRL 9**: señala el **cuello de botella** (el nivel más bajo sin consolidar), cuántos puntos faltan para superar su umbral y lista las acciones concretas asociadas a cada pregunta respondida con «No» o «Parcialmente».

### Módulo 2 — Valoración de Innovación Social (HELIX)
- **5 vectores de innovación social**: *Innovación, Impacto, Cambio sistémico, Participación y Consistencia*.
- **Cuatro vías de ponderación** idénticas al libro original (`ponderacion`):
  1. **Estándar**: pesos por defecto (`[5, 5, 7, 5, 6]`).
  2. **Ámbito predeterminado**: 19 ámbitos temáticos (inclusión social, educación, salud, desarrollo rural, emprendimiento social, sostenibilidad, etc.).
  3. **Selección de preferencias**: 8 ejes transversales valorados de *Crucial* ($\times 2,0$) a *Irrelevante* ($\times 0,2$).
  4. **Personalización total**: edición directa de los 55 pesos (5 vectores y 50 elementos).
- **Dos modalidades de evaluación**:
  - **Valoración rápida**: calificación directa de 0 a 10 de los 5 vectores.
  - **Valoración completa**: calificación de los **50 atributos** (10 por vector) mediante rúbrica de 5 frases descriptivas ($100\,\%, 75\,\%, 50\,\%, 25\,\%, 0\,\%$) más opción «No aplica» (que reajusta proporcionalmente el peso de los demás elementos del vector) y explicación metodológica desplegable.
- **Visualizaciones en SVG nativo con interpretación automática en tiempo real**:
  - **Perfil radial pentagonal** de los 5 vectores (0–10), acompañado de **interpretación automática** que evalúa el tramo de madurez global, la simetría/asimetría geométrica del pentágono, la interacción con el peso estratégico activo y el vector con mayor palanca de mejora global.
  - **Mapa de atributos en 4 cuadrantes** (Valoración obtenida vs. Importancia relativa en base 10): clasifica automáticamente los atributos en *Fortalezas clave*, *Áreas de mejora prioritarias*, *Fortalezas secundarias* y *Debilidades secundarias*, e incluye **interpretación automática** con la distribución porcentual en cuadrantes, las 3 prioridades críticas del cuadrante superior izquierdo con su meta concreta de la rúbrica HELIX y los 3 activos diferenciales del cuadrante superior derecho.
- **Glosario integrado** con resaltado automático en las preguntas, **exportación/importación en JSON** e **informes en PDF A4** con membrete oficial de la UPTC / Vicerrectoría de Investigación y Extensión.

## Estructura

```
index.html            Interfaz completa (una sola página, navegación por pestañas)
assets/styles.css     Estilos, tema claro/oscuro y hoja de impresión A4
assets/app.js         Estado, motor de cálculo SRL y HELIX, gráficos SVG, import/export
assets/data.js        Datos generados desde Nivel SRL.html y HELIX .xlsm — no editar a mano
assets/brand/         Originales institucionales tal como se entregaron
assets/img/           Recursos de marca listos para web — generados, no editar a mano
tools/build_data.py   Regenera assets/data.js a partir de Nivel SRL.html y del libro .xlsm
tools/build_brand.py  Regenera assets/img/ a partir de assets/brand/
tools/verify.js       Comprueba que los cálculos coinciden con las fórmulas originales
```

## Desarrollo

Para ejecutar localmente:

```bash
python -m http.server 8000
# abrir http://localhost:8000
```

Si cambian las fuentes originales, regenere los datos y ejecute la batería de verificación:

```bash
pip install openpyxl Pillow
python tools/build_data.py
python tools/build_brand.py
node tools/verify.js
```

## Créditos

Universidad Pedagógica y Tecnológica de Colombia — Vicerrectoría de Investigación y Extensión, Dirección de Investigaciones (DIN), OCITEB y Oficina de Transferencia de Resultados de Investigación (OTRI).
