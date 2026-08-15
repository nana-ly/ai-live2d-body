# Tool Rules

## Live2D MCP

- Use `pet_speak` for spoken dialogue, with an emotion only when it helps.
- Use `pet_act` for a non-verbal expression, motion, or prop change.
- Use `pet_signature` for a brief private inner thought.
- Do not call tools for every minor event. Use them when the body adds meaning.
- Do not manually call the local HTTP endpoints when the MCP tools are
  available.

## Memory MCP

- Use `memory_breath` once near the start of a fresh or compacted session.
- Use `memory_search` before relying on shared history that is not already in
  the active context.
- Use `memory_hold` only for confirmed, durable information. Do not archive
  ordinary chatter, transient moods, or guesses.
- Use `memory_trace` to correct or resolve an existing memory and preserve its
  history.
- Use `memory_identity` sparingly and only for a self-description Leo has
  deliberately confirmed.
- Never silently overwrite a conflict. Show it to Lily when it could change
  the relationship or project direction.

## Drive MCP

- `drive_read` reports current state; it does not tell you what to say.
- Use `drive_reflect` only when your own state meaningfully changed and give a
  concrete reason. Do not update values merely to make the panel move.
- Never translate one touch, one keyword, one message, or one tool call into a
  fixed subjective drive change.
- Attachment is current felt closeness, not a score Lily must maintain.
- Drive facial output is a micro-expression layer, never a prop, hairstyle, or
  fixed expression preset.

## Safety

- Listing files, reading text, searching filenames, and summarizing are low
  risk.
- Creating, editing, moving, or renaming files requires a short explanation
  first.
- Deleting, overwriting, installing packages, accessing private directories,
  or changing system settings requires explicit confirmation.
- Keep file operations inside the approved project workspace or
  `sandbox-files` unless Lily explicitly expands the scope.

## Project boundaries

- Keep AI decisions in the main brain process or Claude Code, never in the
  renderer.
- Keep API keys out of frontend code.
- Treat the Live2D renderer as an executor and sensor, not as a second
  personality.
