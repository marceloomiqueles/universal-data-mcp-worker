import { env } from 'cloudflare:test'
import { describe, expect, it } from 'vitest'

import { createIntegrationRegistry } from '../../src/core/integrations/registry'
import { garminIntegrationDescriptor } from '../../src/integrations/garmin/descriptor'
import { integrationRegistry } from '../../src/worker/integrations'

describe('integration registry', () => {
  it('lists the explicitly registered integration descriptors', async () => {
    const listed = await integrationRegistry.list(env.DB)
    expect(listed[0]).toMatchObject({ id: 'garmin', status: 'not_configured' })
    expect(Object.keys(listed[0]!).sort()).toEqual([
      'description',
      'id',
      'name',
      'status',
    ])
  })

  it('rejects duplicate integration ids deterministically', () => {
    expect(() =>
      createIntegrationRegistry([
        garminIntegrationDescriptor,
        { ...garminIntegrationDescriptor, name: 'Duplicate Garmin' },
      ]),
    ).toThrow('Duplicate integration id: garmin')
  })
})
