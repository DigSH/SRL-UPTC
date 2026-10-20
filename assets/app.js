/* ══════════════════════════════════════════════════════════════
   Herramienta de diagnóstico SRL y valoración HELIX (SocialTech) — UPTC
   Integra:
   1. Diagnóstico de Preparación Social (SRL 1–9, 45 preguntas, escala 0/1/2, umbral 7/10).
   2. Valoración de Innovación Social HELIX (5 vectores, 50 atributos, 4 modos de ponderación,
      valoración rápida y completa, radar pentagonal y mapa de atributos en 4 cuadrantes).
   ══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const DATA = window.SRL_DATA;
  const STORAGE_KEY = 'srl-uptc-v1';
  const THEME_KEY = 'trl-uptc-theme';

  const PROFILE_FIELDS = [
    ['investigador', 'Investigador(a) / Evaluador(a)'],
    ['grupo', 'Grupo I+D+i / Centro / Facultad'],
    ['telefono', 'Teléfono'],
    ['email', 'Correo electrónico'],
    ['proyecto', 'Proyecto o solución social'],
    ['comunidad', 'Comunidad o población objetivo'],
  ];

  function createDefaultState() {
    const rapid = {};
    DATA.helix.vectors.forEach((v) => { rapid[v.id] = 5; });
    const customVectors = {};
    const customElements = {};
    DATA.helix.vectors.forEach((v) => {
      customVectors[v.id] = v.standardWeight;
      v.items.forEach((item) => { customElements[item.id] = item.standardWeight; });
    });
    return {
      answers: {}, // SRL: { '1-1': 'yes'|'partial'|'no' }
      profile: {},
      helix: {
        evalMode: 'complete', // 'complete' | 'rapid'
        weightMode: 'standard', // 'standard' | 'preset' | 'preferences' | 'custom'
        presetIndex: 0,
        preferences: {}, // { 'pref-1': 'crucial'|'muy_importante'|'importante'|'algo_importante'|'irrelevante' }
        customVectors,
        customElements,
        rapid, // { 'V1': 0..10 }
        elements: {}, // { 'V1-1': 1|2|3|4|5|'na' }
      },
    };
  }

  let state = createDefaultState();

  // ═══════════════════════ Funciones puras de cálculo ═══════════════════════

  const allSrlQuestions = DATA.srl.sections.flatMap((section) =>
    section.items.map((item) => Object.assign({ section: section.short, stage: section.stage }, item))
  );

  const allHelixElements = DATA.helix.vectors.flatMap((vector) =>
    vector.items.map((item) => Object.assign({ vectorShort: vector.short, vectorId: vector.id }, item))
  );

  /**
   * Calcula el diagnóstico SRL (1 a 9) replicando Nivel SRL.html y añadiendo
   * detección de cuello de botella como en TRL-UPTC.
   */
  function computeSrlResults(answersInput) {
    const answers = answersInput || {};
    const optionValues = DATA.srl.optionValues;
    const thresholdPoints = DATA.srl.thresholdPoints; // 7
    const maxPoints = DATA.srl.maxPointsPerLevel; // 10

    const bySrl = {};
    for (let lvl = 1; lvl <= 9; lvl += 1) {
      bySrl[lvl] = {
        level: lvl,
        points: 0,
        maxPoints,
        ratio: 0,
        threshold: DATA.srl.thresholdRatio,
        thresholdPoints,
        yes: 0,
        partial: 0,
        no: 0,
        unanswered: 0,
        consolidated: false,
      };
    }

    let answered = 0;
    let totalPoints = 0;
    const totalMaxPoints = 9 * maxPoints; // 90

    allSrlQuestions.forEach((q) => {
      const ans = answers[q.id];
      const bucket = bySrl[q.srl];
      if (ans === 'yes' || ans === 'partial' || ans === 'no') {
        answered += 1;
        const pts = optionValues[ans];
        bucket.points += pts;
        totalPoints += pts;
        bucket[ans] += 1;
      } else {
        bucket.unanswered += 1;
      }
    });

    for (let lvl = 1; lvl <= 9; lvl += 1) {
      bySrl[lvl].ratio = bySrl[lvl].points / maxPoints;
      bySrl[lvl].consolidated = bySrl[lvl].points >= thresholdPoints;
    }

    // Regla secuencial de Nivel SRL.html: avanza mientras cada nivel alcance >= 7 puntos
    let achievedSequential = 0;
    for (let lvl = 1; lvl <= 9; lvl += 1) {
      if (bySrl[lvl].consolidated) {
        achievedSequential = lvl;
      } else {
        break;
      }
    }

    // Nivel más alto que supera el umbral (evaluando de 9 hacia 1)
    let highestConsolidated = 0;
    for (let lvl = 9; lvl >= 1; lvl -= 1) {
      if (bySrl[lvl].consolidated) {
        highestConsolidated = lvl;
        break;
      }
    }

    return {
      bySrl,
      achieved: achievedSequential,
      highestConsolidated,
      maturity: DATA.srl.maturity[String(achievedSequential)],
      totalPoints,
      totalMaxPoints,
      globalRatio: totalPoints / totalMaxPoints,
      answered,
      total: allSrlQuestions.length,
    };
  }

  function buildSrlRoadmap(answersInput) {
    const answers = answersInput || {};
    const result = computeSrlResults(answers);
    const levels = [];

    for (let lvl = 1; lvl <= 9; lvl += 1) {
      const section = DATA.srl.sections[lvl - 1];
      const stats = result.bySrl[lvl];
      const items = allSrlQuestions.filter((q) => q.srl === lvl);
      const pending = items.filter((q) => answers[q.id] !== 'yes');
      const neededPoints = DATA.srl.thresholdPoints;
      const missingPoints = Math.max(0, neededPoints - stats.points);

      levels.push({
        srl: lvl,
        name: section.short,
        stage: section.stage,
        description: section.description,
        recommendations: section.recommendations,
        points: stats.points,
        maxPoints: stats.maxPoints,
        ratio: stats.ratio,
        threshold: stats.threshold,
        consolidated: stats.consolidated,
        neededPoints,
        missingPoints,
        items,
        pending,
      });
    }

    const bottleneck = levels.find((lvl) => !lvl.consolidated) || null;
    return { result, levels, bottleneck };
  }

  /**
   * Calcula las ponderaciones de HELIX replicando exactamente la hoja `ponderacion`
   * y las columnas AW/AX de `P1R1` del libro Copia_de_Helix_221004_pro (1).xlsm.
   */
  function computeHelixWeights(hxConfig) {
    const cfg = hxConfig || {};
    const mode = cfg.weightMode || 'standard';
    const factorLookup = {};
    DATA.helix.preferenceFactors.forEach((pf) => { factorLookup[pf.key] = pf.factor; });

    // Factores AC$7:AJ$7 elegidos en preferencias (0 si no se ha valorado ese criterio)
    const prefFactors = DATA.helix.preferences.map((pref) => {
      const choice = cfg.preferences && cfg.preferences[pref.id];
      return choice && factorLookup[choice] ? factorLookup[choice] : 0;
    });
    const anyPrefChosen = prefFactors.some((f) => f > 0);

    const presetIdx = Number.isInteger(cfg.presetIndex) && cfg.presetIndex >= 0 && cfg.presetIndex < DATA.helix.presets.length
      ? cfg.presetIndex
      : 0;
    const preset = DATA.helix.presets[presetIdx];

    // 1. Pesos brutos de los 5 vectores (AW8:AW12)
    const rawVectorWeights = DATA.helix.vectors.map((vec, vIdx) => {
      if (mode === 'custom' && cfg.customVectors && cfg.customVectors[vec.id] !== undefined) {
        const val = Number(cfg.customVectors[vec.id]);
        return Number.isFinite(val) && val >= 0 ? val : vec.standardWeight;
      }
      if (mode === 'preferences' && anyPrefChosen) {
        // AK..AR = I * mask * factor; AT = AVERAGEIF(AK:AR, ">0"); AU = IF(AT=0, I, AT)
        const activeProducts = [];
        for (let p = 0; p < 8; p += 1) {
          const prod = vec.standardWeight * vec.prefMask[p] * prefFactors[p];
          if (prod > 0) activeProducts.push(prod);
        }
        if (activeProducts.length > 0) {
          return activeProducts.reduce((a, b) => a + b, 0) / activeProducts.length;
        }
        return vec.standardWeight;
      }
      if (mode === 'preset') {
        return preset.vectorWeights[vIdx];
      }
      return vec.standardWeight;
    });

    const sumVectorWeights = rawVectorWeights.reduce((a, b) => a + b, 0);
    // AX8:AX12 — conversión a 0-1
    const normVectorWeights = rawVectorWeights.map((w) => (sumVectorWeights === 0 ? 0 : w / sumVectorWeights));

    // 2. Pesos brutos de los 50 elementos (AW14:AW67) y normalización por vector (AX14:AX67)
    const rawElementWeights = [];
    const normElementWeights = [];

    DATA.helix.vectors.forEach((vec, vIdx) => {
      const vecRaw = vec.items.map((item) => {
        if (mode === 'custom' && cfg.customElements && cfg.customElements[item.id] !== undefined) {
          const val = Number(cfg.customElements[item.id]);
          return Number.isFinite(val) && val >= 0 ? val : item.standardWeight;
        }
        if (mode === 'preferences' && anyPrefChosen) {
          const activeProducts = [];
          for (let p = 0; p < 8; p += 1) {
            const prod = item.standardWeight * item.prefMask[p] * prefFactors[p];
            if (prod > 0) activeProducts.push(prod);
          }
          if (activeProducts.length > 0) {
            return activeProducts.reduce((a, b) => a + b, 0) / activeProducts.length;
          }
          return item.standardWeight;
        }
        if (mode === 'preset') {
          return preset.elementWeights[item.globalIndex];
        }
        return item.standardWeight;
      });

      const vecSum = vecRaw.reduce((a, b) => a + b, 0);
      vecRaw.forEach((w) => {
        rawElementWeights.push(w);
        normElementWeights.push(vecSum === 0 ? 0 : w / vecSum);
      });
    });

    // 3. Peso global de cada elemento (P1R1!AW46:AW99 = C_elem * C_vec)
    //    e importancia relativa en base 10 (P1R1!AX46:AX99 = (AW - min) * 10 / (max - min))
    const globalElementWeights = allHelixElements.map((item, idx) =>
      normElementWeights[idx] * normVectorWeights[item.vectorIndex]
    );
    const minAW = Math.min.apply(null, globalElementWeights);
    const maxAW = Math.max.apply(null, globalElementWeights);
    const diffAW = maxAW - minAW;
    const relativeImportance = globalElementWeights.map((aw) =>
      diffAW === 0 ? 0 : ((aw - minAW) * 10) / diffAW
    );

    return {
      mode,
      rawVectorWeights,
      normVectorWeights,
      rawElementWeights,
      normElementWeights,
      globalElementWeights,
      relativeImportance,
      minAW,
      maxAW,
    };
  }

  /**
   * Calcula las puntuaciones de HELIX (tanto Valoración rápida como Valoración completa)
   * replicando las hojas `P1E1`, `P1R1`, `P1R2` y `P1R4`.
   */
  function computeHelixResults(hxState) {
    const hx = hxState || {};
    const weights = computeHelixWeights(hx);
    const base = DATA.helix.baseScore; // 10
    const optionScores = DATA.helix.optionScores; // [1, 0.75, 0.5, 0.25, 0]

    // ── A. Valoración rápida (P1R1!R16:R21) ───────────────────────────────
    const rapidVectors = DATA.helix.vectors.map((vec, vIdx) => {
      const rawVal = hx.rapid && hx.rapid[vec.id] !== undefined ? Number(hx.rapid[vec.id]) : 5;
      const score = Number.isFinite(rawVal) ? Math.max(0, Math.min(10, rawVal)) : 0;
      const weight = weights.normVectorWeights[vIdx];
      return {
        id: vec.id,
        short: vec.short,
        code: vec.code,
        score,
        weight,
        weightedScore: score * weight,
      };
    });
    const rapidGlobal = rapidVectors.reduce((sum, v) => sum + v.weightedScore, 0);

    // ── B. Valoración completa (P1R1!R23:R28 y R46:R108) ──────────────────
    const elemMap = hx.elements || {};
    let answeredElements = 0; // H90: incluye opciones 1..5 y 'na'
    let evaluatedElements = 0; // solo opciones 1..5 (D46:D99 = 1)
    let naElements = 0;

    const completeVectors = [];
    const elementDetails = [];

    DATA.helix.vectors.forEach((vec, vIdx) => {
      const vecWeight = weights.normVectorWeights[vIdx];

      // Paso 1: identificar cuáles elementos tienen respuesta numérica válida (D=1)
      const prelim = vec.items.map((item) => {
        const choice = elemMap[item.id];
        const baseElemWeight = weights.normElementWeights[item.globalIndex];
        let isAnswered = false;
        let isEvaluated = false;
        let isNa = false;
        let rawScore01 = 0; // G en P1E1 (0 a 1)

        if (choice === 'na') {
          isAnswered = true;
          isNa = true;
          answeredElements += 1;
          naElements += 1;
        } else if (choice !== undefined && choice !== null && choice !== '') {
          const lvl = Number(choice);
          if (lvl >= 1 && lvl <= 5) {
            isAnswered = true;
            isEvaluated = true;
            rawScore01 = optionScores[lvl - 1];
            answeredElements += 1;
            evaluatedElements += 1;
          }
        }

        // E_row = C_row * D_row (peso del elemento si fue evaluado con 1..5, 0 si no o si es 'na')
        const activeWeight = isEvaluated ? baseElemWeight : 0;
        return {
          item,
          choice: isAnswered ? choice : null,
          isAnswered,
          isEvaluated,
          isNa,
          rawScore01,
          score10: rawScore01 * base, // AT_row
          baseElemWeight,
          activeWeight,
          globalWeight: weights.globalElementWeights[item.globalIndex],
          importance10: weights.relativeImportance[item.globalIndex],
        };
      });

      // E$56 / E$67 / E$78 / E$89 / E$100: suma de pesos activos de los elementos evaluados del vector
      const sumActiveWeight = prelim.reduce((s, e) => s + e.activeWeight, 0);

      let vectorScore10 = 0;
      prelim.forEach((entry) => {
        // F_row = IF(E$sum=0, 0, E_row / E$sum)
        const adjustedWeightInVector = sumActiveWeight === 0 ? 0 : entry.activeWeight / sumActiveWeight;
        // J_row = G_row * F_row ; K_row = J_row * 10
        const contribution10 = entry.rawScore01 * adjustedWeightInVector * base;
        vectorScore10 += contribution10;

        // Cuadrante en P1R4 (Valoración en X: score10, Importancia en Y: importance10)
        let quadrant = null;
        if (entry.isEvaluated) {
          if (entry.importance10 >= 5 && entry.score10 >= 5) quadrant = 'strength';
          else if (entry.importance10 >= 5 && entry.score10 < 5) quadrant = 'improve';
          else if (entry.importance10 < 5 && entry.score10 >= 5) quadrant = 'low-good';
          else quadrant = 'low-weak';
        }

        elementDetails.push(Object.assign({}, entry, {
          adjustedWeightInVector,
          contribution10,
          quadrant,
        }));
      });

      completeVectors.push({
        id: vec.id,
        short: vec.short,
        code: vec.code,
        score: vectorScore10,
        weight: vecWeight,
        weightedScore: vectorScore10 * vecWeight,
        answered: prelim.filter((p) => p.isAnswered).length,
        evaluated: prelim.filter((p) => p.isEvaluated).length,
        total: vec.items.length,
      });
    });

    const completeGlobal = completeVectors.reduce((sum, v) => sum + v.weightedScore, 0);

    return {
      weights,
      rapid: {
        vectors: rapidVectors,
        globalScore: rapidGlobal,
      },
      complete: {
        vectors: completeVectors,
        elements: elementDetails,
        globalScore: completeGlobal,
        answered: answeredElements,
        evaluated: evaluatedElements,
        naCount: naElements,
        total: allHelixElements.length,
      },
    };
  }

  // Exportar motor de cálculo para verify.js
  window.SRL_CALC = {
    computeSrlResults,
    buildSrlRoadmap,
    computeHelixWeights,
    computeHelixResults,
  };

  // Si se ejecuta en Node (verify.js) sin DOM, terminar aquí.
  if (typeof document === 'undefined') return;

  // ═══════════════════════ Utilidades DOM ═══════════════════════

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  const escapeHtml = (str) =>
    String(str).replace(/[&<>"']/g, (ch) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch])
    );

  const pct = (value) => Math.round(value * 1000) / 10;
  const fmt1 = (value) => (Math.round(value * 10) / 10).toFixed(1).replace('.', ',');
  const fmt2 = (value) => (Math.round(value * 100) / 100).toFixed(2).replace('.', ',');

  const conj = (count, singular, plural) => (count === 1 ? singular : plural);
  const count = (n, singular, plural) => `${n} ${conj(n, singular, plural)}`;

  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.hidden = false;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { el.hidden = true; }, 2600);
  }

  // ═══════════════════════ Persistencia ═══════════════════════

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        const def = createDefaultState();
        state.answers = parsed.answers && typeof parsed.answers === 'object' ? parsed.answers : {};
        state.profile = parsed.profile && typeof parsed.profile === 'object' ? parsed.profile : {};
        if (parsed.helix && typeof parsed.helix === 'object') {
          state.helix.evalMode = parsed.helix.evalMode === 'rapid' ? 'rapid' : 'complete';
          state.helix.weightMode = ['standard', 'preset', 'preferences', 'custom'].includes(parsed.helix.weightMode)
            ? parsed.helix.weightMode
            : 'standard';
          state.helix.presetIndex = Number.isInteger(parsed.helix.presetIndex) ? parsed.helix.presetIndex : 0;
          state.helix.preferences = parsed.helix.preferences && typeof parsed.helix.preferences === 'object'
            ? parsed.helix.preferences
            : {};
          state.helix.customVectors = Object.assign(def.helix.customVectors, parsed.helix.customVectors || {});
          state.helix.customElements = Object.assign(def.helix.customElements, parsed.helix.customElements || {});
          state.helix.rapid = Object.assign(def.helix.rapid, parsed.helix.rapid || {});
          state.helix.elements = parsed.helix.elements && typeof parsed.helix.elements === 'object'
            ? parsed.helix.elements
            : {};
        }
      }
    } catch (err) {
      console.warn('No se pudieron recuperar las respuestas guardadas:', err);
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      flashSaved();
    } catch (err) {
      console.warn('No se pudieron guardar las respuestas:', err);
      const hint = document.getElementById('save-hint');
      if (hint) {
        hint.textContent = 'No se pudo guardar';
        hint.dataset.state = 'error';
      }
    }
  }

  function flashSaved() {
    const hint = document.getElementById('save-hint');
    if (!hint) return;
    hint.textContent = 'Guardado';
    hint.dataset.state = 'ok';
    clearTimeout(flashSaved._timer);
    flashSaved._timer = setTimeout(() => { hint.dataset.state = 'idle'; }, 1800);
  }

  // ═══════════════════════ Glosario automático ═══════════════════════

  const glossaryMatcher = (function build() {
    const lookup = new Map();
    const patterns = [];
    DATA.glossary.forEach((entry) => {
      [entry.term].concat(entry.aliases || []).forEach((alias) => {
        lookup.set(alias.toLowerCase(), entry);
        patterns.push(alias);
      });
    });
    patterns.sort((a, b) => b.length - a.length);
    const escaped = patterns.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const letter = 'A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ_';
    const regex = new RegExp(
      `(?<![${letter}])(${escaped.join('|')})(?![${letter}])`,
      'gi'
    );
    return { lookup, regex };
  })();

  function withGlossary(text) {
    return escapeHtml(text).replace(glossaryMatcher.regex, (match) => {
      const entry = glossaryMatcher.lookup.get(match.toLowerCase());
      if (!entry) return match;
      return `<abbr class="term" title="${escapeHtml(entry.term)}: ${escapeHtml(entry.definition)}">${match}</abbr>`;
    });
  }

  // ═══════════════════════ Pestañas y navegación ═══════════════════════

  const TABS = [
    { id: 'guia', label: 'Guía', group: 'start' },
    { id: 'perfil', label: 'Perfil', group: 'start' },
  ]
    .concat(
      DATA.srl.sections.map((section, idx) => ({
        id: 's' + idx,
        label: String(idx + 1),
        short: section.short,
        srlIndex: idx,
        group: 'srl',
      }))
    )
    .concat([
      { id: 'resultados', label: 'Resultados SRL', group: 'srl-out' },
      { id: 'plan', label: 'Ruta SRL 9', group: 'srl-out' },
      { id: 'hx-config', label: 'Pond.', title: 'Configuración de ponderación HELIX', group: 'helix' },
      { id: 'hx-rapida', label: 'Rápida', title: 'Valoración rápida HELIX (5 vectores)', group: 'helix' },
    ])
    .concat(
      DATA.helix.vectors.map((vec, idx) => ({
        id: 'hx' + idx,
        label: `V${idx + 1}`,
        short: vec.short,
        hxIndex: idx,
        group: 'helix',
      }))
    )
    .concat([
      { id: 'hx-resultados', label: 'Resultados HELIX', group: 'end' },
      { id: 'glosario', label: 'Glosario', group: 'end' },
    ]);

  function buildTabs() {
    const renderBtn = (tab) => {
      if (tab.srlIndex !== undefined) {
        const title = `Nivel SRL ${tab.srlIndex + 1}: ${tab.short}`;
        return `<button type="button" class="tab tab-num" data-tab="${tab.id}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${tab.label}</button>`;
      }
      if (tab.hxIndex !== undefined) {
        const title = `Vector HELIX ${tab.hxIndex + 1}: ${tab.short}`;
        return `<button type="button" class="tab tab-num" data-tab="${tab.id}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${tab.label}</button>`;
      }
      if (tab.group === 'helix') {
        return `<button type="button" class="tab tab-num" data-tab="${tab.id}" title="${escapeHtml(tab.title)}" aria-label="${escapeHtml(tab.title)}">${escapeHtml(tab.label)}</button>`;
      }
      return `<button type="button" class="tab" data-tab="${tab.id}">${escapeHtml(tab.label)}</button>`;
    };

    const startTabs = TABS.filter((t) => t.group === 'start');
    const srlTabs = TABS.filter((t) => t.group === 'srl');
    const srlOutTabs = TABS.filter((t) => t.group === 'srl-out');
    const helixTabs = TABS.filter((t) => t.group === 'helix');
    const endTabs = TABS.filter((t) => t.group === 'end');

    $('#tabs').innerHTML =
      startTabs.map(renderBtn).join('') +
      `<span class="tab-group">
         <span class="tab-group-label" aria-hidden="true">SRL</span>
         ${srlTabs.map(renderBtn).join('')}
       </span>` +
      srlOutTabs.map(renderBtn).join('') +
      `<span class="tab-group">
         <span class="tab-group-label" aria-hidden="true">HELIX</span>
         ${helixTabs.map(renderBtn).join('')}
       </span>` +
      endTabs.map(renderBtn).join('');
  }

  // ═══════════════════════ Construcción de paneles ═══════════════════════

  function buildGuide() {
    $('#guide-intro').innerHTML = DATA.guide
      .filter(Boolean)
      .map((p) => `<p>${escapeHtml(p)}</p>`)
      .join('');

    $('#levels-list').innerHTML = DATA.srl.sections
      .slice()
      .reverse()
      .map((sec) => `
        <details class="level">
          <summary>
            <span class="lvl-stage">${escapeHtml(sec.stage)}</span>
            <span class="lvl-code">SRL ${sec.level}</span>
            <span>${escapeHtml(sec.short)}</span>
          </summary>
          <p>${escapeHtml(sec.description)}</p>
        </details>`)
      .join('');

    $('#vectors-list').innerHTML = DATA.helix.vectors
      .map((vec) => `
        <details class="level">
          <summary>
            <span class="lvl-stage">10 atributos · Peso estándar ${vec.standardWeight}</span>
            <span class="lvl-code">${escapeHtml(vec.id)}</span>
            <span>${escapeHtml(vec.short)}</span>
          </summary>
          <p>${escapeHtml(vec.description)}</p>
        </details>`)
      .join('');
  }

  function buildSrlPanels() {
    $('#srl-panels').innerHTML = DATA.srl.sections.map((section, index) => {
      const questions = section.items.map((item) => `
        <div class="qcard" data-question="${item.id}">
          <div class="qcode"><b>${escapeHtml(item.id)}</b><span>SRL ${item.srl}</span></div>
          <div class="qtext">${withGlossary(item.text)}</div>
          <div class="choice">
            <input type="radio" id="q-${item.id}-yes" name="q-${item.id}" value="yes">
            <label for="q-${item.id}-yes">Sí (2)</label>
            <input type="radio" id="q-${item.id}-partial" name="q-${item.id}" value="partial">
            <label for="q-${item.id}-partial">Parcialmente (1)</label>
            <input type="radio" id="q-${item.id}-no" name="q-${item.id}" value="no">
            <label for="q-${item.id}-no">No (0)</label>
          </div>
        </div>`).join('');

      const prevId = index === 0 ? 'perfil' : 's' + (index - 1);
      const prevLabel = index === 0 ? 'Perfil' : `Nivel SRL ${index}`;
      const nextId = index === DATA.srl.sections.length - 1 ? 'resultados' : 's' + (index + 1);
      const nextLabel = index === DATA.srl.sections.length - 1 ? 'Resultados SRL' : `Nivel SRL ${index + 2}`;

      return `
        <section class="panel" id="panel-s${index}" data-panel="s${index}" hidden>
          <div class="section-head">
            <span class="eyebrow">Cuestionario SRL · Nivel ${section.level} de 9 (${escapeHtml(section.stage)})</span>
            <h1>${escapeHtml(section.title)}</h1>
            <p class="lead">${escapeHtml(section.description)}</p>
            <div class="section-status">
              <span class="section-progress" data-srl-progress="${index}"></span>
              <span class="section-tools no-print">
                <label class="switch">
                  <input type="checkbox" data-filter-pending="${index}">
                  <span>Solo sin responder</span>
                </label>
                <button type="button" class="btn btn-sm" data-jump-srl="${index}">Ir a la siguiente sin responder</button>
              </span>
            </div>
          </div>
          <div class="qlist" data-qlist="${index}">${questions}</div>
          <p class="empty no-print" data-all-done="${index}" hidden>Todas las preguntas de este nivel están respondidas.</p>
          <div class="section-nav no-print">
            <button type="button" class="btn" data-goto="${prevId}">← ${escapeHtml(prevLabel)}</button>
            <button type="button" class="btn btn-primary" data-goto="${nextId}">${escapeHtml(nextLabel)} →</button>
          </div>
        </section>`;
    }).join('');
  }

  function buildHelixConfigPanel() {
    renderHelixConfigBody();
  }

  function renderHelixConfigBody() {
    const mode = state.helix.weightMode;
    $$('input[name="hx-wmode"]').forEach((r) => { r.checked = r.value === mode; });
    const container = $('#hx-config-body');

    if (mode === 'standard') {
      container.innerHTML = `
        <p style="margin:0"><strong>Ponderación estándar activa.</strong> Se aplican los pesos originales del instrumento HELIX (Innovación: 5, Impacto: 5, Cambio sistémico: 7, Participación: 5, Consistencia: 6), diseñados para analizar proyectos de innovación social de naturaleza diversa.</p>`;
    } else if (mode === 'preset') {
      const options = DATA.helix.presets.map((p) =>
        `<option value="${p.index}"${p.index === state.helix.presetIndex ? ' selected' : ''}>${escapeHtml(p.name)}</option>`
      ).join('');
      container.innerHTML = `
        <label style="display:block;font-weight:600;margin-bottom:.5rem" for="hx-preset-select">Seleccione el ámbito de trabajo del proyecto:</label>
        <select id="hx-preset-select">${options}</select>
        <p class="hint" style="margin:.6rem 0 0">Cada ámbito predeterminado ajusta automáticamente el peso de los 5 vectores y de los 50 atributos según la tabla de ponderación del instrumento HELIX.</p>`;
    } else if (mode === 'preferences') {
      const rows = DATA.helix.preferences.map((pref) => {
        const current = state.helix.preferences[pref.id] || '';
        const choices = DATA.helix.preferenceFactors.map((pf) => `
          <input type="radio" id="${pref.id}-${pf.key}" name="${pref.id}" value="${pf.key}"${current === pf.key ? ' checked' : ''}>
          <label for="${pref.id}-${pf.key}">${escapeHtml(pf.label)}</label>`).join('');
        return `
          <div class="pref-row">
            <div>
              <strong>${escapeHtml(pref.short)}</strong>
              <small>${escapeHtml(pref.description)}</small>
            </div>
            <div class="choice">${choices}</div>
          </div>`;
      }).join('');
      container.innerHTML = `
        <p class="hint" style="margin-top:0">Indique la importancia de cada eje para su proyecto (Crucial = ×2,0 · Muy importante = ×1,5 · Importante = ×1,0 · Algo importante = ×0,75 · Irrelevante = ×0,2):</p>
        ${rows}`;
    } else if (mode === 'custom') {
      const vecInputs = DATA.helix.vectors.map((vec) => `
        <label class="custom-item">
          <span><b>${escapeHtml(vec.id)} · ${escapeHtml(vec.short)}</b> <small>(estándar: ${vec.standardWeight})</small></span>
          <input type="number" min="0" max="100" step="1" data-custom-vec="${vec.id}" value="${state.helix.customVectors[vec.id] ?? vec.standardWeight}">
        </label>`).join('');

      const elemBlocks = DATA.helix.vectors.map((vec) => {
        const items = vec.items.map((item) => `
          <label class="custom-item">
            <span><b>${escapeHtml(item.id)} · ${escapeHtml(item.label)}</b> <small>(est.: ${item.standardWeight})</small></span>
            <input type="number" min="0" max="100" step="1" data-custom-elem="${item.id}" value="${state.helix.customElements[item.id] ?? item.standardWeight}">
          </label>`).join('');
        return `
          <details class="level" style="margin-top:.6rem">
            <summary><span class="lvl-code">${escapeHtml(vec.id)}</span><span>Elementos de ${escapeHtml(vec.short)}</span></summary>
            <div class="custom-grid">${items}</div>
          </details>`;
      }).join('');

      container.innerHTML = `
        <h3 style="margin-top:0">Peso de los 5 vectores</h3>
        <div class="custom-grid">${vecInputs}</div>
        <h3 style="margin-top:1.25rem">Peso de los 50 elementos dentro de cada vector</h3>
        ${elemBlocks}`;
    }

    renderHelixWeightPreview();
  }

  function renderHelixWeightPreview() {
    const w = computeHelixWeights(state.helix);
    $('#hx-vector-weights-preview').innerHTML = DATA.helix.vectors.map((vec, idx) =>
      barRow(
        `${vec.id}. ${vec.short}`,
        `Peso bruto: ${fmt1(w.rawVectorWeights[idx])}`,
        w.normVectorWeights[idx]
      )
    ).join('');
  }

  function buildHelixRapidPanel() {
    const w = computeHelixWeights(state.helix);
    $('#hx-rapid-list').innerHTML = DATA.helix.vectors.map((vec, idx) => {
      const val = state.helix.rapid[vec.id] ?? 5;
      return `
        <div class="rapid-card">
          <div class="rapid-head">
            <h3>${escapeHtml(vec.id)} · ${escapeHtml(vec.short)}</h3>
            <span class="rapid-weight" data-rapid-weight="${vec.id}">Peso: ${pct(w.normVectorWeights[idx])} %</span>
          </div>
          <p class="hint" style="margin:0">${escapeHtml(vec.description)}</p>
          <div class="rapid-controls">
            <input type="range" min="0" max="10" step="0.5" value="${val}" data-rapid-range="${vec.id}" aria-label="Valoración rápida de ${escapeHtml(vec.short)}">
            <input type="number" min="0" max="10" step="0.5" value="${val}" data-rapid-num="${vec.id}" aria-label="Puntaje numérico de ${escapeHtml(vec.short)}">
          </div>
        </div>`;
    }).join('');
  }

  function buildHelixCompletePanels() {
    $('#helix-panels').innerHTML = DATA.helix.vectors.map((vec, vIdx) => {
      const cards = vec.items.map((item) => {
        const opts = item.options.map((opt) => `
          <label class="hopt" data-level="${opt.level}">
            <input type="radio" name="hx-${item.id}" value="${opt.level}">
            <span class="hopt-badge">${Math.round(opt.score * 100)} %</span>
            <span>${escapeHtml(opt.text)}</span>
          </label>`).join('');

        const naOpt = `
          <label class="hopt" data-level="na">
            <input type="radio" name="hx-${item.id}" value="na">
            <span class="hopt-badge">N/A</span>
            <span>${escapeHtml(DATA.helix.naLabel)}</span>
          </label>`;

        return `
          <div class="hcard" data-helix-item="${item.id}">
            <div class="hcard-head">
              <span class="hcard-code">${escapeHtml(item.id)} · ${escapeHtml(item.label)}</span>
              <span class="hcard-weight" data-elem-weight="${item.id}">Peso estándar: ${item.standardWeight}</span>
            </div>
            <div class="hcard-question">${withGlossary(item.question)}</div>
            ${item.explanation ? `
              <details class="hexp">
                <summary>Explicación metodológica</summary>
                <p>${escapeHtml(item.explanation)}</p>
              </details>` : ''}
            <div class="hopts">
              ${opts}
              ${naOpt}
            </div>
          </div>`;
      }).join('');

      const prevId = vIdx === 0 ? 'hx-rapida' : 'hx' + (vIdx - 1);
      const prevLabel = vIdx === 0 ? 'Valoración rápida' : `Vector V${vIdx}`;
      const nextId = vIdx === DATA.helix.vectors.length - 1 ? 'hx-resultados' : 'hx' + (vIdx + 1);
      const nextLabel = vIdx === DATA.helix.vectors.length - 1 ? 'Resultados HELIX' : `Vector V${vIdx + 2}`;

      return `
        <section class="panel" id="panel-hx${vIdx}" data-panel="hx${vIdx}" hidden>
          <div class="section-head">
            <span class="eyebrow">Módulo HELIX · Vector ${vIdx + 1} de 5</span>
            <h1>${escapeHtml(vec.id)} · ${escapeHtml(vec.short)}</h1>
            <p class="lead">${escapeHtml(vec.description)}</p>
            <div class="section-status">
              <span class="section-progress" data-hx-progress="${vIdx}"></span>
              <span class="section-tools no-print">
                <button type="button" class="btn btn-sm" data-jump-hx="${vIdx}">Ir al siguiente atributo sin valorar</button>
              </span>
            </div>
          </div>
          <div class="qlist">${cards}</div>
          <div class="section-nav no-print">
            <button type="button" class="btn" data-goto="${prevId}">← ${escapeHtml(prevLabel)}</button>
            <button type="button" class="btn btn-primary" data-goto="${nextId}">${escapeHtml(nextLabel)} →</button>
          </div>
        </section>`;
    }).join('');
  }

  function buildGlossary() {
    const render = (filter) => {
      const term = (filter || '').trim().toLowerCase();
      const entries = DATA.glossary.filter(
        (entry) => !term || entry.term.toLowerCase().includes(term) || entry.definition.toLowerCase().includes(term)
      );
      $('#glossary-list').innerHTML = entries.length
        ? entries.map((entry) => `
            <div>
              <dt>${escapeHtml(entry.term)}</dt>
              <dd>${escapeHtml(entry.definition)}</dd>
            </div>`).join('')
        : '<p class="empty">Ningún término coincide con la búsqueda.</p>';
    };
    render('');
    $('#glossary-search').addEventListener('input', (event) => render(event.target.value));
  }

  // ═══════════════════════ Sincronización de estado → UI ═══════════════════════

  function renderAnswers() {
    // SRL
    allSrlQuestions.forEach((q) => {
      const ans = state.answers[q.id];
      const card = $(`.qcard[data-question="${q.id}"]`);
      if (!card) return;
      card.dataset.answer = ans || '';
      $$(`input[name="q-${q.id}"]`).forEach((inp) => { inp.checked = inp.value === ans; });
    });

    // HELIX rápida
    DATA.helix.vectors.forEach((vec) => {
      const val = state.helix.rapid[vec.id] ?? 5;
      const range = $(`[data-rapid-range="${vec.id}"]`);
      const num = $(`[data-rapid-num="${vec.id}"]`);
      if (range) range.value = val;
      if (num) num.value = val;
    });

    // HELIX completa (50 atributos)
    allHelixElements.forEach((item) => {
      const val = state.helix.elements[item.id];
      const card = $(`.hcard[data-helix-item="${item.id}"]`);
      if (!card) return;
      card.dataset.answered = val === 'na' ? 'na' : val ? 'true' : '';
      $$(`input[name="hx-${item.id}"]`).forEach((inp) => {
        inp.checked = String(inp.value) === String(val);
      });
    });

    // Modo de resultados HELIX
    $$('input[name="hx-eval-mode"]').forEach((inp) => {
      inp.checked = inp.value === state.helix.evalMode;
    });
  }

  function renderProgress() {
    // Progreso por sección SRL
    DATA.srl.sections.forEach((section, idx) => {
      const answered = section.items.filter((item) => state.answers[item.id]).length;
      const total = section.items.length;
      const pts = section.items.reduce((s, item) => s + (DATA.srl.optionValues[state.answers[item.id]] || 0), 0);
      const label = $(`[data-srl-progress="${idx}"]`);
      if (label) label.textContent = `${answered} de ${total} respondidas · ${pts}/10 puntos`;
      const tab = $(`.tab[data-tab="s${idx}"]`);
      if (tab) tab.dataset.state = answered === 0 ? 'empty' : answered === total ? 'done' : 'partial';
      applySrlSectionFilter(idx);
    });

    // Progreso por vector HELIX
    const w = computeHelixWeights(state.helix);
    DATA.helix.vectors.forEach((vec, vIdx) => {
      const answered = vec.items.filter((item) => state.helix.elements[item.id] !== undefined).length;
      const total = vec.items.length;
      const label = $(`[data-hx-progress="${vIdx}"]`);
      if (label) label.textContent = `${answered} de ${total} atributos valorados · Peso del vector: ${pct(w.normVectorWeights[vIdx])} %`;
      const tab = $(`.tab[data-tab="hx${vIdx}"]`);
      if (tab) tab.dataset.state = answered === 0 ? 'empty' : answered === total ? 'done' : 'partial';

      const rapidW = $(`[data-rapid-weight="${vec.id}"]`);
      if (rapidW) rapidW.textContent = `Peso: ${pct(w.normVectorWeights[vIdx])} %`;

      vec.items.forEach((item) => {
        const elW = $(`[data-elem-weight="${item.id}"]`);
        if (elW) elW.textContent = `Peso en el vector: ${pct(w.normElementWeights[item.globalIndex])} %`;
      });
    });

    const srlAnswered = allSrlQuestions.filter((q) => state.answers[q.id]).length;
    const hxAnswered = allHelixElements.filter((e) => state.helix.elements[e.id] !== undefined).length;
    const totalItems = allSrlQuestions.length + allHelixElements.length;
    $('#global-bar').style.width = ((srlAnswered + hxAnswered) / totalItems) * 100 + '%';
  }

  function applySrlSectionFilter(index) {
    const toggle = $(`[data-filter-pending="${index}"]`);
    if (!toggle) return;
    const onlyPending = toggle.checked;
    const section = DATA.srl.sections[index];
    let visible = 0;

    section.items.forEach((item) => {
      const card = $(`.qcard[data-question="${item.id}"]`);
      if (!card) return;
      const hide = onlyPending && Boolean(state.answers[item.id]);
      card.hidden = hide;
      if (!hide) visible += 1;
    });

    const notice = $(`[data-all-done="${index}"]`);
    if (notice) notice.hidden = !(onlyPending && visible === 0);
  }

  function jumpToPendingSrl(index) {
    const order = DATA.srl.sections
      .map((section, i) => ({ section, i }))
      .slice(index)
      .concat(DATA.srl.sections.map((section, i) => ({ section, i })).slice(0, index));

    for (const entry of order) {
      const next = entry.section.items.find((item) => !state.answers[item.id]);
      if (!next) continue;
      if (entry.i !== index) show('s' + entry.i);
      const input = $(`#q-${CSS.escape(next.id)}-yes`);
      const card = $(`.qcard[data-question="${next.id}"]`);
      if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (input) input.focus({ preventScroll: true });
      return;
    }
    toast('No quedan preguntas SRL sin responder');
  }

  function jumpToPendingHelix(vIdx) {
    const order = DATA.helix.vectors
      .map((vec, i) => ({ vec, i }))
      .slice(vIdx)
      .concat(DATA.helix.vectors.map((vec, i) => ({ vec, i })).slice(0, vIdx));

    for (const entry of order) {
      const next = entry.vec.items.find((item) => state.helix.elements[item.id] === undefined);
      if (!next) continue;
      if (entry.i !== vIdx) show('hx' + entry.i);
      const card = $(`.hcard[data-helix-item="${next.id}"]`);
      const input = card ? $('input[type="radio"]', card) : null;
      if (card) card.scrollIntoView({ block: 'center', behavior: 'smooth' });
      if (input) input.focus({ preventScroll: true });
      return;
    }
    toast('Los 50 atributos HELIX están valorados');
  }

  function barRow(label, sub, ratio, threshold, reached, customRightText) {
    const width = Math.min(100, Math.max(0, ratio * 100));
    const marker = threshold === undefined ? '' :
      `<span class="bar-threshold" style="left:${threshold * 100}%" title="Umbral: ${pct(threshold)} %"></span>`;
    const valueText = customRightText !== undefined
      ? customRightText
      : threshold === undefined
        ? `<b>${pct(ratio)} %</b>`
        : `<b>${pct(ratio)} %</b> / ${pct(threshold)} %`;
    return `
      <div class="bar-row"${reached === undefined ? '' : ` data-reached="${reached}"`}>
        <span class="bar-label">${escapeHtml(label)}<small>${escapeHtml(sub)}</small></span>
        <span class="bar-track"><span class="bar-fill" style="width:${width}%"></span>${marker}</span>
        <span class="bar-value">${valueText}</span>
      </div>`;
  }

  function buildReportMetaHtml() {
    const profileRows = PROFILE_FIELDS
      .map(([key, label]) => `<div><b>${escapeHtml(label)}:</b> ${escapeHtml(state.profile[key] || '—')}</div>`)
      .join('');
    return `
      ${profileRows}
      <div class="full"><b>Fecha del diagnóstico:</b> ${new Date().toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
      <div class="full"><b>Descripción:</b> ${escapeHtml(state.profile.descripcion || '—')}</div>`;
  }

  // ═══════════════════════ Renderizado de Resultados SRL ═══════════════════════

  function renderSrlResults() {
    const res = computeSrlResults(state.answers);
    const currentSection = res.achieved > 0 ? DATA.srl.sections[res.achieved - 1] : null;

    const warning = $('#srl-warning');
    if (res.answered < res.total) {
      warning.hidden = false;
      warning.innerHTML = `<strong>Diagnóstico SRL incompleto.</strong> Ha respondido ${res.answered} de ${res.total} preguntas.
        Las preguntas sin responder suman <b>0 puntos</b>, por lo que el nivel mostrado puede subestimar la preparación social real.`;
    } else {
      warning.hidden = true;
    }

    const nextLvlNum = res.achieved < 9 ? res.achieved + 1 : null;
    const nextStats = nextLvlNum ? res.bySrl[nextLvlNum] : null;
    const missingPts = nextStats ? Math.max(0, nextStats.thresholdPoints - nextStats.points) : 0;

    const gapNotice = res.highestConsolidated > res.achieved
      ? `<p style="margin-top:.6rem;color:var(--warn)"><b>Nota sobre consolidación:</b> Aunque el nivel SRL ${res.highestConsolidated} alcanza el umbral de 7/10 puntos, el avance secuencial se detiene en <b>SRL ${res.achieved || '0'}</b> porque el <b>Nivel SRL ${res.achieved + 1}</b> tiene ${res.bySrl[res.achieved + 1].points}/10 puntos y actúa como cuello de botella.</p>`
      : '';

    $('#srl-score-card').innerHTML = `
      <div class="score-main">
        <div class="label">Nivel SRL alcanzado</div>
        <div class="big">${res.achieved || '—'}</div>
        <div class="maturity">${escapeHtml(res.maturity)}</div>
        <div style="margin-top:.65rem;font-size:.82rem;color:var(--text-dim)">Puntaje global: <b>${res.totalPoints} / ${res.totalMaxPoints}</b> (${pct(res.globalRatio)} %)</div>
      </div>
      <div class="score-side">
        ${currentSection ? `
          <span class="stage">${escapeHtml(currentSection.stage)}</span>
          <h3>Nivel SRL ${currentSection.level}: ${escapeHtml(currentSection.short)}</h3>
          <p>${escapeHtml(currentSection.description)}</p>`
        : `<h3>En fase inicial (aún no se consolida el Nivel SRL 1)</h3>
           <p>Para consolidar el Nivel SRL 1 (Identificación del Problema) se requieren al menos <b>7 de 10 puntos (70 %)</b>. Actualmente suma <b>${res.bySrl[1].points} de 10 puntos</b>.</p>`}
        ${gapNotice}
        ${nextStats ? `
          <div class="next"><b>Siguiente objetivo — Nivel SRL ${nextLvlNum} (${escapeHtml(DATA.srl.sections[nextLvlNum - 1].short)}):</b>
            ${nextStats.points}/10 puntos (${pct(nextStats.ratio)} %) frente al umbral de 7/10 (70 %).
            ${conj(missingPts, 'Falta', 'Faltan')} <b>${count(missingPts, 'punto', 'puntos')}</b> para consolidar este nivel.
            <button type="button" class="linklike go-plan no-print" data-goto="plan">Ver la ruta de maduración hasta SRL 9 →</button>
          </div>`
        : '<div class="next"><b>Máximo nivel alcanzado (SRL 9).</b> La solución ha demostrado efectividad, apropiación autónoma y condiciones para su replicabilidad social.</div>'}
      </div>`;

    const srlRows = [];
    for (let lvl = 9; lvl >= 1; lvl -= 1) {
      const st = res.bySrl[lvl];
      const sec = DATA.srl.sections[lvl - 1];
      srlRows.push(barRow(
        `SRL ${lvl} · ${sec.short}`,
        `${st.points}/10 pts (${st.yes} Sí · ${st.partial} Parc. · ${st.no} No)`,
        st.ratio,
        st.threshold,
        st.consolidated,
        `<b>${st.points}/10</b> (${pct(st.ratio)} %)`
      ));
    }
    $('#bars-srl').innerHTML = srlRows.join('');

    $('#srl-detail-grid').innerHTML = DATA.srl.sections.map((section) => {
      const st = res.bySrl[section.level];
      const chips = section.items.map((item) => {
        const ans = state.answers[item.id] || '';
        const lbl = ans ? DATA.srl.optionLabels[ans] : 'Sin responder';
        return `<span class="chip" data-answer="${ans}" title="${escapeHtml(item.text)} (${lbl})">${escapeHtml(item.id)}</span>`;
      }).join('');
      return `
        <div class="detail-block">
          <h3>SRL ${section.level}. ${escapeHtml(section.short)} <span>${st.points}/10 pts</span></h3>
          <div class="detail-items">${chips}</div>
        </div>`;
    }).join('');

    $('#report-meta-srl').innerHTML = buildReportMetaHtml();
  }

  // ═══════════════════════ Renderizado de Ruta SRL 9 ═══════════════════════

  function renderSrlPlan() {
    const onlyPending = $('#plan-only-pending').checked;
    const road = buildSrlRoadmap(state.answers);
    const totalPending = allSrlQuestions.filter((q) => state.answers[q.id] !== 'yes').length;
    const remainingLevels = road.levels.filter((lvl) => !lvl.consolidated).length;

    const stepper = road.levels.map((lvl) => {
      const stateName = lvl.consolidated ? 'done'
        : road.bottleneck && lvl.srl === road.bottleneck.srl ? 'next' : 'todo';
      return `<span class="step" data-state="${stateName}" title="SRL ${lvl.srl}: ${lvl.points}/10 puntos">${lvl.srl}</span>`;
    }).join('');

    $('#plan-summary').innerHTML = `
      <div class="road-summary">
        <div class="road-summary-head">
          <div>
            <span class="label">Situación actual</span>
            <b>SRL ${road.result.achieved || '—'}</b>
            <small>${escapeHtml(road.result.maturity)}</small>
          </div>
          <span class="road-arrow" aria-hidden="true">→</span>
          <div>
            <span class="label">Meta</span>
            <b>SRL 9</b>
            <small>Sostenibilidad y Replicabilidad</small>
          </div>
          <div class="road-counts">
            <div><b>${totalPending}</b><span>ítems por consolidar al 100 %</span></div>
            <div><b>${remainingLevels}</b><span>niveles bajo el umbral (7/10)</span></div>
          </div>
        </div>
        <div class="stepper">${stepper}</div>
        ${road.bottleneck ? `
          <p class="road-focus"><b>Prioridad actual — Nivel SRL ${road.bottleneck.srl} (${escapeHtml(road.bottleneck.name)}):</b>
            Es el nivel más bajo sin consolidar. Requiere al menos <b>7 de 10 puntos (70 %)</b> y actualmente cuenta con
            <b>${road.bottleneck.points} puntos</b>, por lo que <b>${conj(road.bottleneck.missingPoints, 'le falta', 'le faltan')} ${count(road.bottleneck.missingPoints, 'punto', 'puntos')}</b>.</p>`
        : '<p class="road-focus"><b>Todos los niveles SRL (1 a 9) superan el umbral de 7/10 puntos.</b> El proyecto ha consolidado la ruta de preparación social.</p>'}
      </div>`;

    const blocks = road.levels.map((lvl) => {
      const visible = onlyPending ? lvl.pending : lvl.items;
      if (onlyPending && !visible.length) return '';

      const isNext = road.bottleneck && lvl.srl === road.bottleneck.srl;
      const stateName = lvl.consolidated ? 'done' : isNext ? 'next' : 'todo';
      const stateLabel = lvl.consolidated ? 'Umbral superado (≥ 7/10)' : isNext ? 'Siguiente paso prioritario' : 'Pendiente';

      const leftCount = lvl.pending.length;
      let meta;
      if (lvl.consolidated && !leftCount) {
        meta = `Nivel consolidado al 100 % (10/10 puntos): las 5 preguntas están respondidas con «Sí».`;
      } else if (lvl.consolidated) {
        meta = `Umbral superado (${lvl.points}/10 puntos frente a 7/10 requeridos). ${conj(leftCount, 'Queda', 'Quedan')} ${count(leftCount, 'actividad susceptible', 'actividades susceptibles')} de pasar de «Parcialmente» o «No» a «Sí».`;
      } else {
        meta = `Necesita al menos <b>7 de 10 puntos</b> para consolidar el nivel y lleva <b>${lvl.points}</b> (${conj(lvl.missingPoints, 'falta', 'faltan')} <b>${count(lvl.missingPoints, 'punto', 'puntos')}</b>). En este nivel ${conj(leftCount, 'hay', 'hay')} ${count(leftCount, 'ítem', 'ítems')} sin respuesta «Sí».`;
      }

      const rows = visible.map((q) => {
        const ans = state.answers[q.id] || 'no';
        const done = ans === 'yes';
        const statusText = ans === 'yes' ? 'Consolidada (Sí · 2 pts)' : ans === 'partial' ? 'En avance (Parcial · 1 pto)' : 'Pendiente (No · 0 pts)';
        return `
          <div class="plan-item" data-done="${done}">
            <span class="plan-badge">${escapeHtml(q.id)}</span>
            <span class="plan-text">${escapeHtml(q.action)}<small>Pregunta: ${escapeHtml(q.text)}</small></span>
            <span class="plan-status" data-state="${ans}">${statusText}</span>
          </div>`;
      }).join('');

      return `
        <section class="road-level" data-state="${stateName}">
          <header class="road-level-head">
            <span class="road-num">SRL ${lvl.srl}</span>
            <div class="road-title">
              <span class="road-stage">${escapeHtml(lvl.stage)}</span>
              <h2>${escapeHtml(lvl.name)}</h2>
            </div>
            <span class="road-chip" data-state="${stateName}">${stateLabel}</span>
          </header>
          <p class="road-meta">${meta}</p>
          ${rows}
        </section>`;
    }).join('');

    $('#plan-list').innerHTML = blocks ||
      '<p class="empty">No hay actividades pendientes: las 45 preguntas SRL están respondidas con «Sí».</p>';

    $('#report-meta-plan').innerHTML = buildReportMetaHtml();
  }

  // ═══════════════════════ Gráficos SVG nativos para HELIX ═══════════════════════

  function buildRadarSvg(vectors) {
    const size = 360;
    const cx = size / 2;
    const cy = size / 2 + 8;
    const maxR = 118;
    const rings = [2, 4, 6, 8, 10];

    const angleFor = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const pt = (i, val10) => {
      const r = (Math.max(0, Math.min(10, val10)) / 10) * maxR;
      const a = angleFor(i);
      return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    };

    const gridPolys = rings.map((rk) => {
      const coords = [0, 1, 2, 3, 4].map((i) => pt(i, rk).map((n) => n.toFixed(1)).join(',')).join(' ');
      return `<polygon points="${coords}" fill="none" stroke="var(--border)" stroke-width="1"/>`;
    }).join('');

    const ringLabels = rings.map((rk) => {
      const y = (cy - (rk / 10) * maxR).toFixed(1);
      return `<text x="${cx + 4}" y="${y - 2}" font-size="9" fill="var(--text-dim)">${rk}</text>`;
    }).join('');

    const axes = [0, 1, 2, 3, 4].map((i) => {
      const [x, y] = pt(i, 10);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" stroke="var(--border)" stroke-width="1"/>`;
    }).join('');

    const dataCoords = vectors.map((v, i) => pt(i, v.score).map((n) => n.toFixed(1)).join(',')).join(' ');
    const dots = vectors.map((v, i) => {
      const [x, y] = pt(i, v.score);
      return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="var(--accent)" stroke="var(--surface)" stroke-width="1.5"/>`;
    }).join('');

    const labels = vectors.map((v, i) => {
      const [x, y] = pt(i, 12.3);
      const anchor = Math.abs(x - cx) < 12 ? 'middle' : x > cx ? 'start' : 'end';
      return `
        <text x="${x.toFixed(1)}" y="${y.toFixed(1)}" text-anchor="${anchor}" font-size="11" font-weight="700" fill="var(--text)">
          <tspan x="${x.toFixed(1)}" dy="0">${escapeHtml(v.short)}</tspan>
          <tspan x="${x.toFixed(1)}" dy="13" font-size="10" font-weight="600" fill="var(--accent)">${fmt1(v.score)} / 10</tspan>
        </text>`;
    }).join('');

    return `
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Gráfico radial de los 5 vectores de innovación social HELIX">
        ${gridPolys}
        ${axes}
        ${ringLabels}
        <polygon points="${dataCoords}" fill="var(--accent)" fill-opacity="0.22" stroke="var(--accent)" stroke-width="2.5"/>
        ${dots}
        ${labels}
      </svg>`;
  }

  function buildScatterSvg(elements) {
    const W = 680;
    const H = 380;
    const padL = 48;
    const padR = 24;
    const padT = 24;
    const padB = 42;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const xFor = (val10) => padL + (Math.max(0, Math.min(10, val10)) / 10) * plotW;
    const yFor = (imp10) => padT + plotH - (Math.max(0, Math.min(10, imp10)) / 10) * plotH;

    const midX = xFor(5);
    const midY = yFor(5);

    const evaluated = elements.filter((e) => e.isEvaluated);

    // Agrupar puntos con coordenadas idénticas para evitar superposición de etiquetas
    const byCoord = new Map();
    evaluated.forEach((e) => {
      const key = `${e.score10.toFixed(2)}_${e.importance10.toFixed(2)}`;
      if (!byCoord.has(key)) byCoord.set(key, []);
      byCoord.get(key).push(e);
    });

    const pointsSvg = Array.from(byCoord.values()).map((group) => {
      const first = group[0];
      const cx = xFor(first.score10).toFixed(1);
      const cy = yFor(first.importance10).toFixed(1);
      const color = first.score10 >= 5 ? 'var(--ok)' : 'var(--danger)';
      const ids = group.map((g) => g.item.id).join(', ');
      const names = group.map((g) => `${g.item.id} (${g.item.label}): Valoración ${fmt1(g.score10)}/10 · Importancia ${fmt1(g.importance10)}/10`).join('\n');
      return `
        <g>
          <title>${escapeHtml(names)}</title>
          <circle cx="${cx}" cy="${cy}" r="${group.length > 1 ? 6 : 4.5}" fill="${color}" stroke="var(--surface)" stroke-width="1.5"/>
          <text x="${Number(cx) + 6}" y="${Number(cy) + 3}" font-size="9" font-weight="600" fill="var(--text)">${escapeHtml(ids)}</text>
        </g>`;
    }).join('');

    return `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de atributos de innovación social en cuatro cuadrantes">
        <!-- Fondos de cuadrantes -->
        <rect x="${padL}" y="${padT}" width="${midX - padL}" height="${midY - padT}" fill="var(--warn-bg)" fill-opacity="0.45"/>
        <rect x="${midX}" y="${padT}" width="${padL + plotW - midX}" height="${midY - padT}" fill="var(--accent-soft)" fill-opacity="0.55"/>
        <rect x="${padL}" y="${midY}" width="${midX - padL}" height="${padT + plotH - midY}" fill="var(--surface-2)" fill-opacity="0.35"/>
        <rect x="${midX}" y="${midY}" width="${padL + plotW - midX}" height="${padT + plotH - midY}" fill="var(--surface-2)" fill-opacity="0.2"/>
        <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="none" stroke="var(--border)" stroke-width="1.5"/>
        <!-- Líneas medias (5, 5) -->
        <line x1="${midX}" y1="${padT}" x2="${midX}" y2="${padT + plotH}" stroke="var(--text-dim)" stroke-dasharray="4,4" stroke-width="1.2"/>
        <line x1="${padL}" y1="${midY}" x2="${padL + plotW}" y2="${midY}" stroke="var(--text-dim)" stroke-dasharray="4,4" stroke-width="1.2"/>
        <!-- Etiquetas de cuadrantes -->
        <text x="${padL + 10}" y="${padT + 18}" font-size="10.5" font-weight="700" fill="var(--danger)">ÁREAS DE MEJORA PRIORITARIAS (Alta imp. · Baja val.)</text>
        <text x="${padL + plotW - 10}" y="${padT + 18}" text-anchor="end" font-size="10.5" font-weight="700" fill="var(--accent)">FORTALEZAS CLAVE (Alta imp. · Alta val.)</text>
        <text x="${padL + 10}" y="${padT + plotH - 8}" font-size="10" font-weight="600" fill="var(--text-dim)">Debilidades secundarias (Menor imp. · Baja val.)</text>
        <text x="${padL + plotW - 10}" y="${padT + plotH - 8}" text-anchor="end" font-size="10" font-weight="600" fill="var(--text-dim)">Fortalezas secundarias (Menor imp. · Alta val.)</text>
        <!-- Ejes X e Y -->
        <text x="${padL + plotW / 2}" y="${H - 8}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)">Valoración obtenida en el atributo (0 a 10) →</text>
        <text x="15" y="${padT + plotH / 2}" text-anchor="middle" font-size="11" font-weight="700" fill="var(--text)" transform="rotate(-90 15 ${padT + plotH / 2})">Importancia relativa (0 a 10) →</text>
        <!-- Marcas 0, 5, 10 -->
        <text x="${padL}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10" fill="var(--text-dim)">0</text>
        <text x="${midX}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10" fill="var(--text-dim)">5,0</text>
        <text x="${padL + plotW}" y="${padT + plotH + 16}" text-anchor="middle" font-size="10" fill="var(--text-dim)">10</text>
        <text x="${padL - 8}" y="${padT + plotH + 3}" text-anchor="end" font-size="10" fill="var(--text-dim)">0</text>
        <text x="${padL - 8}" y="${midY + 3}" text-anchor="end" font-size="10" fill="var(--text-dim)">5,0</text>
        <text x="${padL - 8}" y="${padT + 6}" text-anchor="end" font-size="10" fill="var(--text-dim)">10</text>
        ${pointsSvg}
      </svg>`;
  }

  // ═══════════════════════ Renderizado de Resultados HELIX ═══════════════════════

  function renderHelixResults() {
    const hxRes = computeHelixResults(state.helix);
    const evalMode = state.helix.evalMode;
    const isComplete = evalMode === 'complete';
    const activeData = isComplete ? hxRes.complete : hxRes.rapid;

    const wModeLabels = {
      standard: 'Ponderación estándar',
      preset: `Ámbito predeterminado: ${DATA.helix.presets[state.helix.presetIndex]?.name || ''}`,
      preferences: 'Ponderación según preferencias estratégicas',
      custom: 'Ponderación personalizada',
    };

    const warning = $('#hx-warning');
    if (isComplete && hxRes.complete.answered < hxRes.complete.total) {
      warning.hidden = false;
      warning.innerHTML = `<strong>Valoración completa en curso (${hxRes.complete.answered} de ${hxRes.complete.total} atributos valorados).</strong>
        Los atributos sin responder no se incluyen aún en el promedio ponderado de su vector. Complete los 50 atributos (o cámbielos a «No aplica») para obtener el diagnóstico definitivo, o conmute a <b>Rápida (5 vectores)</b>.`;
    } else {
      warning.hidden = true;
    }

    const sortedVectors = activeData.vectors.slice().sort((a, b) => b.score - a.score);
    const strongest = sortedVectors[0];
    const weakest = sortedVectors[sortedVectors.length - 1];

    $('#hx-score-card').innerHTML = `
      <div class="score-main">
        <div class="label">Nota global HELIX (0–10)</div>
        <div class="big">${fmt2(activeData.globalScore)}</div>
        <div class="maturity">${isComplete ? 'Valoración completa (50 atributos)' : 'Valoración rápida (5 vectores)'}</div>
      </div>
      <div class="score-side">
        <span class="stage">${escapeHtml(wModeLabels[state.helix.weightMode] || 'Ponderación estándar')}</span>
        <h3>Perfil de Innovación Social del Proyecto</h3>
        <p>La nota global pondera los 5 vectores de innovación social en escala de 0 a 10.
          El vector con mayor consolidación es <b>${escapeHtml(strongest.short)} (${fmt1(strongest.score)}/10)</b>
          y la principal oportunidad de fortalecimiento se encuentra en <b>${escapeHtml(weakest.short)} (${fmt1(weakest.score)}/10)</b>.</p>
        ${isComplete ? `
          <div class="next"><b>Cobertura del diagnóstico:</b>
            ${hxRes.complete.evaluated} atributos calificados con rúbrica · ${hxRes.complete.naCount} marcados como «No aplica» · ${hxRes.complete.total - hxRes.complete.answered} pendientes.
          </div>`
        : `<div class="next"><b>Modo rápido activo:</b> Calificación directa de los 5 vectores. Para desglosar fortalezas clave y áreas de mejora en los 50 atributos, utilice las pestañas V1 a V5.</div>`}
      </div>`;

    $('#hx-radar-svg').innerHTML = buildRadarSvg(activeData.vectors);

    $('#bars-hx-vectors').innerHTML = activeData.vectors.map((vec) =>
      barRow(
        `${vec.id}. ${vec.short}`,
        `Peso en el global: ${pct(vec.weight)} %`,
        vec.score / 10,
        undefined,
        vec.score >= 5,
        `<b>${fmt1(vec.score)}</b> / 10`
      )
    ).join('');

    const completeBox = $('#hx-complete-only');
    if (!isComplete) {
      completeBox.hidden = true;
    } else {
      completeBox.hidden = false;
      $('#hx-scatter-svg').innerHTML = buildScatterSvg(hxRes.complete.elements);

      const quadDefs = [
        {
          key: 'improve',
          title: '1. Áreas de mejora prioritarias',
          sub: 'Alta importancia (≥ 5) y baja valoración (< 5): brechas críticas a intervenir',
          chipState: 'no',
        },
        {
          key: 'strength',
          title: '2. Fortalezas clave del proyecto',
          sub: 'Alta importancia (≥ 5) y alta valoración (≥ 5): ventajas diferenciales a consolidar',
          chipState: 'yes',
        },
        {
          key: 'low-weak',
          title: '3. Debilidades secundarias',
          sub: 'Menor importancia relativa (< 5) y baja valoración (< 5)',
          chipState: 'partial',
        },
        {
          key: 'low-good',
          title: '4. Fortalezas secundarias',
          sub: 'Menor importancia relativa (< 5) y alta valoración (≥ 5)',
          chipState: 'yes',
        },
      ];

      $('#hx-quadrants').innerHTML = quadDefs.map((qd) => {
        const items = hxRes.complete.elements
          .filter((e) => e.quadrant === qd.key)
          .sort((a, b) => b.importance10 - a.importance10);
        const listHtml = items.length
          ? `<div class="detail-items">${items.map((e) =>
              `<span class="chip" data-answer="${qd.chipState}" title="${escapeHtml(e.item.question)} · Valoración: ${fmt1(e.score10)}/10 · Importancia: ${fmt1(e.importance10)}/10">${escapeHtml(e.item.id)} ${escapeHtml(e.item.label)} (${fmt1(e.score10)})</span>`
            ).join('')}</div>`
          : '<p class="hint" style="margin:0">Ningún atributo evaluado en este cuadrante.</p>';

        return `
          <div class="quad-box" data-quad="${qd.key}">
            <h3>${escapeHtml(qd.title)} <span>${items.length}</span></h3>
            <small>${escapeHtml(qd.sub)}</small>
            ${listHtml}
          </div>`;
      }).join('');

      $('#hx-detail-grid').innerHTML = DATA.helix.vectors.map((vec, vIdx) => {
        const vecStats = hxRes.complete.vectors[vIdx];
        const elems = hxRes.complete.elements.filter((e) => e.item.vectorIndex === vIdx);
        const chips = elems.map((e) => {
          const ansState = !e.isAnswered ? '' : e.isNa ? 'partial' : e.score10 >= 5 ? 'yes' : 'no';
          const badge = !e.isAnswered ? '—' : e.isNa ? 'N/A' : fmt1(e.score10);
          return `<span class="chip" data-answer="${ansState}" title="${escapeHtml(e.item.label)}: ${escapeHtml(e.item.question)} (${badge})">${escapeHtml(e.item.id)} · ${escapeHtml(e.item.label)}: ${badge}</span>`;
        }).join('');
        return `
          <div class="detail-block">
            <h3>${escapeHtml(vec.id)}. ${escapeHtml(vec.short)} <span>${fmt1(vecStats.score)}/10</span></h3>
            <div class="detail-items">${chips}</div>
          </div>`;
      }).join('');
    }

    $('#report-meta-hx').innerHTML = buildReportMetaHtml();
  }

  // ═══════════════════════ Navegación ═══════════════════════

  function show(tabId) {
    const known = TABS.some((tab) => tab.id === tabId);
    const target = known ? tabId : 'guia';

    $$('.panel').forEach((panel) => { panel.hidden = panel.dataset.panel !== target; });
    $$('.tab').forEach((tab) => tab.setAttribute('aria-current', String(tab.dataset.tab === target)));

    if (target === 'resultados') renderSrlResults();
    if (target === 'plan') renderSrlPlan();
    if (target === 'hx-config') renderHelixConfigBody();
    if (target === 'hx-resultados') renderHelixResults();

    if (location.hash !== '#' + target) history.replaceState(null, '', '#' + target);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  // ═══════════════════════ Exportar / Importar JSON ═══════════════════════

  function exportJson() {
    const srlRes = computeSrlResults(state.answers);
    const hxRes = computeHelixResults(state.helix);
    const payload = {
      herramienta: 'Diagnóstico SRL y valoración HELIX (SocialTech) — UPTC',
      version: 1,
      fecha: new Date().toISOString(),
      perfil: state.profile,
      respuestasSrl: state.answers,
      helix: state.helix,
      resultado: {
        srl: {
          nivelAlcanzado: srlRes.achieved,
          nivelMasAltoConsolidado: srlRes.highestConsolidated,
          madurez: srlRes.maturity,
          puntosTotales: srlRes.totalPoints,
          respondidas: srlRes.answered,
          total: srlRes.total,
        },
        helix: {
          modoEvaluacion: state.helix.evalMode,
          modoPonderacion: state.helix.weightMode,
          notaGlobalCompleta: hxRes.complete.globalScore,
          notaGlobalRapida: hxRes.rapid.globalScore,
          atributosValorados: hxRes.complete.answered,
        },
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const slug = (state.profile.proyecto || 'diagnostico-srl-helix')
      .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'diagnostico-srl-helix';
    link.href = url;
    link.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast('Diagnóstico exportado en JSON');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const srlAnswers = parsed.respuestasSrl || parsed.respuestas || parsed.answers;
        const profile = parsed.perfil || parsed.profile;
        if (!srlAnswers && !parsed.helix) throw new Error('Formato no reconocido');

        const validSrl = {};
        if (srlAnswers && typeof srlAnswers === 'object') {
          allSrlQuestions.forEach((q) => {
            const val = srlAnswers[q.id];
            if (val === 'yes' || val === 'partial' || val === 'no') validSrl[q.id] = val;
          });
        }
        state.answers = validSrl;
        state.profile = profile && typeof profile === 'object' ? profile : {};

        if (parsed.helix && typeof parsed.helix === 'object') {
          const def = createDefaultState();
          state.helix.evalMode = parsed.helix.evalMode === 'rapid' ? 'rapid' : 'complete';
          state.helix.weightMode = ['standard', 'preset', 'preferences', 'custom'].includes(parsed.helix.weightMode)
            ? parsed.helix.weightMode
            : 'standard';
          state.helix.presetIndex = Number.isInteger(parsed.helix.presetIndex) ? parsed.helix.presetIndex : 0;
          state.helix.preferences = parsed.helix.preferences || {};
          state.helix.customVectors = Object.assign(def.helix.customVectors, parsed.helix.customVectors || {});
          state.helix.customElements = Object.assign(def.helix.customElements, parsed.helix.customElements || {});
          state.helix.rapid = Object.assign(def.helix.rapid, parsed.helix.rapid || {});
          state.helix.elements = parsed.helix.elements || {};
        }

        save();
        fillProfileForm();
        renderHelixConfigBody();
        renderAnswers();
        renderProgress();
        renderSrlResults();
        renderHelixResults();
        toast('Diagnóstico importado correctamente');
      } catch (err) {
        toast('El archivo no es un diagnóstico válido');
        console.warn(err);
      }
    };
    reader.readAsText(file);
  }

  function fillProfileForm() {
    $$('#profile-form [name]').forEach((field) => {
      field.value = state.profile[field.name] || '';
    });
  }

  // ═══════════════════════ Tema ═══════════════════════

  function applyTheme(theme) {
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    else document.documentElement.removeAttribute('data-theme');
    $('[data-theme-icon]').textContent = theme === 'dark' ? '☾' : theme === 'light' ? '☀' : '◐';
  }

  // ═══════════════════════ Arranque ═══════════════════════

  function init() {
    load();

    buildTabs();
    buildGuide();
    buildSrlPanels();
    buildHelixConfigPanel();
    buildHelixRapidPanel();
    buildHelixCompletePanels();
    buildGlossary();
    fillProfileForm();
    renderAnswers();
    renderProgress();

    applyTheme(localStorage.getItem(THEME_KEY));

    // Eventos de cambio en cuestionarios SRL y HELIX
    document.addEventListener('change', (event) => {
      const input = event.target;

      // Preguntas SRL
      if (input.matches('.qcard .choice input[type="radio"]')) {
        const id = input.name.replace(/^q-/, '');
        state.answers[id] = input.value;
        save();
        const card = $(`.qcard[data-question="${id}"]`);
        if (card) card.dataset.answer = input.value;
        renderProgress();
        return;
      }

      // Filtro solo pendientes SRL
      if (input.matches('[data-filter-pending]')) {
        applySrlSectionFilter(Number(input.dataset.filterPending));
        return;
      }

      // Modo de ponderación HELIX
      if (input.name === 'hx-wmode') {
        state.helix.weightMode = input.value;
        save();
        renderHelixConfigBody();
        renderProgress();
        return;
      }

      // Selector de ámbito predeterminado HELIX
      if (input.id === 'hx-preset-select') {
        state.helix.presetIndex = Number(input.value);
        save();
        renderHelixWeightPreview();
        renderProgress();
        return;
      }

      // Preferencias HELIX (pref-1..pref-8)
      if (input.name && input.name.startsWith('pref-')) {
        state.helix.preferences[input.name] = input.value;
        save();
        renderHelixWeightPreview();
        renderProgress();
        return;
      }

      // Atributos valoración completa HELIX (50 elementos)
      if (input.name && input.name.startsWith('hx-V')) {
        const itemId = input.name.replace(/^hx-/, '');
        const val = input.value === 'na' ? 'na' : Number(input.value);
        state.helix.elements[itemId] = val;
        // Al responder elementos de la valoración completa, activar vista completa por defecto
        state.helix.evalMode = 'complete';
        $$('input[name="hx-eval-mode"]').forEach((r) => { r.checked = r.value === 'complete'; });
        save();
        const card = $(`.hcard[data-helix-item="${itemId}"]`);
        if (card) card.dataset.answered = val === 'na' ? 'na' : 'true';
        renderProgress();
        return;
      }

      // Conmutador de modo en resultados HELIX
      if (input.name === 'hx-eval-mode') {
        state.helix.evalMode = input.value;
        save();
        renderHelixResults();
      }
    });

    // Entradas numéricas / deslizadores de HELIX
    document.addEventListener('input', (event) => {
      const input = event.target;

      if (input.matches('[data-rapid-range]')) {
        const vecId = input.dataset.rapidRange;
        const val = Number(input.value);
        state.helix.rapid[vecId] = val;
        state.helix.evalMode = 'rapid';
        $$('input[name="hx-eval-mode"]').forEach((r) => { r.checked = r.value === 'rapid'; });
        const num = $(`[data-rapid-num="${vecId}"]`);
        if (num) num.value = val;
        save();
        return;
      }

      if (input.matches('[data-rapid-num]')) {
        const vecId = input.dataset.rapidNum;
        const val = Math.max(0, Math.min(10, Number(input.value) || 0));
        state.helix.rapid[vecId] = val;
        state.helix.evalMode = 'rapid';
        $$('input[name="hx-eval-mode"]').forEach((r) => { r.checked = r.value === 'rapid'; });
        const range = $(`[data-rapid-range="${vecId}"]`);
        if (range) range.value = val;
        save();
        return;
      }

      if (input.matches('[data-custom-vec]')) {
        const vecId = input.dataset.customVec;
        state.helix.customVectors[vecId] = Math.max(0, Number(input.value) || 0);
        save();
        renderHelixWeightPreview();
        renderProgress();
        return;
      }

      if (input.matches('[data-custom-elem]')) {
        const elemId = input.dataset.customElem;
        state.helix.customElements[elemId] = Math.max(0, Number(input.value) || 0);
        save();
        renderProgress();
      }
    });

    // Saltos a pendientes
    document.addEventListener('click', (event) => {
      const jumpSrl = event.target.closest('[data-jump-srl]');
      if (jumpSrl) {
        jumpToPendingSrl(Number(jumpSrl.dataset.jumpSrl));
        return;
      }
      const jumpHx = event.target.closest('[data-jump-hx]');
      if (jumpHx) {
        jumpToPendingHelix(Number(jumpHx.dataset.jumpHx));
      }
    });

    // Perfil
    $('#profile-form').addEventListener('input', (event) => {
      const field = event.target;
      if (!field.name) return;
      state.profile[field.name] = field.value;
      save();
    });

    // Navegación por pestañas y botones data-goto
    $('#tabs').addEventListener('click', (event) => {
      const tab = event.target.closest('.tab');
      if (tab) show(tab.dataset.tab);
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('[data-goto]');
      if (button) show(button.dataset.goto);
    });
    window.addEventListener('hashchange', () => show(location.hash.slice(1) || 'guia'));

    // Botones de impresión y exportación
    $('#btn-print-srl').addEventListener('click', () => window.print());
    $('#btn-print-plan').addEventListener('click', () => window.print());
    $('#btn-print-hx').addEventListener('click', () => window.print());
    $('#btn-export').addEventListener('click', exportJson);
    $('#btn-export-hx').addEventListener('click', exportJson);
    $('#btn-import-trigger').addEventListener('click', () => $('#btn-import').click());
    $('#btn-import').addEventListener('change', (event) => {
      const file = event.target.files && event.target.files[0];
      if (file) importJson(file);
      event.target.value = '';
    });
    $('#plan-only-pending').addEventListener('change', renderSrlPlan);

    // Tema
    $('#theme-toggle').addEventListener('click', () => {
      const current = localStorage.getItem(THEME_KEY);
      const next = current === 'dark' ? 'light' : current === 'light' ? '' : 'dark';
      if (next) localStorage.setItem(THEME_KEY, next);
      else localStorage.removeItem(THEME_KEY);
      applyTheme(next);
    });

    // Reinicio con doble clic de confirmación
    const reset = $('#btn-reset');
    let armed = false;
    reset.addEventListener('click', () => {
      if (!armed) {
        armed = true;
        reset.textContent = 'Pulse de nuevo para confirmar el borrado';
        setTimeout(() => { armed = false; reset.textContent = 'Borrar todas las respuestas'; }, 5000);
        return;
      }
      state = createDefaultState();
      localStorage.removeItem(STORAGE_KEY);
      fillProfileForm();
      renderHelixConfigBody();
      renderAnswers();
      renderProgress();
      armed = false;
      reset.textContent = 'Borrar todas las respuestas';
      toast('Diagnóstico SRL y HELIX reiniciado');
      show('guia');
    });

    show(location.hash.slice(1) || 'guia');
  }

  document.addEventListener('DOMContentLoaded', init);
})();
