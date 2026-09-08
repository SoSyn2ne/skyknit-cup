import { describe, expect, it } from 'vitest'

import {
  MISSION_IDS,
  PLAYABLE_MISSION_CATALOG,
  PLAYABLE_MISSION_IDS,
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
        'no-respawn',
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
    ['boost-mastery', 2],
    ['no-respawn', 3],
    ['time-trial', 4],
    ['clean-flight', 5],
  ] as const)(
    'restores every prior mission and one following mission from sparse %s history',
    (missionId, unlockedCount) => {
      expect(deriveUnlockedMissionIds({ [missionId]: 'bronze' })).toEqual(
        PLAYABLE_MISSION_IDS.slice(0, unlockedCount),
      )
    },
  )

  it('unlocks the volcanic mission after a Golden Knot achievement', () => {
    expect(deriveUnlockedMissionIds({ 'golden-knot': 'gold' })).toEqual(
      PLAYABLE_MISSION_IDS,
    )
  })

  it('keeps the volcanic mission locked before Golden Knot Bronze', () => {
    expect(
      deriveUnlockedMissionIds({
        'clean-flight': 'gold',
        'golden-knot': 'failed',
      }),
    ).not.toContain('heart-of-sun')
  })
})

describe('mission progression navigation', () => {
  it.each([
    ['first-skyknot', 'no-respawn'],
    ['no-respawn', 'time-trial'],
    ['time-trial', 'clean-flight'],
    ['clean-flight', 'golden-knot'],
    ['golden-knot', 'heart-of-sun'],
  ] as const)('returns %s followed by %s', (missionId, nextMissionId) => {
    expect(getNextMissionId(missionId)).toBe(nextMissionId)
  })

  it('routes a recovered legacy Boost Mastery result to No Respawn', () => {
    expect(getNextMissionId('boost-mastery')).toBe('no-respawn')
  })

  it('returns no next mission after escaping the volcanic archipelago', () => {
    expect(getNextMissionId('heart-of-sun')).toBeNull()
  })

  it('does not require an unlock message for the first mission', () => {
    expect(getMissionLockRequirement('first-skyknot')).toBeNull()
  })

  it.each(PLAYABLE_MISSION_IDS.slice(1))(
    'names the immediately preceding mission and Bronze requirement for %s',
    (missionId: MissionId) => {
      const missionIndex = PLAYABLE_MISSION_IDS.indexOf(missionId)
      const previousMission = PLAYABLE_MISSION_CATALOG[missionIndex - 1]
      const requirement = getMissionLockRequirement(missionId)

      expect(requirement).toContain(previousMission.name)
      expect(requirement).toContain('브론즈')
    },
  )

  it('keeps Boost Mastery known for storage but out of active play', () => {
    expect(MISSION_IDS).toContain('boost-mastery')
    expect(PLAYABLE_MISSION_IDS).not.toContain('boost-mastery')
    expect(getMissionLockRequirement('boost-mastery')).toBeNull()
  })
})
