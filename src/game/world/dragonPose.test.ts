import { describe, expect, it } from 'vitest'

import {
  createDragonPoseState,
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
