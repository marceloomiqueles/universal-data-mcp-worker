import { describe, expect, it } from 'vitest'

import { createIntegrationRegistry } from '../../src/core/integrations/registry'
import { garminIntegrationDescriptor } from '../../src/integrations/garmin/descriptor'
import { integrationRegistry } from '../../src/worker/integrations'

describe('integration registry', () => {
  it('lists the explicitly registered Garmin descriptor', () => {
    expect(integrationRegistry.list()).toEqual([garminIntegrationDescriptor])
    expect(Object.keys(integrationRegistry.list()[0]!).sort()).toEqual([
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
