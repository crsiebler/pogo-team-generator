# PRD: Team Analysis Rebase and Standalone Analysis Panel

## Introduction

Rebase the current Team Analysis Summary branch onto `main`, preserve the battle-format and new genetic algorithm behavior introduced on `main`, and ship a redesigned analysis experience that lives in its own standalone column instead of inside the Generated Team panel. The new analysis panel should match the existing blue card styling direction used by the other top-level panels, remain format-aware, and help users quickly evaluate whether a generated team is strong enough to keep or revise.

## Goals

- Rebase the analysis branch onto `main` without regressing battle format support or format-aware generation behavior.
- Reincorporate analysis data so it reflects the same format-aware, role-based threat pool used by the current genetic algorithm.
- Move Team Analysis Summary into a dedicated third column alongside Team Configuration and Generated Team.
- Add consistent green / yellow / red value coding for summary statistics, contribution categories, and per-Pokemon metrics.
- Add section-local legends that explain each metric and its expected baseline ranges.

## User Stories

### US-001: Rebase analysis branch onto main without losing current platform behavior

**Description:** As a developer, I want the analysis branch rebased onto `main` so that the new analysis UI can ship on top of the latest battle format and generation flow.

**Acceptance Criteria:**

- [ ] Current branch is rebased onto `main` and conflicts are resolved without removing `main`'s battle format support.
- [ ] `components/organisms/TeamManager/TeamManager.tsx` preserves `main`'s format selection, eligible Pokemon loading, and generate request payload shape.
- [ ] `app/api/generate-team/route.ts` preserves `main`'s `formatId` validation, eligibility checks, and format-aware error handling.
- [ ] Generated team response continues to include `team` and `fitness`, and also includes a top-level `analysis` payload.
- [ ] Typecheck passes.

### US-002: Make generation analysis match the current genetic algorithm inputs

**Description:** As a user, I want the analysis to reflect the same threat pool and format context used by the genetic algorithm so the explanations match the generated result.

**Acceptance Criteria:**

- [ ] Threat analysis accepts `formatId` and uses the same format-aware threat universe as the current genetic algorithm.
- [ ] Threat analysis uses the current role-based or equivalent GA-aligned threat pool instead of the old global top-50-only model.
- [ ] Shield scenario analysis uses format-aware matchup data.
- [ ] Per-Pokemon contribution analysis is derived from the same format-aware threat entries used by the rest of the analysis.
- [ ] Analysis output remains additive and does not introduce unnecessary extra simulation passes.
- [ ] Typecheck passes.

### US-003: Render Team Analysis Summary in its own top-level column

**Description:** As a user, I want the analysis panel in its own column so I can inspect team output and explainability side by side.

**Acceptance Criteria:**

- [ ] Desktop layout renders three sibling columns: Team Configuration, Generated Team, and Team Analysis Summary.
- [ ] Team Analysis Summary is implemented as a new `AnalysisPanel` organism.
- [ ] `AnalysisPanel` is no longer rendered inside `ResultsPanel`.
- [ ] The new analysis panel uses matching blue top-level card styling consistent with the other two columns.
- [ ] The layout remains usable on mobile and smaller breakpoints, with columns stacking cleanly.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-004: Preserve accordion drill-down behavior in the standalone analysis panel

**Description:** As a user, I want the analysis details to stay collapsible so I can scan quickly and only expand the sections I need.

**Acceptance Criteria:**

- [ ] The standalone analysis panel contains accordion sections for Summary Statistics, Fitness Contribution Categories, and Per-Pokemon Contribution.
- [ ] All accordion sections remain collapsed by default.
- [ ] Accordion headers keep accessible semantics with `button`, `aria-expanded`, `aria-controls`, and `role="region"` for panels.
- [ ] Keyboard navigation with ArrowUp, ArrowDown, Home, and End continues to work across accordion headers.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-005: Add baseline-aware color coding to summary statistics

**Description:** As a user, I want summary metric values color coded by rating quality so I can spot strengths and weaknesses immediately.

**Acceptance Criteria:**

- [ ] Summary Statistics values are color coded green for strong, yellow for average, and red for weak.
- [ ] `Threat Handling` uses default thresholds: green `>= 70%`, yellow `50-69%`, red `< 50%`.
- [ ] `Shield Stability` uses default thresholds: green `>= 70%`, yellow `50-69%`, red `< 50%`.
- [ ] `Core-Breaker Risk` maps `Low` to green, `Moderate` to yellow, and `High` to red.
- [ ] `Overall Fitness` is color coded using a defined normalized interpretation that is documented in the legend and consistent with the displayed scale.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-006: Add baseline-aware color coding to fitness contribution categories

**Description:** As a user, I want category contribution values color coded so I can tell whether each category is helping, neutral, or hurting team quality.

**Acceptance Criteria:**

- [ ] Fitness Contribution Categories values are color coded green / yellow / red.
- [ ] Positive contribution values display as green when clearly favorable.
- [ ] Near-neutral values display as yellow.
- [ ] Clearly negative values display as red.
- [ ] Category labels and definitions remain visible without exposing internal formulas or weights.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-007: Add baseline-aware color coding to per-Pokemon contribution metrics

**Description:** As a user, I want each Pokemon's contribution metrics color coded so I can identify weak links and irreplaceable team members faster.

**Acceptance Criteria:**

- [ ] Per-Pokemon values for threats handled, coverage added, and high-pressure relief are color coded green / yellow / red.
- [ ] Per-Pokemon rating uses relative interpretation against team totals or the evaluated threat pool rather than fixed raw global numbers.
- [ ] Replacement risk remains visible and uses green / yellow / red mapping for low / moderate / high risk.
- [ ] Existing rationale text remains present and readable.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

### US-008: Add a full legend with metric descriptions and expected ranges

**Description:** As a user, I want each statistic explained with expected ranges so I can understand whether the team is meeting baseline standards.

**Acceptance Criteria:**

- [ ] Each accordion section includes its own local legend instead of relying on one shared panel-wide legend.
- [ ] The Summary Statistics section legend includes the expected range for each summary statistic, including good / average / weak bands where applicable.
- [ ] The Fitness Contribution Categories section legend includes descriptions and expected interpretation for contribution bands.
- [ ] The Per-Pokemon Contribution section legend includes descriptions for per-Pokemon metrics and how relative grading is determined.
- [ ] The legend text is concise enough to scan but detailed enough for first-time users.
- [ ] Typecheck passes.
- [ ] Verify in browser using dev-browser skill.

## Functional Requirements

- FR-1: The system must rebase the current analysis branch onto `main` while preserving `main`'s battle format support and format-aware generation flow.
- FR-2: The generate-team route must continue to accept `formatId`, validate battle format eligibility, and return analysis data in the same response.
- FR-3: The analysis pipeline must accept `formatId` and evaluate threats using the same format-aware, GA-aligned threat pool as the current genetic algorithm.
- FR-4: Analysis sections must continue to be computed in `lib/analysis/*` from existing threat-analysis outputs where possible.
- FR-5: The top-level page layout must render three equal-width sibling panels on large screens.
- FR-6: The Team Analysis Summary panel must be visually separate from the Generated Team panel.
- FR-7: The Team Analysis Summary panel must match the blue styling direction used by the other top-level panels.
- FR-7a: The Team Analysis Summary panel must be implemented in a dedicated organism named `AnalysisPanel`.
- FR-8: The analysis panel must include accordion sections for Summary Statistics, Fitness Contribution Categories, and Per-Pokemon Contribution.
- FR-9: All accordion sections must remain collapsed by default.
- FR-10: Summary statistic values must support green / yellow / red quality states based on documented thresholds.
- FR-11: Contribution category values must support green / yellow / red quality states based on positive, near-neutral, and negative contribution bands.
- FR-12: Per-Pokemon contribution metrics must support green / yellow / red quality states using relative grading rather than fixed universal raw thresholds.
- FR-13: Each accordion section must include a legend that describes its metrics and lists the expected target range or interpretation band.
- FR-14: The UI must degrade gracefully when `analysis` or `fitness` is missing.
- FR-15: All updated UI must remain usable on mobile and desktop.

## Non-Goals

- Replacing the current genetic algorithm with a different optimization model.
- Exposing raw scoring formulas, category weights, or internal coefficients in the UI.
- Adding new analysis sections beyond Summary Statistics, Fitness Contribution Categories, and Per-Pokemon Contribution.
- Building historical comparison, export, or persistence for analysis results.
- Changing authentication, authorization, or unrelated application flows.

## Design Considerations

- Preserve the existing visual language of the app while moving all three top-level panels toward a consistent blue-card presentation.
- Keep the analysis panel scannable: headline guidance should be visible immediately, with deeper content inside accordions.
- Use consistent value treatments across all sections so green, yellow, and red mean the same quality gradient everywhere.
- Ensure the three-column layout collapses cleanly on smaller screens without making accordion content cramped or unreadable.

## Technical Considerations

- Merge `main`'s `generatedTeam` object shape and `formatId` flow with the current branch's `fitness` and `analysis` state.
- Update `lib/types.ts` to preserve `main`'s format-aware generation types while keeping the analysis response contract.
- Implement analysis rendering in `components/organisms/AnalysisPanel/AnalysisPanel.tsx` rather than extending `components/organisms/ResultsPanel/ResultsPanel.tsx`.
- Update `lib/analysis/threatAnalysis.ts`, `lib/analysis/shieldScenarioAnalysis.ts`, and `lib/analysis/pokemonContributionAnalysis.ts` so they accept `formatId` and remain aligned with the current GA threat pool.
- Overall Fitness color grading should use algorithm-normalized bands because acceptable raw scores can shift by meta and fitness model.
- Preserve adapter-thin API and UI layers by keeping analysis computation in `lib/analysis/*`.
- Update route, organism, and analysis tests together so response contract and rendering behavior do not drift.

## Success Metrics

- Users can compare configuration, generated output, and analysis side by side without opening nested content inside the Generated Team panel.
- The displayed analysis matches the selected battle format and the current genetic algorithm threat model.
- Users can identify strong, average, and weak areas from color coding without reading the full legend first.
- No regression in existing generate-team flow for battle formats, anchor validation, or generated-team rendering.
- All affected tests pass and the UI verifies cleanly in browser.

## Open Questions

- Confirm the final algorithm-normalized Overall Fitness thresholds once post-rebase score distributions have been observed in browser across a few representative formats.
