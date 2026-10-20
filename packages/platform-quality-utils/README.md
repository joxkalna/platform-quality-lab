# Platform Quality Utils

Reusable quality engineering helpers for the lab.

This package is intentionally small during Phase 11. It should contain generic utilities that can be shared across scripts and services, such as manifest validation helpers, trend parsing helpers, or notification/report formatting helpers.

Avoid adding service-specific logic, Pact provider verification defaults, CI orchestration, or UI code here. Those belong in more focused packages or service directories.
