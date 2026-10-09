# ui

Local shadcn primitives used by Printkit: `badge`, `button`, `input`, `label`,
`select`, `switch` and `tooltip`.

Feature components import these directly by name. `select` supports history
location assignment; `switch` controls bridge mode; printer setup explanations use shared InfoTooltip. Account menus and help drawers use the shared Merqo UI
package rather than unused local copies.

These primitives remain generator-managed. Put product behavior in feature
components instead of changing generated structure.

[Parent components](../README.md)
