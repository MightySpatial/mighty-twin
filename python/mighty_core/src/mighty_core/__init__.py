"""mighty_core — shared config, logging, errors, auth primitives.

This package is intentionally small at day one. As code is extracted from
MightyTwin (`~/Projects/MightyTwin/apps/api/app/`) into the shared tree,
modules land here first if they are backend-agnostic and not coupled to a
specific database dialect or domain.
"""

__version__ = "0.1.0"
