# Triage Labels

The skills speak in terms of five canonical triage roles. In a local-markdown
tracker, the "label" is the value of the `Status:` line at the top of each issue
file.

| Canonical role   | `Status:` value   | Meaning                                  |
| ---------------- | ----------------- | ---------------------------------------- |
| `needs-triage`   | `needs-triage`    | Needs to be evaluated                    |
| `needs-info`     | `needs-info`      | Waiting on more information              |
| `ready-for-agent`| `ready-for-agent` | Fully specified, ready for an AFK agent  |
| `ready-for-human`| `ready-for-human` | Requires human implementation            |
| `wontfix`        | `wontfix`         | Will not be actioned                     |
| (terminal)       | `done`            | Implemented and reviewed; archived       |

Only issues with `Status: ready-for-agent` are picked up by the Ralph autonomous
loop. Anything `ready-for-human`, `needs-info`, or `needs-triage` waits for you.
