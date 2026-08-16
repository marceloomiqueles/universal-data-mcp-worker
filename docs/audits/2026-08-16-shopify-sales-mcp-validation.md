# Shopify Sales MCP Validation

Date: 2026-08-16

## Implemented surface

The deployed Worker contains one new read-only MCP tool, `get_sales`. It reads the Shopify-owned D1 sales model directly and never calls Shopify or the Admin API. Existing `list_integrations` and `get_inventory` behavior remains unchanged.

The tool accepts either an explicit UTC start/end range or one bounded merchant-timezone period. It returns current non-cancelled Shopify order totals, order count, average order value, currency, optional top-product merchandise sales before tax, order-sync freshness, and the standard recent-60-day source limitation. It returns a successful zero aggregate for a covered period without orders.

## Automated evidence

Production-path workerd tests completed OAuth-protected discovery and invocation with persisted order fixtures. They verified:

- all three tools are discovered for connected Shopify;
- two persisted orders total exactly `20 USD` with average order value `10`;
- one bounded product ranking aggregates three current units and `16 USD` before tax;
- a covered empty period returns order count `0`, total sales `0`, and average order value `null`;
- freshness and coverage metadata come from the completed order-sync row;
- no Shopify network request occurs during inventory or sales MCP calls.

The complete repository validation passed: 27 Node/deployment tests, 32 Admin tests, and 108 Worker tests, plus typecheck, lint, formatting, and production build.

## Deployment evidence

The migration-gated deployment first applied `0004_shopify_orders.sql` to remote D1 database `DB` and then published Worker version `adfa1e99-5ef6-4ee7-9fe1-d8f97a039692`. Read-only remote inspection confirmed migrations `0001` through `0004`. The canonical HTTPS MCP endpoint returned the expected OAuth challenge.

## Real-data and ChatGPT evidence

The maintainer granted the exact five-scope development-store configuration, including `read_orders` and `read_all_orders`, connected Shopify, and completed a bounded production order sync through the authenticated Admin endpoint. The first complete sync returned a covered recent-60-day window with zero orders and `CLP` as the shop currency. ChatGPT Pro developer mode then discovered and invoked `get_sales` against `manhattan.paperco.de` for two natural prompts:

- `How much did we sell today?` returned `0` non-cancelled orders and `CLP 0` without inventing sales.
- `What were our top-selling products in the last 7 days?` returned no ranked products, `0` orders, and `CLP 0` without inventing products.

The validation exposed a current-period coverage defect: relative periods ended after the latest completed sync. Worker version `e4083477-cc42-4fc3-a357-2ced7f75f294` corrected relative current periods to use the latest complete order-sync `window_end` as their as-of boundary while retaining strict coverage checks for explicit and historical periods.

After the maintainer created non-customer test order data in the controlled development store and ran another bounded sync, real ChatGPT invocation produced:

- `How much did we sell today?` returned one non-cancelled order totaling `CLP 3,330` and reported the `America/Santiago` merchant timezone.
- `What were our top-selling products in the last 7 days?` returned two real line-item snapshots: `The 3p Fulfilled Snowboard` with one unit and `CLP 2,630`, and `The Complete Snowboard (Sunset)` with one unit and `CLP 700`. The ranking total matched the order total of `CLP 3,330`.

The ChatGPT UI displayed the MCP action for each prompt, distinguishing real tool invocation from a model-only answer. No OAuth token, Shopify credential, customer identity, or raw provider payload was recorded. Automated production-path tests establish that `get_sales` serves both zero and positive results exclusively from D1 without a Shopify request.
