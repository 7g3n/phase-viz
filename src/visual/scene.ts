import * as THREE from 'three';
import { ParticleSystem } from './particles';
import type { PresetConfig } from './presets';

export class VisualizerScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  private particleSystem: ParticleSystem | null = null;
  private geometryMesh: THREE.Mesh | null = null;
  private rectGroup: THREE.Group | null = null;
  private waveformLine: THREE.Line | null = null;
  private waveformLineR: THREE.Line | null = null;
  private backgroundTexture: THREE.Texture | null = null;
  private fallbackBackgroundColor = new THREE.Color(0x050508);

  // Post-processing using manual render target approach
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private rtPrevFrame: THREE.WebGLRenderTarget;
  private rtFinalFrame: THREE.WebGLRenderTarget;
  private postScene: THREE.Scene;
  private postCamera: THREE.OrthographicCamera;
  private postMaterial: THREE.ShaderMaterial;
  private copyScene: THREE.Scene;
  private copyMaterial: THREE.MeshBasicMaterial;
  private bloomPass: BloomPass;

  private time = 0;
  private cameraAngle = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.setClearColor(0x050508, 1);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 0, 5);

    // Ambient light
    const ambient = new THREE.AmbientLight(0xffffff, 0.1);
    this.scene.add(ambient);

    // Render targets for post-processing
    const w = canvas.clientWidth || 1920;
    const h = canvas.clientHeight || 1080;
    this.rtA = new THREE.WebGLRenderTarget(w, h);
    this.rtB = new THREE.WebGLRenderTarget(w, h);
    this.rtPrevFrame = new THREE.WebGLRenderTarget(w, h);
    this.rtFinalFrame = new THREE.WebGLRenderTarget(w, h);

    // Post-processing quad
    this.postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.postScene = new THREE.Scene();

    this.postMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        tPrev: { value: null },
        uTime: { value: 0 },
        uRgbSplit: { value: 0 },
        uChromaticAberration: { value: 0 },
        uGlitchNoise: { value: 0 },
        uDatamosh: { value: 0 },
        uScanlines: { value: 0 },
        uTransient: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position, 1.0); }
      `,
      fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tPrev;
        uniform float uTime;
        uniform float uRgbSplit;
        uniform float uChromaticAberration;
        uniform float uGlitchNoise;
        uniform float uDatamosh;
        uniform float uScanlines;
        uniform float uTransient;
        varying vec2 vUv;

        float rand(vec2 co) {
          return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = vUv;

          // Glitch noise
          if (uGlitchNoise > 0.0) {
            float noise = rand(vec2(floor(uv.y * 80.0), floor(uTime * 20.0)));
            if (noise > 1.0 - uGlitchNoise * 0.3 - uTransient * 0.2) {
              uv.x += (rand(vec2(uTime * 3.0, uv.y)) - 0.5) * 0.08 * uGlitchNoise;
            }
          }

          if (uDatamosh > 1.0) {
            float blockY = floor(uv.y * mix(18.0, 52.0, uTransient));
            float blockNoise = rand(vec2(blockY, floor(uTime * 7.0)));
            float blockGate = step(0.48, blockNoise);
            uv.x += (blockNoise - 0.5) * 0.22 * min(uDatamosh, 2.4) * blockGate * (0.45 + uTransient);
            uv.y += sin(blockY * 1.7 + uTime * 6.0) * 0.012 * uDatamosh * blockGate;
          }

          // RGB Split
          float splitAmt = (uRgbSplit + uChromaticAberration * 0.5) * 0.015;
          float r = texture2D(tDiffuse, uv + vec2(splitAmt, 0.0)).r;
          float g = texture2D(tDiffuse, uv).g;
          float b = texture2D(tDiffuse, uv - vec2(splitAmt, 0.0)).b;
          vec4 color = vec4(r, g, b, 1.0);

          // Datamosh
          if (uDatamosh > 0.0) {
            vec2 prevUv = uv;
            if (uDatamosh > 1.0) {
              float cell = floor(uv.y * 34.0);
              prevUv.x += (rand(vec2(cell, floor(uTime * 10.0))) - 0.5) * 0.16 * uDatamosh;
            }
            vec4 prev = texture2D(tPrev, prevUv);
            float smear = uDatamosh > 1.0 ? 0.86 : 0.42;
            color = mix(color, prev, smear);
            color.rgb += prev.rgb * max(0.0, uDatamosh - 1.0) * 0.16;
          }

          // Scanlines
          if (uScanlines > 0.0) {
            float scan = sin(uv.y * 400.0) * 0.5 + 0.5;
            color.rgb *= mix(1.0, scan * 0.7 + 0.6, uScanlines * 0.5);
            // CRT darkening at edges
            float vignette = smoothstep(0.0, 0.15, uv.x) * smoothstep(0.0, 0.15, 1.0 - uv.x)
                           * smoothstep(0.0, 0.15, uv.y) * smoothstep(0.0, 0.15, 1.0 - uv.y);
            color.rgb *= mix(1.0, vignette, uScanlines * 0.6);
          }

          gl_FragColor = color;
        }
      `,
    });

    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.postMaterial);
    this.postScene.add(quad);

    this.copyScene = new THREE.Scene();
    this.copyMaterial = new THREE.MeshBasicMaterial({ map: this.rtFinalFrame.texture });
    this.copyScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.copyMaterial));

    // Bloom
    this.bloomPass = new BloomPass(w, h);
  }

  applyPreset(preset: PresetConfig) {
    // Clear previous objects
    if (this.particleSystem) {
      this.scene.remove(this.particleSystem.points);
      this.particleSystem.dispose();
      this.particleSystem = null;
    }
    if (this.geometryMesh) {
      this.scene.remove(this.geometryMesh);
      this.geometryMesh.geometry.dispose();
      (this.geometryMesh.material as THREE.Material).dispose();
      this.geometryMesh = null;
    }
    if (this.rectGroup) {
      this.scene.remove(this.rectGroup);
      this.rectGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          (obj.material as THREE.Material).dispose();
        }
      });
      this.rectGroup = null;
    }
    if (this.waveformLine) {
      this.scene.remove(this.waveformLine);
      this.waveformLine = null;
    }
    if (this.waveformLineR) {
      this.scene.remove(this.waveformLineR);
      this.waveformLineR = null;
    }

    this.renderer.setClearColor(preset.backgroundColor, 1);
    this.fallbackBackgroundColor = preset.backgroundColor;
    if (!this.backgroundTexture) {
      this.scene.background = preset.backgroundColor;
    }

    if (preset.geometryMode === 'particles') {
      this.particleSystem = new ParticleSystem(preset.particleCount);
      this.particleSystem.setColors(preset.particleColor, preset.accentColor);
      this.particleSystem.setParticleSize(preset.particleSize);
      this.scene.add(this.particleSystem.points);
    } else {
      // Create particles behind geometry
      this.particleSystem = new ParticleSystem(Math.floor(preset.particleCount * 0.3));
      this.particleSystem.setColors(preset.particleColor, preset.accentColor);
      this.particleSystem.setParticleSize(preset.particleSize * 0.7);
      this.scene.add(this.particleSystem.points);

      // Always create rectangles instead of sphere
      this.rectGroup = createRectanglesGrid(
        preset.geometryMode === 'sphere' ? 200 : preset.geometryMode === 'torus' ? 100 : 80,
        preset.particleColor,
        preset.accentColor,
      );
      this.scene.add(this.rectGroup);
    }

    // Waveform rings
    if (preset.geometryMode !== 'particles') {
      this.waveformLine = createWaveformLine(preset.particleColor, 512);
      this.waveformLineR = createWaveformLine(preset.accentColor, 512);
      this.waveformLine.position.set(-1.5, 0, 0);
      this.waveformLineR.position.set(1.5, 0, 0);
      this.scene.add(this.waveformLine);
      this.scene.add(this.waveformLineR);
    }
  }

  update(
    dt: number,
    bpm: number,
    bass: number,
    mid: number,
    high: number,
    transient: number,
    waveformL: Float32Array,
    waveformR: Float32Array,
    effects: {
      cameraShake: boolean;
      rgbSplit: boolean;
      chromaticAberration: boolean;
      glitchNoise: boolean;
      datamosh: boolean;
      strongDatamosh?: boolean;
      bloom: boolean;
      scanlines?: boolean;
    },
    bloomStrength: number,
  ) {
    this.time += dt;
    const bpmFactor = bpm / 120;

    if (this.particleSystem) {
      this.particleSystem.update(this.time, bass, mid, high, transient);
    }

    // Animate rectangles
    if (this.rectGroup) {
      const baseRotationSpeed = dt * bpmFactor * 0.3;
      this.rectGroup.rotation.y += baseRotationSpeed;
      this.rectGroup.rotation.x += dt * bpmFactor * 0.15;

      // Animate individual rectangles
      this.rectGroup.children.forEach((child, index) => {
        const mesh = child as THREE.Mesh;
        const mat = mesh.material as THREE.MeshStandardMaterial;
        const offset = index * 0.1;
        mesh.rotation.z = this.time * 0.5 + offset;

        // Scale based on audio
        const scaleMult = 1 + transient * 0.3 + bass * 0.15 * Math.sin(this.time * 2 + offset);
        mesh.scale.setScalar(scaleMult);

        // Emissive intensity based on audio
        mat.emissiveIntensity = 0.2 + bass * 0.6 + transient * 0.8;
      });
    }

    if (this.geometryMesh) {
      this.geometryMesh.rotation.y += dt * bpmFactor * 0.3;
      this.geometryMesh.rotation.x += dt * bpmFactor * 0.15;
      const scale = 1 + transient * 0.4 + bass * 0.2;
      this.geometryMesh.scale.setScalar(scale);
      const mat = this.geometryMesh.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = 0.3 + bass * 0.8 + transient * 1.2;
    }

    // Camera orbit
    this.cameraAngle += dt * bpmFactor * 0.1;
    const shake = effects.cameraShake ? transient * 0.15 : 0;
    this.camera.position.x = Math.sin(this.cameraAngle) * 5 + (Math.random() - 0.5) * shake;
    this.camera.position.y = Math.sin(this.cameraAngle * 0.5) * 1.5 + (Math.random() - 0.5) * shake;
    this.camera.position.z = Math.cos(this.cameraAngle) * 5;
    this.camera.lookAt(0, 0, 0);

    // Update waveform lines
    if (this.waveformLine && waveformL.length > 0) {
      updateWaveformLine(this.waveformLine, waveformL);
    }
    if (this.waveformLineR && waveformR.length > 0) {
      updateWaveformLine(this.waveformLineR, waveformR);
    }

    // Update post uniforms
    this.postMaterial.uniforms.uTime.value = this.time;
    this.postMaterial.uniforms.uRgbSplit.value = effects.rgbSplit ? 1 : 0;
    this.postMaterial.uniforms.uChromaticAberration.value = effects.chromaticAberration ? 1 : 0;
    this.postMaterial.uniforms.uGlitchNoise.value = effects.glitchNoise ? 1 : 0;
    this.postMaterial.uniforms.uDatamosh.value = effects.strongDatamosh ? 2.2 : effects.datamosh ? 1 : 0;
    this.postMaterial.uniforms.uScanlines.value = effects.scanlines ? 1 : 0;
    this.postMaterial.uniforms.uTransient.value = transient;
    this.bloomPass.setStrength(bloomStrength);
  }

  render() {
    // 1. Render scene → rtA
    this.renderer.setRenderTarget(this.rtA);
    this.renderer.render(this.scene, this.camera);

    // 2. Bloom pass rtA → rtB
    this.bloomPass.render(this.renderer, this.rtA, this.rtB);

    // 3. Post pass rtB + previous frame → final target
    this.postMaterial.uniforms.tDiffuse.value = this.rtB.texture;
    this.postMaterial.uniforms.tPrev.value = this.rtPrevFrame.texture;
    this.renderer.setRenderTarget(this.rtFinalFrame);
    this.renderer.render(this.postScene, this.postCamera);

    // 4. Present final frame and keep it for datamosh on the next frame.
    this.copyMaterial.map = this.rtFinalFrame.texture;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.copyScene, this.postCamera);
    [this.rtPrevFrame, this.rtFinalFrame] = [this.rtFinalFrame, this.rtPrevFrame];
    this.copyMaterial.map = this.rtPrevFrame.texture;
  }

  resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.rtA.setSize(width, height);
    this.rtB.setSize(width, height);
    this.rtPrevFrame.setSize(width, height);
    this.rtFinalFrame.setSize(width, height);
    this.bloomPass.setSize(width, height);

    this.updateBackgroundTextureCover();
  }

  setBackgroundImage(url: string | null) {
    if (this.backgroundTexture) {
      this.backgroundTexture.dispose();
      this.backgroundTexture = null;
    }

    if (!url) {
      this.scene.background = this.fallbackBackgroundColor;
      return;
    }

    const loader = new THREE.TextureLoader();
    this.backgroundTexture = loader.load(url, (texture) => {
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.colorSpace = THREE.SRGBColorSpace;
      this.scene.background = texture;
      this.updateBackgroundTextureCover();
    });
  }

  private updateBackgroundTextureCover() {
    const texture = this.backgroundTexture;
    const image = texture?.image as { width?: number; height?: number } | undefined;
    if (!texture || !image?.width || !image?.height) return;

    const viewAspect = this.renderer.domElement.width / this.renderer.domElement.height;
    const imageAspect = image.width / image.height;

    texture.repeat.set(1, 1);
    texture.offset.set(0, 0);

    if (imageAspect > viewAspect) {
      texture.repeat.x = viewAspect / imageAspect;
      texture.offset.x = (1 - texture.repeat.x) / 2;
    } else {
      texture.repeat.y = imageAspect / viewAspect;
      texture.offset.y = (1 - texture.repeat.y) / 2;
    }

    texture.needsUpdate = true;
  }

  dispose() {
    this.particleSystem?.dispose();
    this.rectGroup?.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
    this.rtA.dispose();
    this.rtB.dispose();
    this.rtPrevFrame.dispose();
    this.rtFinalFrame.dispose();
    this.copyMaterial.dispose();
    this.bloomPass.dispose();
    if (this.backgroundTexture) this.backgroundTexture.dispose();
    this.renderer.dispose();
  }
}

// Simple separable blur-based bloom
class BloomPass {
  private rtBlurA: THREE.WebGLRenderTarget;
  private rtBlurB: THREE.WebGLRenderTarget;
  private blurScene: THREE.Scene;
  private blurCam: THREE.OrthographicCamera;
  private blurMatH: THREE.ShaderMaterial;
  private blurMatV: THREE.ShaderMaterial;
  private compositeMat: THREE.ShaderMaterial;
  private compositeScene: THREE.Scene;
  private strength = 1.0;

  constructor(w: number, h: number) {
    this.rtBlurA = new THREE.WebGLRenderTarget(w / 4, h / 4);
    this.rtBlurB = new THREE.WebGLRenderTarget(w / 4, h / 4);
    this.blurCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.blurScene = new THREE.Scene();

    const blurFrag = (horizontal: boolean) => `
      uniform sampler2D tDiffuse;
      uniform vec2 uResolution;
      varying vec2 vUv;
      void main() {
        vec2 texel = 1.0 / uResolution;
        float weights[5];
        weights[0] = 0.227027; weights[1] = 0.194595; weights[2] = 0.121622;
        weights[3] = 0.054054; weights[4] = 0.016216;
        vec3 result = texture2D(tDiffuse, vUv).rgb * weights[0];
        for (int i = 1; i < 5; i++) {
          vec2 offset = ${horizontal ? 'vec2(texel.x * float(i), 0.0)' : 'vec2(0.0, texel.y * float(i))'};
          result += texture2D(tDiffuse, vUv + offset).rgb * weights[i];
          result += texture2D(tDiffuse, vUv - offset).rgb * weights[i];
        }
        gl_FragColor = vec4(result, 1.0);
      }
    `;

    const quadVert = `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position, 1.0); }`;

    this.blurMatH = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2(w / 4, h / 4) } },
      vertexShader: quadVert,
      fragmentShader: blurFrag(true),
    });
    this.blurMatV = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2(w / 4, h / 4) } },
      vertexShader: quadVert,
      fragmentShader: blurFrag(false),
    });

    this.compositeScene = new THREE.Scene();
    this.compositeMat = new THREE.ShaderMaterial({
      uniforms: {
        tBase: { value: null },
        tBloom: { value: null },
        uStrength: { value: 1.0 },
      },
      vertexShader: quadVert,
      fragmentShader: `
        uniform sampler2D tBase;
        uniform sampler2D tBloom;
        uniform float uStrength;
        varying vec2 vUv;
        void main() {
          vec4 base = texture2D(tBase, vUv);
          vec4 bloom = texture2D(tBloom, vUv);
          gl_FragColor = vec4(base.rgb + bloom.rgb * uStrength, 1.0);
        }
      `,
    });
    this.compositeScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.compositeMat));
  }

  render(renderer: THREE.WebGLRenderer, input: THREE.WebGLRenderTarget, output: THREE.WebGLRenderTarget) {
    // Downsample + blur H
    this.blurMatH.uniforms.tDiffuse.value = input.texture;
    const blurQuadH = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMatH);
    this.blurScene.add(blurQuadH);
    renderer.setRenderTarget(this.rtBlurA);
    renderer.render(this.blurScene, this.blurCam);
    this.blurScene.remove(blurQuadH);

    // Blur V
    this.blurMatV.uniforms.tDiffuse.value = this.rtBlurA.texture;
    const blurQuadV = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.blurMatV);
    this.blurScene.add(blurQuadV);
    renderer.setRenderTarget(this.rtBlurB);
    renderer.render(this.blurScene, this.blurCam);
    this.blurScene.remove(blurQuadV);

    // Composite
    this.compositeMat.uniforms.tBase.value = input.texture;
    this.compositeMat.uniforms.tBloom.value = this.rtBlurB.texture;
    this.compositeMat.uniforms.uStrength.value = this.strength;
    renderer.setRenderTarget(output);
    renderer.render(this.compositeScene, this.blurCam);
  }

  setStrength(s: number) { this.strength = s; }

  setSize(w: number, h: number) {
    this.rtBlurA.setSize(w / 4, h / 4);
    this.rtBlurB.setSize(w / 4, h / 4);
    this.blurMatH.uniforms.uResolution.value.set(w / 4, h / 4);
    this.blurMatV.uniforms.uResolution.value.set(w / 4, h / 4);
  }

  dispose() {
    this.rtBlurA.dispose();
    this.rtBlurB.dispose();
    this.blurMatH.dispose();
    this.blurMatV.dispose();
    this.compositeMat.dispose();
  }
}

function createWaveformLine(color: THREE.Color, points: number): THREE.Line {
  const positions = new Float32Array(points * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7 });
  return new THREE.Line(geo, mat);
}

function updateWaveformLine(line: THREE.Line, data: Float32Array) {
  const positions = line.geometry.attributes.position as THREE.BufferAttribute;
  const count = Math.min(positions.count, data.length);
  const spread = 4;

  for (let i = 0; i < count; i++) {
    const x = (i / count - 0.5) * spread;
    const y = (data[Math.floor((i / count) * data.length)] ?? 0) * 2;
    positions.setXYZ(i, x, y, 0);
  }
  positions.needsUpdate = true;
}

/**
 * Creates a group of random rectangles distributed in 3D space
 */
function createRectanglesGrid(
  count: number,
  colorA: THREE.Color,
  colorB: THREE.Color,
): THREE.Group {
  const group = new THREE.Group();

  for (let i = 0; i < count; i++) {
    // Random size
    const width = 0.1 + Math.random() * 0.5;
    const height = 0.1 + Math.random() * 0.8;

    const geo = new THREE.PlaneGeometry(width, height);

    // Mix between two colors
    const t = Math.random();
    const color = new THREE.Color().lerpColors(colorA, colorB, t);

    const mat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.3,
      metalness: 0.6,
      roughness: 0.3,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Random position in spherical distribution
    const phi = Math.acos(2 * Math.random() - 1);
    const theta = 2 * Math.PI * Math.random();
    const radius = 1.5 + Math.random() * 2;

    mesh.position.set(
      radius * Math.sin(phi) * Math.cos(theta),
      radius * Math.sin(phi) * Math.sin(theta),
      radius * Math.cos(phi),
    );

    // Random initial rotation
    mesh.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI,
    );

    // Point outward
    mesh.lookAt(0, 0, 0);

    group.add(mesh);
  }

  return group;
}
