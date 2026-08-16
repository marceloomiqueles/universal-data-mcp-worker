# Shopify Activation Product-Path Live Validation

Date: 2026-08-16

## Scope

This validation replayed the real Shopify activation backend path against a maintainer-controlled development store. It used the committed opt-in workerd harness, an isolated migrated D1 database, ignored local credentials, and the production Worker, Admin API, encryption, persistence, and Shopify provider modules.

The validation did not use the isolated Spike 0 client, did not modify the Shopify store, and did not exercise ingestion, synchronization, webhooks, or MCP Shopify tools.

## Command

```sh
pnpm test:shopify-live
```

The command is deliberately excluded from ordinary `pnpm test` and requires explicit ignored `.dev.vars` configuration for a development store and Dev Dashboard app owned by the same Shopify organization.

## Sanitized result

- test files: 1 passed;
- tests: 1 passed;
- Shopify Admin GraphQL API: `2026-07`;
- exact granted scopes: `read_products`, `read_inventory`, `read_locations`;
- owner/session setup through production Admin handlers: succeeded;
- configuration save through authenticated Admin API: succeeded;
- client secret encrypted before D1 persistence: confirmed;
- plaintext client secret in stored envelope: absent;
- official client-credentials token acquisition: succeeded;
- bounded read-only `VerifyShopifyConnection` query: succeeded;
- resulting activation state: `connected`;
- Shopify access-token persistence: absent;
- Shopify mutations: none.

The development-store domain is intentionally omitted. No client secret, encryption key, access token, authorization header, or raw Shopify response is present in this record.

## Decision

The real product activation backend path is validated and replayable through the committed opt-in harness. This evidence covers connection configuration and verification only; it does not authorize or validate commerce ingestion.
