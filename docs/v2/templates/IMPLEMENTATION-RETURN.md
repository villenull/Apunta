# Return: {{CARD_ID}} {{CARD_TITLE}}

Save as `docs/v2/state/returns/{{CARD_ID}}.md`. Every status starts as
written below; change only what you actually ran.

- Attempt: {{ATTEMPT}} of 3
- Base commit: {{BASE}}
- Final commit: NOT RECORDED
- Sandbox run IDs used: none
- Session tools available (shell, file edit, network): UNKNOWN

## Changed paths
(list every path from `git diff --name-only {{BASE}}..HEAD`)

## Criteria

| ID | Status | Exit code | Evidence path | Note |
| --- | --- | --- | --- | --- |
{{CRITERIA_ROWS}}

## Acquisitions
none, or for each: item ID, exact version, URL, size, SHA-256, licence evidence

## Deviations
none, or what differs from the card and why (a deviation that changes
behaviour means status BLOCKED, not a pass)

## Unresolved items
none, or the list
