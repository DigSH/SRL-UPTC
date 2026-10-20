# CLAUDE.md

This file provides guidance when working with code in `SRL-UPTC` (SocialTech).

## What this is

Web application (**SocialTech / SRL-UPTC**) built on the same static, zero-dependency architecture as
`TRL-UPTC` (`../../TRL/TRL-UPTC/`). It integrates two complementary diagnostic instruments:
1. **Societal Readiness Level (SRL 1–9)**: 45 questions (5 per level) from `../Nivel SRL.html` with a
   3-option scale (`No = 0`, `Parcialmente = 1`, `Sí = 2`) and consolidation threshold `>= 7/10` (70%).
2. **HELIX Social Innovation Assessment**: 5 vectors and 50 attributes from
   `../../HELIX/Copia_de_Helix_221004_pro (1).xlsm`, supporting both Rapid Valuation (5 vectors 0–10)
   and Complete Valuation (50 attributes with 5-level rubric + "Not applicable" weight renormalization),
   plus all 4 weighting modes (`standard`, 19 `preset` scopes, 8 `preferences`, and `custom`).

## Commands

```bash
python -m http.server 8000        # serve locally, open http://localhost:8000
node tools/verify.js              # run the 44-assertion verification suite
python tools/build_data.py        # regenerate assets/data.js from ../Nivel SRL.html and ../../HELIX/*.xlsm
python tools/build_brand.py       # regenerate assets/img/uptc-vie-cabezote.png
```

## Invariants that matter

1. **SRL Scoring (`computeSrlResults` & `buildSrlRoadmap`)**:
   - 9 levels, 5 questions per level, options `no` (0), `partial` (1), `yes` (2) → max 10 points/level.
   - Threshold is `points >= 7` (`ratio >= 0.70`).
   - `achieved` follows the sequential rule of `Nivel SRL.html` (highest consecutive level from 1 upward
     with `>= 7` points; `0` if level 1 has `< 7` points). `highestConsolidated` scans 9 → 1 and
     `bottleneck` identifies the lowest unconsolidated level.
2. **HELIX Weighting (`computeHelixWeights`)**:
   - Exact replica of sheet `ponderacion` and `P1R1!AW46:AX99`.
   - Note on source Excel: in `ponderacion!V7` ("Innovación tecnológica y empresarial"), the original
     workbook author accidentally left a literal `0` instead of `=+predeterminadas!F33`. `build_data.py`
     reads column `V` (`V8:V67`) directly so preset index 13 works properly.
   - Preference mode replicates `AVERAGEIF(AK:AR, ">0")` with fallback to standard weight `I` when no
     active preference affects that row.
3. **HELIX Scoring (`computeHelixResults`)**:
   - Rapid mode: weighted sum of the 5 vector scores (`P1R1!AV16`).
   - Complete mode: 50 elements with rubric values `[1, 0.75, 0.5, 0.25, 0]`. When an element is marked
     `'na'` (*No aplica*), it counts as answered (`H=1`) but its active weight in the vector is `0`
     (`D=0`), re-normalizing the remaining evaluated elements of that vector (`F_row = E_row / E_sum`).
4. **Generated data**: Never hand-edit `assets/data.js`; update `tools/build_data.py` and re-run.
