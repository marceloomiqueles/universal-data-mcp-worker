# Shopify Inventory MCP Validation

Date: 2026-08-16

## Scope

This record validates the first real data MCP capability against the maintained Shopify development store, the deployed Cloudflare Worker, and ChatGPT Work developer mode. It contains no Shopify credentials, access tokens, OAuth tokens, Admin session tokens, authorization headers, or raw provider payloads.

## Deployment and data evidence

- Canonical MCP endpoint: `https://manhattan.paperco.de/mcp`.
- Cloudflare Worker version: `b5e1f73b-48a4-465b-a7e1-e853ac3b100f`.
- D1 migration `0003_shopify_inventory.sql` was applied remotely before deployment.
- The authenticated production sync endpoint completed with full coverage.
- The run used 2 bounded provider requests and recorded 18 products, 27 variants, and 29 inventory levels. Remote D1 contained 3 locations.
- The temporary Admin validation session was revoked after the sync.
- MCP inventory requests read D1 and make no Shopify provider request.

## Tool contract exercised

ChatGPT refreshed its app tool snapshot and discovered `get_inventory` alongside the unchanged `list_integrations`. `get_inventory` is read-only, returns bounded structured content, and includes `lastSuccessfulSyncAt`. Stock filtering applies only to tracked inventory:

- `out_of_stock`: available quantity is zero or lower;
- `low_stock`: available quantity is above zero and no greater than the supplied threshold;
- `in_stock`: available quantity is above zero.

The tool accepts exact SKU, partial product-title and location filters, a maximum-available threshold through the low-stock state, a limit, and an opaque cursor. The default result limit is 25 and the maximum is 100.

## ChatGPT evidence

ChatGPT Work developer mode selected and invoked the tool naturally for all four prompts. The expanded processing trace displayed an inventory query action for each response.

1. `Which products are out of stock? Use my self-hosted server's current inventory.`
   - Result: one tracked out-of-stock product, The Collection Snowboard: Hydrogen, at Shop location with 0 units.
2. `Which SKUs have 5 units or fewer? Use my self-hosted server inventory.`
   - Result: assigned SKU `sku-hosted-1` with 2 units at Snow City Warehouse; ChatGPT separately noted variants without assigned SKUs.
3. `Do I have inventory for SKU sku-hosted-1?`
   - Result: 2 units at Snow City Warehouse.
4. `Where is SKU sku-hosted-1 available?`
   - Result: Snow City Warehouse with 2 units.

Every answer reported the last successful inventory sync as 2026-08-16 14:00 Chile time. The values matched direct read-only D1 inspection. No answer implied a live Shopify request.

## Result

The deployed read-only Shopify inventory path is validated end to end:

```text
Shopify development store
        -> bounded production sync
        -> D1
        -> get_inventory
        -> OAuth-protected MCP
        -> ChatGPT Work
```

No Shopify mutation, catalog write UI, scheduled sync, MCP resource, MCP prompt, or write tool was introduced.
