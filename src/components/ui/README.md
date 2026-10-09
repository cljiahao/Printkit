# ui

Local shadcn primitives used by Printkit: `badge`, `button`, `input`, `label`,
`popover`, `select`, `switch`, `table` and `tooltip`.

Feature components import these directly by name. `select` supports history
location assignment; `switch` controls bridge mode; `popover` supports printer
setup explanations. Account menus and help drawers use the shared Merqo UI
package rather than unused local copies.

These primitives remain generator-managed. Put product behavior in feature
components instead of changing generated structure.

[Parent components](../README.md)
