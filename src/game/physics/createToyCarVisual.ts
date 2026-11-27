import * as THREE from 'three'

export interface ToyCarMeshResult {
  readonly root: THREE.Group
  readonly chassisMesh: THREE.Object3D
  readonly wheels: THREE.Mesh[]
}

export function createToyCarVisual(color: number = 0xff4422): ToyCarMeshResult {
  const root = new THREE.Group()

  // 1. Main Body / Chassis
  const bodyGroup = new THREE.Group()
  root.add(bodyGroup)

  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.25,
    metalness: 0.2,
  })

  // Lower chassis
  const lowerBody = new THREE.Mesh(
    new THREE.BoxGeometry(1.5, 0.45, 2.7),
    bodyMat,
  )
  lowerBody.castShadow = true
  lowerBody.receiveShadow = true
  bodyGroup.add(lowerBody)

  // Cabin / Roof
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x1a2430, // Dark tinted glass
    roughness: 0.1,
    metalness: 0.7,
  })
  const cabin = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.4, 1.3),
    cabinMat,
  )
  cabin.position.set(0, 0.4, -0.15)
  cabin.castShadow = true
  bodyGroup.add(cabin)

  // Roof cap
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(1.15, 0.08, 1.25),
    bodyMat,
  )
  roof.position.set(0, 0.62, -0.15)
  bodyGroup.add(roof)

  // Rear Spoiler / Wing
  const spoilerMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.4,
  })
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(1.4, 0.06, 0.35),
    spoilerMat,
  )
  wing.position.set(0, 0.55, -1.25)
  wing.castShadow = true
  bodyGroup.add(wing)

  // Spoiler pillars
  const pillarGeom = new THREE.BoxGeometry(0.06, 0.25, 0.1)
  const leftPillar = new THREE.Mesh(pillarGeom, spoilerMat)
  leftPillar.position.set(-0.45, 0.4, -1.25)
  const rightPillar = new THREE.Mesh(pillarGeom, spoilerMat)
  rightPillar.position.set(0.45, 0.4, -1.25)
  bodyGroup.add(leftPillar, rightPillar)

  // Headlights (Glowing emissive)
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xfffaed,
    emissiveIntensity: 1.5,
    roughness: 0.2,
  })
  const lightGeom = new THREE.BoxGeometry(0.25, 0.12, 0.08)
  const leftLight = new THREE.Mesh(lightGeom, lightMat)
  leftLight.position.set(-0.5, 0.05, 1.36)
  const rightLight = new THREE.Mesh(lightGeom, lightMat)
  rightLight.position.set(0.5, 0.05, 1.36)
  bodyGroup.add(leftLight, rightLight)

  // Taillights
  const tailMat = new THREE.MeshStandardMaterial({
    color: 0xff1122,
    emissive: 0xdd1111,
    emissiveIntensity: 1.2,
  })
  const leftTail = new THREE.Mesh(lightGeom, tailMat)
  leftTail.position.set(-0.5, 0.08, -1.36)
  const rightTail = new THREE.Mesh(lightGeom, tailMat)
  rightTail.position.set(0.5, 0.08, -1.36)
  bodyGroup.add(leftTail, rightTail)

  // 2. Wheels (4 wheels)
  const tireGeom = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 16)
  tireGeom.rotateZ(Math.PI / 2) // Orient cylinder sideways
  const tireMat = new THREE.MeshStandardMaterial({
    color: 0x222222,
    roughness: 0.8,
  })

  const rimGeom = new THREE.CylinderGeometry(0.2, 0.2, 0.29, 12)
  rimGeom.rotateZ(Math.PI / 2)
  const rimMat = new THREE.MeshStandardMaterial({
    color: 0xdddddd,
    metalness: 0.8,
    roughness: 0.2,
  })

  const wheels: THREE.Mesh[] = []

  for (let i = 0; i < 4; i++) {
    const wheelGroup = new THREE.Group()
    const tire = new THREE.Mesh(tireGeom, tireMat)
    tire.castShadow = true
    wheelGroup.add(tire)

    const rim = new THREE.Mesh(rimGeom, rimMat)
    wheelGroup.add(rim)

    root.add(wheelGroup)
    wheels.push(wheelGroup as unknown as THREE.Mesh)
  }

  return { root, chassisMesh: root, wheels }
}
