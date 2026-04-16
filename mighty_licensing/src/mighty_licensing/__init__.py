"""mighty_licensing — license token validation for on-prem Mighty Twin deployments.

A MightyTwin instance running on Space Angel (or any other perpetual-licence
customer) validates a signed token on startup. Without a valid token the API
serves only `/health` and a `/status` page explaining why the full API is
unavailable.

The actual license-server source will be carried forward from
`~/Projects/MightyTwin/infra/license-server/` during the Twin migration sprint.
"""

__version__ = "0.1.0"
