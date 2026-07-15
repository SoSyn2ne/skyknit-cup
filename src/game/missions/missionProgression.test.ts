import { describe, expect, it } from 'vitest'

import {
  MISSION_CATALOG,
  MISSION_IDS,
  deriveUnlockedMissionIds,
  getMissionLockRequirement,
  getNextMissionId,
  type AwardedMissionGrade,
  type MissionId,
} from './missionRules'

describe('mission unlock derivation', () => {
  it('unlocks only the first mission with no grades', () => {
    expect(deriveUnlockedMissionIds({})).toEqual(['first-skyknot'])
  })

  it.each(['bronze', 'silver', 'gold'] as const)(
    'unlocks the next mission after a %s grade',
    (grade: AwardedMissionGrade) => {
      expect(deriveUnlockedMissionIds({ 'first-skyknot': grade })).toEqual([
        'first-skyknot',
        'boost-mastery',
      ])
    },
  )

  it('does not unlock from failed, missing, or unknown grades', () => {
    expect(
      deriveUnlockedMissionIds({
        'first-skyknot': 'failed',
        'unknown-mission': 'gold',
        'boost-mastery': 'platinum',
      }),
    ).toEqual(['first-skyknot'])
  })

  it.each([
    ['boost-mastery', 3],
    ['no-respawn', 4],
    ['time-trial', 5],
    ['clean-flight', 6],
  ] as const)(
    'restores every prior mission and one following mission from sparse %s history',
    (missionId, unlockedCount) => {
      expect(deriveUnlockedMissionIds({ [missionId]: 'bronze' })).toEqual(
        MISSION_IDS.slice(0, unlockedCount),
      )
    },
  )

  it('unlocks all missions from a final mission achievement', () => {
    expect(deriveUnlockedMissionIds({ 'golden-knot': 'gold' })).toEqual(
      MISSION_IDS,
    )
  })
})

describe('mission progression navigation', () => {
  it.each([
    ['first-skyknot', 'boost-mastery'],
    ['boost-mastery', 'no-respawn'],
    ['no-respawn', 'time-trial'],
    ['time-trial', 'clean-flight'],
    ['clean-flight', 'golden-knot'],
  ] as const)('returns %s followed by %s', (missionId, nextMissionId) => {
    expect(getNextMissionId(missionId)).toBe(nextMissionId)
  })

  it('returns no next mission after the final achievement', () => {
    expect(getNextMissionId('golden-knot')).toBeNull()
  })

  it('does not require an unlock message for the first mission', () => {
    expect(getMissionLockRequirement('first-skyknot')).toBeNull()
  })

  it.each(MISSION_IDS.slice(1))(
    'names the immediately preceding mission and Bronze requirement for %s',
    (missionId: MissionId) => {
      const missionIndex = MISSION_IDS.indexOf(missionId)
      const previousMission = MISSION_CATALOG[missionIndex - 1]
      const requirement = getMissionLockRequirement(missionId)

      expect(requirement).toContain(previousMission.name)
      expect(requirement).toContain('브론즈')
    },
  )
})
