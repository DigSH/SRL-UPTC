/* Comprueba que los datos y la lógica de cálculo de SRL-UPTC (SocialTech)
   coinciden al 100 % con Nivel SRL.html y con el libro Excel de HELIX.
   Uso:  node tools/verify.js                                              */

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
global.window = {};
new Function(fs.readFileSync(path.join(root, 'assets', 'data.js'), 'utf8')).call(global);
new Function(fs.readFileSync(path.join(root, 'assets', 'app.js'), 'utf8')).call(global);

const DATA = global.window.SRL_DATA;
const CALC = global.window.SRL_CALC;

let failures = 0;
function check(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(
    `${ok ? '  ok  ' : ' FALLA'}  ${name}` +
      (ok ? '' : `\n         esperado ${JSON.stringify(expected)}\n         obtenido ${JSON.stringify(actual)}`)
  );
}

function checkClose(name, actual, expected, tol = 1e-9) {
  const ok = typeof actual === 'number' && Math.abs(actual - expected) <= tol;
  if (!ok) failures += 1;
  console.log(
    `${ok ? '  ok  ' : ' FALLA'}  ${name}` +
      (ok ? '' : `\n         esperado ${expected}\n         obtenido ${actual}`)
  );
}

// ═══════════════════════ 1. Verificación del módulo SRL ═══════════════════════

const srlQuestions = DATA.srl.sections.flatMap((s) => s.items);

check('SRL: 9 niveles definidos', DATA.srl.sections.length, 9);
check('SRL: 5 preguntas por nivel', DATA.srl.sections.map((s) => s.items.length), [5, 5, 5, 5, 5, 5, 5, 5, 5]);
check('SRL: 45 preguntas en total', srlQuestions.length, 45);
check('SRL: cada pregunta tiene acción en la ruta', srlQuestions.filter((q) => !q.action).length, 0);
check('SRL: umbral de consolidación (7 de 10 puntos = 70 %)', [DATA.srl.thresholdPoints, DATA.srl.maxPointsPerLevel, DATA.srl.thresholdRatio], [7, 10, 0.7]);
check('SRL: valores de opciones (No=0, Parcialmente=1, Sí=2)', DATA.srl.optionValues, { no: 0, partial: 1, yes: 2 });

const answerAllSrl = (val) => Object.fromEntries(srlQuestions.map((q) => [q.id, val]));
const answerUpToSrl = (maxLvl) => Object.fromEntries(srlQuestions.map((q) => [q.id, q.srl <= maxLvl ? 'yes' : 'no']));

check('SRL: sin responder → nivel 0', CALC.computeSrlResults({}).achieved, 0);
check('SRL: todo "No" → nivel 0', CALC.computeSrlResults(answerAllSrl('no')).achieved, 0);
check('SRL: todo "Parcialmente" (5/10 por nivel < 7) → nivel 0', CALC.computeSrlResults(answerAllSrl('partial')).achieved, 0);
check('SRL: todo "Sí" (90/90 pts) → nivel 9', CALC.computeSrlResults(answerAllSrl('yes')).achieved, 9);

for (let max = 1; max <= 9; max += 1) {
  check(`SRL: "Sí" hasta nivel ${max} → SRL ${max}`, CALC.computeSrlResults(answerUpToSrl(max)).achieved, max);
}

// Caso límite en SRL 1: 3 "Sí" (6 pts) + 1 "Parcialmente" (1 pto) = 7 pts → consolida SRL 1; 3 "Sí" (6 pts) → 0
check(
  'SRL: Nivel 1 con 7/10 pts (3 Sí + 1 Parcial) → SRL 1',
  CALC.computeSrlResults({ '1-1': 'yes', '1-2': 'yes', '1-3': 'yes', '1-4': 'partial', '1-5': 'no' }).achieved,
  1
);
check(
  'SRL: Nivel 1 con 6/10 pts (3 Sí + 2 No) → SRL 0',
  CALC.computeSrlResults({ '1-1': 'yes', '1-2': 'yes', '1-3': 'yes', '1-4': 'no', '1-5': 'no' }).achieved,
  0
);

// Detección de cuello de botella cuando un nivel superior supera 7/10 pero uno inferior no
const saltoSrl = Object.fromEntries(srlQuestions.map((q) => [q.id, q.srl === 1 || q.srl === 3 ? 'yes' : 'no']));
const resSalto = CALC.computeSrlResults(saltoSrl);
const roadSalto = CALC.buildSrlRoadmap(saltoSrl);
check('SRL: salto (SRL 1 y 3 en 10/10, SRL 2 en 0/10) → secuencial 1, más alto 3, cuello de botella 2', [
  resSalto.achieved,
  resSalto.highestConsolidated,
  roadSalto.bottleneck.srl,
  roadSalto.bottleneck.missingPoints,
], [1, 3, 2, 7]);

// ═══════════════════════ 2. Verificación del módulo HELIX ═══════════════════════

const hxElements = DATA.helix.vectors.flatMap((v) => v.items);

check('HELIX: 5 vectores definidos', DATA.helix.vectors.length, 5);
check('HELIX: 10 elementos por vector', DATA.helix.vectors.map((v) => v.items.length), [10, 10, 10, 10, 10]);
check('HELIX: 50 elementos en total', hxElements.length, 50);
check('HELIX: cada elemento tiene 5 frases de valoración', hxElements.filter((e) => e.options.length !== 5).length, 0);
check('HELIX: cada elemento tiene explicación metodológica (P1E1)', hxElements.filter((e) => !e.explanation).length, 0);
check('HELIX: 19 ámbitos predeterminados (hoja predeterminadas)', DATA.helix.presets.length, 19);
check('HELIX: 8 criterios de preferencias (hoja preferencias)', DATA.helix.preferences.length, 8);
check('HELIX: valores de respuesta [1, 0.75, 0.5, 0.25, 0] (parametros!C14:C22)', DATA.helix.optionScores, [1, 0.75, 0.5, 0.25, 0]);
check(
  'HELIX: factores correctores de preferencias [2, 1.5, 1, 0.75, 0.2] (parametros!B6:B10)',
  DATA.helix.preferenceFactors.map((p) => p.factor),
  [2, 1.5, 1, 0.75, 0.2]
);

// Ponderación estándar (hoja ponderacion!I8:I68)
const stdW = CALC.computeHelixWeights({ weightMode: 'standard' });
check('HELIX: pesos brutos estándar de vectores (ponderacion!I8:I12)', stdW.rawVectorWeights, [5, 5, 7, 5, 6]);
checkClose('HELIX: suma de pesos normalizados de vectores (AX13)', stdW.normVectorWeights.reduce((a, b) => a + b, 0), 1.0);

// Sumas por vector en ponderación estándar (AW24, AW35, AW46, AW57, AW68)
const vecElemSums = [0, 1, 2, 3, 4].map((vIdx) =>
  stdW.rawElementWeights.slice(vIdx * 10, (vIdx + 1) * 10).reduce((a, b) => a + b, 0)
);
check('HELIX: sumas de pesos estándar por vector (AW24, AW35, AW46, AW57, AW68)', vecElemSums, [44, 46, 63, 50, 65]);

// Importancia relativa en base 10 (P1R1!AX46:AX99): mínimo = 0, máximo = 10
checkClose('HELIX: importancia relativa mínima en base 10 (P1R1!AW136 → AX)', Math.min.apply(null, stdW.relativeImportance), 0.0);
checkClose('HELIX: importancia relativa máxima en base 10 (P1R1!AW137 → AX)', Math.max.apply(null, stdW.relativeImportance), 10.0);

// Verificación de los 19 ámbitos predeterminados
let presetErrors = 0;
for (let i = 0; i < 19; i += 1) {
  const pw = CALC.computeHelixWeights({ weightMode: 'preset', presetIndex: i });
  const sumV = pw.normVectorWeights.reduce((a, b) => a + b, 0);
  if (Math.abs(sumV - 1.0) > 1e-9) presetErrors += 1;
  for (let v = 0; v < 5; v += 1) {
    const sumE = pw.normElementWeights.slice(v * 10, (v + 1) * 10).reduce((a, b) => a + b, 0);
    if (Math.abs(sumE - 1.0) > 1e-9) presetErrors += 1;
  }
}
check('HELIX: los 19 ámbitos predeterminados normalizan vectores y elementos a 1.0', presetErrors, 0);

// Verificación de ponderación por preferencias (fórmula AVERAGEIF(AK:AR, ">0") con fallback a I)
// Si "Inclusión" (pref-1) = Crucial (factor 2.0) y "Proceso social" (pref-2) = Importante (factor 1.0):
// Vector 1 (Innovación): prefMask = [0,0,1,0,0,0,0,0] → ningún producto > 0 → fallback a I8 = 5
// Vector 2 (Impacto): prefMask = [1,0,0,1,0,1,1,0] → solo pref-1 activo: 5 * 1 * 2.0 = 10
// Vector 3 (Cambio sistémico): prefMask = [1,1,0,0,1,0,0,0] → pref-1 (7*2=14) y pref-2 (7*1=7) → promedio = 10.5
const prefW = CALC.computeHelixWeights({
  weightMode: 'preferences',
  preferences: { 'pref-1': 'crucial', 'pref-2': 'importante' },
});
check('HELIX: cálculo de pesos por preferencias (AVERAGEIF(AK:AR, ">0"))', [
  prefW.rawVectorWeights[0],
  prefW.rawVectorWeights[1],
  prefW.rawVectorWeights[2],
], [5, 10, 10.5]);

// Valoración rápida (P1R1!AV16)
const rapidRes = CALC.computeHelixResults({
  weightMode: 'standard',
  rapid: { V1: 8, V2: 6, V3: 10, V4: 4, V5: 5 },
});
// Con pesos [5, 5, 7, 5, 6] / 28: (8*5 + 6*5 + 10*7 + 4*5 + 5*6) / 28 = (40 + 30 + 70 + 20 + 30) / 28 = 190 / 28
checkClose('HELIX: valoración rápida ponderada (P1R1!AV16)', rapidRes.rapid.globalScore, 190 / 28);

// Valoración completa: todas en opción 1 (100 % = 1.0) → 10.0 en todos los vectores y global
const allBest = Object.fromEntries(hxElements.map((e) => [e.id, 1]));
const resBest = CALC.computeHelixResults({ weightMode: 'standard', elements: allBest });
checkClose('HELIX: valoración completa con opción 1 en los 50 atributos → 10.0', resBest.complete.globalScore, 10.0);
check('HELIX: los 5 vectores valen 10.0 cuando todos sus atributos son opción 1', resBest.complete.vectors.map((v) => Math.round(v.score * 1000) / 1000), [10, 10, 10, 10, 10]);

// Valoración completa: todas en opción 5 (0 % = 0.0) → 0.0
const allWorst = Object.fromEntries(hxElements.map((e) => [e.id, 5]));
const resWorst = CALC.computeHelixResults({ weightMode: 'standard', elements: allWorst });
checkClose('HELIX: valoración completa con opción 5 en los 50 atributos → 0.0', resWorst.complete.globalScore, 0.0);

// Reajuste de ponderación cuando un elemento se marca como "No aplica" ('na') (P1R1!E46:F56)
// En Vector 1 (suma de pesos = 44), V1-1 (VALOR) tiene peso 10. Si V1-1 = 'na',
// los 9 elementos restantes suman 34. Si V1-2 (peso 5) tiene opción 1 (1.0 → 10 pts)
// y los otros 8 tienen opción 5 (0.0 → 0 pts), el puntaje del Vector 1 debe ser 10 * (5 / 34).
const naCase = Object.assign({}, allWorst, { 'V1-1': 'na', 'V1-2': 1 });
const resNa = CALC.computeHelixResults({ weightMode: 'standard', elements: naCase });
checkClose('HELIX: reajuste de pesos en vector al marcar "No aplica" (P1R1!F46:K56)', resNa.complete.vectors[0].score, (5 / 34) * 10);
check('HELIX: conteo de respondidos (50) vs evaluados (49) y N/A (1)', [
  resNa.complete.answered,
  resNa.complete.evaluated,
  resNa.complete.naCount,
], [50, 49, 1]);

console.log(failures ? `\n${failures} comprobación(es) fallida(s)` : '\nTodas las comprobaciones correctas');
process.exit(failures ? 1 : 0);
