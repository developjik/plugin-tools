# Cursor Target Notes

When the UnifiedSpec lists `cursor` in `targets`:

- Emit only `skills`, `hooks`, and `mcpServers` for the Cursor surface. Drop `agents` and `commands` with warnings in the current v1 scope.
- Normalize hook event names to camelCase, for example `PreToolUse` to `preToolUse`.
- Write MCP configuration to `mcp.json` at the plugin root, not `.mcp.json`.
- Tell end users to install from Cursor Agent chat with `/add-plugin <plugin-name>`.
