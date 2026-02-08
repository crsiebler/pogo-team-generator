# AGENTS.md for data/simulations/

## Core Concepts

This directory contains battle simulation CSV files with matchup data between Pokemon. Files follow naming: `{pokemon_name}_{moveset}_{shields}.csv` (e.g., `charizard_fireblast_dragonclaw_1.csv`).

CSV format includes:

- `opponent`: Opposing Pokemon (may include moveset)
- `battle_rating`: Score 0-1000 for performance
- Additional metadata columns as needed

## Data Safety & Loading

Use typed loaders from `lib/data/` for safe ingestion. Validate for uniqueness and reference validity—never inject directly. Simulations optimize team fitness; if empty, fallback to ranking data only.

## Architectural Rules

Agents working here: Ensure data updates via loaders, validate new entries, and maintain type safety. Focus on accurate matchup evaluation for genetic algorithms.
