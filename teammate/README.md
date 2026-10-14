# Teammate inbox — customer WhatsApp messages for Claude Code

A WhatsApp listener (a spare number, linked like WhatsApp Web) sits in Mercon's customer group
and records what is said. Claude Code sessions in this repo read it with `teammate/inbox.py`
(skill: `.claude/skills/whatsapp-inbox`), so you can say "fix what the customer reported
yesterday" and the session finds it.

The listener itself lives in the Mesiri repo (`teammate/listener`, deployed on Mesiri's VPS) and
serves several projects. `TEAMMATE_PROJECT=mercon` (set in `.claude/settings.json`) keeps every
command in this repo to Mercon's groups only.

- `inbox.py` is a copy of Mesiri's `teammate/inbox.py`. Standard library only, Python 3.9+.
- Needs `TEAMMATE_TOKEN` in your environment (ask the owner; never commit it).
- Read-only here: Mercon has no team group yet, and customer groups can never be posted to.

```bash
python teammate/inbox.py status
python teammate/inbox.py recent --hours 48
python teammate/inbox.py search trip date
python teammate/inbox.py show 1432 --around 15
```
