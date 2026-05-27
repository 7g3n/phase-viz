import * as THREE from 'three';

export class ParticleSystem {
  geometry: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;
  points: THREE.Points;
  private basePositions: Float32Array;

  constructor(count: number) {
    this.geometry = new THREE.BufferGeometry();
    this.basePositions = new Float32Array(count * 3);

    // Sphere distribution
    for (let i = 0; i < count; i++) {
      const phi = Math.acos(2 * Math.random() - 1);
      const theta = 2 * Math.PI * Math.random();
      const r = 1 + Math.random() * 2;
      this.basePositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      this.basePositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      this.basePositions[i * 3 + 2] = r * Math.cos(phi);
    }

    const positions = new Float32Array(this.basePositions);
    const phases = new Float32Array(count);
    const sizes = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      phases[i] = Math.random() * Math.PI * 2;
      sizes[i] = 0.5 + Math.random();
    }

    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uTransient: { value: 0 },
        uColorA: { value: new THREE.Color(0x00ffff) },
        uColorB: { value: new THREE.Color(0xff00ff) },
        uParticleSize: { value: 2.0 },
      },
      vertexShader: `
        attribute float aPhase;
        attribute float aSize;
        uniform float uTime;
        uniform float uBass;
        uniform float uMid;
        uniform float uHigh;
        uniform float uTransient;
        uniform float uParticleSize;
        varying float vBrightness;
        varying vec3 vPosition;

        void main() {
          vec3 pos = position;
          float noise = sin(pos.x * 3.0 + uTime + aPhase) * cos(pos.z * 2.0 + uTime * 0.7);

          // Bass causes radial expansion
          float dist = length(pos);
          pos += normalize(pos) * uBass * 1.5 * (1.0 + noise * 0.3);

          // Transient explosion
          pos += normalize(pos) * uTransient * 2.0;

          // High freq → Y ripple
          pos.y += sin(pos.x * 5.0 + uTime * 2.0 + aPhase) * uHigh * 0.5;

          vBrightness = 0.3 + uBass * 0.5 + uMid * 0.3 + uHigh * 0.4;
          vPosition = pos;

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          gl_PointSize = uParticleSize * aSize * (300.0 / -mvPosition.z);
          // High freq → smaller particles
          gl_PointSize *= (1.0 - uHigh * 0.5);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying float vBrightness;
        varying vec3 vPosition;

        void main() {
          vec2 uv = gl_PointCoord - 0.5;
          float d = length(uv);
          if (d > 0.5) discard;
          float alpha = (1.0 - d * 2.0) * vBrightness;
          float t = length(vPosition) * 0.2;
          vec3 color = mix(uColorA, uColorB, clamp(t, 0.0, 1.0));
          gl_FragColor = vec4(color, alpha);
        }
      `,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.points = new THREE.Points(this.geometry, this.material);
  }

  update(time: number, bass: number, mid: number, high: number, transient: number) {
    this.material.uniforms.uTime.value = time;
    this.material.uniforms.uBass.value = bass;
    this.material.uniforms.uMid.value = mid;
    this.material.uniforms.uHigh.value = high;
    this.material.uniforms.uTransient.value = transient;
  }

  setColors(colorA: THREE.Color, colorB: THREE.Color) {
    this.material.uniforms.uColorA.value = colorA;
    this.material.uniforms.uColorB.value = colorB;
  }

  setParticleSize(size: number) {
    this.material.uniforms.uParticleSize.value = size;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
