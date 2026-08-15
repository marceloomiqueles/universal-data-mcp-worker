# Third-Party Licensing and Service Terms

The Project license covers only rights that the Project Owner and contributors are authorized to grant. It does not make third-party code, assets, APIs, services, data, or trademarks compatible automatically.

## Vuexy

Vuexy was evaluated as a possible Admin UI foundation. The Project Owner holds a Regular License. The license review concluded that it does not provide sufficient rights to redistribute Vuexy source code or protected assets in this public source-available repository.

Vuexy is therefore not incorporated and is excluded from Project source. Do not copy, selectively incorporate, vendor, adapt, or relicense its Starter files, layouts, `@core`, SCSS, components, icons, assets, or generated code under the Project license. [GAP-008](../gaps/GAP-008-vuexy-redistribution.md) records the closed decision.

## Vue

Vue is selected for the Admin Web. Record the authoritative license, version, source, notices, and lockfile provenance for the actual package incorporated during scaffolding. No dependency metadata or license text is claimed before installation.

## Vuetify

Vuetify is selected as the Admin Web UI framework. Record the authoritative license, version, source, notices, and lockfile provenance for the actual package incorporated during scaffolding. Do not copy dependency license text before a version is installed and verified.

## Garmin

Garmin and Garmin Connect are third-party trademarks and services. The first Garmin provider may be unofficial and temporary. The provider's software license and Garmin's service, API, data-use, and contractual terms remain separate from the Project's software license.

The unofficial provider must remain architecturally replaceable. Official Garmin access should be evaluated as the preferred long-term path. Stable commercial reliance on an unofficial provider requires separate evidence and review; see [GAP-009](../gaps/GAP-009-garmin-unofficial-provider.md).

## Future Integrations

Every proposed integration must independently review and document:

- provider and library licenses;
- API and service terms;
- trademark and branding requirements;
- source and asset redistribution rights;
- data-use, storage, transfer, and retention restrictions;
- provenance for incorporated third-party code.

An integration may be technically compatible while remaining legally unsuitable. Third-party code may be incorporated only under compatible terms with documented provenance.
