# Plugin Eval Measurement Notes

## Current Baseline

- Static Plugin Eval report without observed usage is the structural gate for plugin quality.
- Observed benchmark usage is the full `codex exec` session cost, not the active plugin loading cost.
- The observed input token count includes the provisioned plugin copy, benchmark prompt, model context, and any workspace exploration done by Codex.
- Do not compare observed benchmark input tokens directly to `estimated_active_tokens` as if both measured the same boundary.

## Interpreting Drift

`observed-usage-estimate-drift` is expected while Plugin Eval uses whole-session Codex usage as the observed sample. Treat it as a benchmark-cost signal, not as evidence that the plugin trigger or skill files are too large.

Use these separate gates:

- Structural gate: `plugin-eval analyze . --format markdown`
- Measured-run gate: use `--observed-usage` only after collecting at least 5 representative successful samples
- Benchmark validity gate: at least 5 representative successful samples before treating observed usage as stable

## Next Measurement Work

Collect additional samples only when comparing prompt or packaging changes. Keep `.plugin-eval/runs/` out of durable plugin state; retain a usage JSONL only after it has enough successful samples to act as a measured baseline.
