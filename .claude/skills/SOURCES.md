# Vendored Claude Code skills

Third-party skills copied into this project by hand after reviewing every file. They were not
installed with `npx skills`. To update one, re-clone the repo, review the diff, and copy the folder again.

| Skill                   | Upstream                                                                                              | Commit     | License    |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ---------- | ---------- |
| `frontend-design`       | [anthropics/skills](https://github.com/anthropics/skills) `skills/frontend-design/`                   | `e4bb5d9`  | Apache-2.0 |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) `skills/web-design-guidelines/` | `1a2c79d`  | MIT        |
| `ui-ux-pro-max`         | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) `.claude/skills/ui-ux-pro-max/` | `ed766d3` | MIT |
| `design-taste-frontend-v1` | [Leonxlnx/taste-skill-classics](https://github.com/Leonxlnx/taste-skill-classics) `skills/taste-skill-v1/` | `5e08c93` | MIT |

Full SHAs: `e4bb5d960d87126ff3b3a8af1a104b7db67560ba`, `1a2c79d4e6c4a2283dc2c614b6538cbe1ed5ca62`,
`ed766d3bf62f32c8d27762ad49abdc3a4744c84f`, `5e08c9383dc4ad7fc0df70e1ac8cfa09ec356305`.

## Local changes

- `ui-ux-pro-max/SKILL.md`: upstream calls the script as
  `"${CLAUDE_PLUGIN_ROOT}/.claude/skills/ui-ux-pro-max/scripts/search.py"`, which only works as a
  plugin install. Changed to `.claude/skills/ui-ux-pro-max/scripts/search.py`, run from the repo root.
- `ui-ux-pro-max/scripts/tests/` was left out (upstream test suite, not needed at runtime).
- `ui-ux-pro-max/LICENSE` was copied from the upstream repo root.
- `design-taste-frontend-v1`: only `SKILL.md` (unchanged) plus the repo-root `LICENSE`. The
  Codex-only `agents/openai.yaml` was left out.

## Notes

- `web-design-guidelines` downloads its rules on every run from
  `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`
  (unpinned `main`), so its behaviour can change upstream.
- `ui-ux-pro-max` needs Python 3 and uses only the standard library. Its scripts make no network
  calls and start no other programs. They write files only with `--persist` / `--preview`
  (into `design-system/`).
- `design-taste-frontend-v1` is opt-in (`disable-model-invocation: true`): it runs only when
  called as `/design-taste-frontend-v1`. It's opinionated: no Inter, Framer Motion,
  Phosphor/Radix icons. Weigh that against FUTURIA's existing design before applying it.
  The current taste-skill (v2.5.1, `Leonxlnx/taste-skill`) was not installed: it is ~37 MB with
  1.6 MB of unreviewed Node scripts, and a Stop hook that runs headless Chrome and can block turns.
- `.claude/skills` is in `.prettierignore` so `pnpm format:check` (CI) doesn't reformat vendored files.
