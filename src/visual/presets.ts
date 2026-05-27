import * as THREE from 'three';

export type PresetId = 'minimal' | 'neon' | 'glitch' | 'organic';

export interface PresetConfig {
  id: PresetId;
  label: string;
  description: string;
  particleCount: number;
  backgroundColor: THREE.Color;
  particleColor: THREE.Color;
  accentColor: THREE.Color;
  bloomStrength: number;
  bloomRadius: number;
  useGlitch: boolean;
  useRgbSplit: boolean;
  useScanlines: boolean;
  particleSize: number;
  geometryMode: 'particles' | 'sphere' | 'torus' | 'wave';
  noiseScale: number;
  reactionSpeed: number;
}

export const PRESETS: Record<PresetId, PresetConfig> = {
  minimal: {
    id: 'minimal',
    label: 'Minimal Geometry',
    description: 'Clean lines, subtle glow',
    particleCount: 2000,
    backgroundColor: new THREE.Color(0x050505),
    particleColor: new THREE.Color(0xffffff),
    accentColor: new THREE.Color(0xcccccc),
    bloomStrength: 0.22,
    bloomRadius: 0.18,
    useGlitch: false,
    useRgbSplit: false,
    useScanlines: false,
    particleSize: 2.0,
    geometryMode: 'sphere',
    noiseScale: 0.5,
    reactionSpeed: 0.3,
  },
  neon: {
    id: 'neon',
    label: 'Neon Particle Storm',
    description: 'Mid-density, optimized',
    particleCount: 8000,
    backgroundColor: new THREE.Color(0x000510),
    particleColor: new THREE.Color(0x00ffff),
    accentColor: new THREE.Color(0xff00ff),
    bloomStrength: 0.22,
    bloomRadius: 0.15,
    useGlitch: false,
    useRgbSplit: true,
    useScanlines: false,
    particleSize: 2.0,
    geometryMode: 'particles',
    noiseScale: 1.0,
    reactionSpeed: 1.0,
  },
  glitch: {
    id: 'glitch',
    label: 'Glitch Industrial',
    description: 'Digital noise, RGB split',
    particleCount: 10000,
    backgroundColor: new THREE.Color(0x000000),
    particleColor: new THREE.Color(0xff3300),
    accentColor: new THREE.Color(0x00ff44),
    bloomStrength: 0.48,
    bloomRadius: 0.28,
    useGlitch: true,
    useRgbSplit: true,
    useScanlines: true,
    particleSize: 2.5,
    geometryMode: 'wave',
    noiseScale: 2.0,
    reactionSpeed: 2.0,
  },
  organic: {
    id: 'organic',
    label: 'Ambient Organic',
    description: 'Fluid motion, slow reaction',
    particleCount: 5600,
    backgroundColor: new THREE.Color(0x020810),
    particleColor: new THREE.Color(0x44aaff),
    accentColor: new THREE.Color(0x88ffcc),
    bloomStrength: 0.42,
    bloomRadius: 0.55,
    useGlitch: false,
    useRgbSplit: false,
    useScanlines: false,
    particleSize: 1.55,
    geometryMode: 'torus',
    noiseScale: 0.3,
    reactionSpeed: 0.15,
  },
};
