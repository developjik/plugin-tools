---
description: Create a Claude and Codex marketplace root.
argument-hint: "<root> [--owner-name <name>] [--owner-email <email>]"
allowed-tools: ["AskUserQuestion", "Bash", "Read"]
---

Use this command to prepare a directory that will hold generated plugins.

1. If arguments are missing, ask for the root path, marketplace id, display name, owner name, and owner email.
2. Run the marketplace initializer with those values.
3. If a catalog already exists, ask before using the force option.
4. Summarize the Claude and Codex catalog paths. Do not show raw JSON.
