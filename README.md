# auto-model

A Claude Code mod that chooses the model for each prompt. Before a prompt is sent, a quick Haiku call rates how hard it is, and the turn then runs on Haiku, Sonnet or Opus accordingly.

## Install

At the prompt of a terminal session:

```
/plugin install auto-model --marketplace ecosys-technology/auto-model
```

From a shell:

```
claude plugin install auto-model --marketplace ecosys-technology/auto-model
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `ecosys-technology/auto-model`, then Add plugin.

Answer `y` to add the marketplace, then pick a scope. The mod is active right away.

## How it works

- Each prompt you type is classified by Haiku against a short rubric and answered with one word: `haiku`, `sonnet` or `opus`. When it is torn between two, it picks the stronger one.
- Every request in that turn is sent to the chosen model. Subagents keep their own models.
- Short follow-ups (under 40 characters, such as "yes, go ahead") keep the previous pick and skip the classification.
- If the classification fails or times out (6 seconds), your session's own model is used, so a prompt is never blocked.
- The status line shows the pick, for example `route: sonnet`.

## The `/route` command

| Command | Effect |
| --- | --- |
| `/route` | Show the current setting and the last pick |
| `/route auto` | Choose per prompt (default) |
| `/route haiku`, `/route sonnet`, `/route opus` | Always use that model |
| `/route off` | Stop routing; your `/model` choice applies |

The setting is kept across sessions.

## Trade-offs

- Switching models discards the cached conversation, so the first request after a switch re-reads the whole context. In a long conversation, frequent switching can cost more than it saves. Pin a model with `/route` to avoid it.
- Each routed prompt costs one small Haiku call, adding about a second before the turn starts.
- The model IDs are fixed at the top of `hooks/register.ts` (`MODELS`). Change them there if your account or provider uses different ones. The rubric that decides the tier is `RUBRIC` in the same file.

## Development

```
claude plugin validate .
claude plugin test .
```
