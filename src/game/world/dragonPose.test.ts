import { describe, expect, it } from 'vitest'

import {
  createDragonPoseState,
  didWingDownstrokeStart,
  stepDragonPose,
} from './dragonPose'

describe('procedural dragon pose', () => {
  it('lets the shoulders lead while body and tail follow progressively later', () => {
    const pose = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0.5,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0,
      },
      1 / 60,
    )

    expect(pose.shoulderBankRadians).toBe(0.5)
    expect(pose.bodyBankRadians).toBeGreaterThan(0)
    expect(pose.bodyBankRadians).toBeLessThan(0.5)
    expect(Math.abs(pose.tailYawRadians[0] ?? 0)).toBeGreaterThan(
      Math.abs(pose.tailYawRadians[4] ?? 0),
    )
  })

  it('folds the wings farther during boost than normal flight', () => {
    const normal = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0,
      },
      0.25,
    )
    const boosting = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: true,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0,
      },
      0.25,
    )

    expect(boosting.wingFoldRadians).toBeGreaterThan(
      normal.wingFoldRadians,
    )
  })

  it('labels glide, cruise, climb, dive, and boost wing states from visual flight input', () => {
    const glide = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )
    const cruise = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0.2,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )
    const climb = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0.2,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )
    const dive = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: -0.2,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )
    const boost = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: true,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )

    expect(glide.wingMode).toBe('glide')
    expect(cruise.wingMode).toBe('cruise')
    expect(climb.wingMode).toBe('climb')
    expect(dive.wingMode).toBe('dive')
    expect(boost.wingMode).toBe('boost')
  })

  it('adds one bounded boost downstroke without restarting it while boost is held', () => {
    let pose = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: true,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0,
      },
      1 / 60,
    )

    expect(pose.boostLaunchRadians).toBeGreaterThan(0)
    for (let index = 1; index <= 20; index += 1) {
      pose = stepDragonPose(
        pose,
        {
          bankRadians: 0,
          pitchRadians: 0,
          isBoosting: true,
          collisionFeedbackSeconds: 0,
          animationSeconds: index / 60,
        },
        1 / 60,
      )
    }

    expect(pose.boostLaunchRadians).toBe(0)
    expect(pose.wingMode).toBe('boost')
  })

  it('gives each guardian a deterministic but visibly distinct motion rhythm', () => {
    const input = {
      bankRadians: 0.34,
      pitchRadians: 0.24,
      isBoosting: false,
      collisionFeedbackSeconds: 0,
      animationSeconds: 0.31,
    }
    const dragon = stepDragonPose(
      createDragonPoseState(),
      { ...input, motionProfile: 'dragon' },
      1 / 60,
    )
    const phoenix = stepDragonPose(
      createDragonPoseState(),
      { ...input, motionProfile: 'avian' },
      1 / 60,
    )
    const tiger = stepDragonPose(
      createDragonPoseState(),
      { ...input, motionProfile: 'feline' },
      1 / 60,
    )
    const repeatPhoenix = stepDragonPose(
      createDragonPoseState(),
      { ...input, motionProfile: 'avian' },
      1 / 60,
    )

    expect(phoenix.wingFlapRadians).not.toBeCloseTo(
      dragon.wingFlapRadians,
      6,
    )
    expect(tiger.tailYawRadians[0]).not.toBeCloseTo(
      dragon.tailYawRadians[0] ?? 0,
      6,
    )
    expect(phoenix.bodyPitchRadians).not.toBeCloseTo(
      tiger.bodyPitchRadians,
      6,
    )
    expect(repeatPhoenix).toEqual(phoenix)
  })

  it('keeps the same guardian pose across host frame cadences when simulation steps match', () => {
    const simulate = (hostDeltas: readonly number[]) => {
      const fixedDt = 1 / 60
      let accumulator = 0
      let animationSeconds = 0
      let stepCount = 0
      let hostIndex = 0
      let pose = createDragonPoseState()

      while (stepCount < 180) {
        accumulator += hostDeltas[hostIndex % hostDeltas.length] ?? fixedDt
        hostIndex += 1
        while (accumulator >= fixedDt && stepCount < 180) {
          animationSeconds += fixedDt
          pose = stepDragonPose(
            pose,
            {
              bankRadians: stepCount < 60 ? 0.32 : -0.24,
              pitchRadians: stepCount < 120 ? 0.2 : -0.18,
              isBoosting: stepCount >= 60 && stepCount < 96,
              collisionFeedbackSeconds:
                stepCount >= 130 && stepCount < 145 ? 0.25 : 0,
              animationSeconds,
              motionProfile: 'avian',
            },
            fixedDt,
          )
          accumulator -= fixedDt
          stepCount += 1
        }
      }

      return pose
    }

    const baseline = simulate([1 / 60])

    expect(simulate([1 / 30])).toEqual(baseline)
    expect(simulate([1 / 120])).toEqual(baseline)
    expect(simulate([1 / 20, 1 / 120, 1 / 45, 1 / 90])).toEqual(baseline)
  })

  it('reports one downstroke when the rendered wing crosses downward', () => {
    const before = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0.44,
      },
      1 / 60,
    )
    const after = stepDragonPose(
      before,
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 0.46,
      },
      1 / 60,
    )

    expect(before.wingFlapRadians).toBeLessThanOrEqual(0)
    expect(after.wingFlapRadians).toBeGreaterThan(0)
    expect(
      didWingDownstrokeStart(
        before.wingFlapRadians,
        after.wingFlapRadians,
      ),
    ).toBe(true)
    expect(
      didWingDownstrokeStart(
        after.wingFlapRadians,
        after.wingFlapRadians,
      ),
    ).toBe(false)
  })

  it('adds a short recoil posture while collision feedback is active', () => {
    const hit = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0.25,
        animationSeconds: 0,
      },
      1 / 60,
    )
    const recovered = stepDragonPose(
      hit,
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1,
    )

    expect(hit.recoilRadians).toBeLessThan(0)
    expect(Math.abs(recovered.recoilRadians)).toBeLessThan(
      Math.abs(hit.recoilRadians),
    )
  })

  it('adds bounded breathing and a deterministic short blink', () => {
    const neutral = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )
    const blinking = stepDragonPose(
      neutral,
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 3.76,
      },
      1 / 60,
    )

    expect(neutral.breathScale).toBeGreaterThanOrEqual(0.99)
    expect(neutral.breathScale).toBeLessThanOrEqual(1.01)
    expect(neutral.blinkAmount).toBe(0)
    expect(blinking.blinkAmount).toBeGreaterThan(0.9)
  })

  it('opens the jaw during boost and squints on collision', () => {
    const boosting = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0.2,
        isBoosting: true,
        collisionFeedbackSeconds: 0,
        animationSeconds: 2,
      },
      0.25,
    )
    const hit = stepDragonPose(
      boosting,
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0.25,
        animationSeconds: 2.25,
      },
      0.1,
    )

    expect(boosting.jawOpenRadians).toBeGreaterThan(0.04)
    expect(boosting.blinkAmount).toBeGreaterThan(0)
    expect(hit.blinkAmount).toBeGreaterThan(0.9)
  })

  it('does not advance character expression when paused', () => {
    const state = stepDragonPose(
      createDragonPoseState(),
      {
        bankRadians: 0,
        pitchRadians: 0,
        isBoosting: false,
        collisionFeedbackSeconds: 0,
        animationSeconds: 1,
      },
      1 / 60,
    )

    expect(
      stepDragonPose(
        state,
        {
          bankRadians: 0,
          pitchRadians: 0,
          isBoosting: false,
          collisionFeedbackSeconds: 0,
          animationSeconds: 3.76,
        },
        0,
      ),
    ).toBe(state)
  })
})
