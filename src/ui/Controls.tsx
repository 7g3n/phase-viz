import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Switch from '@mui/material/Switch';
import FormControlLabel from '@mui/material/FormControlLabel';
import Button from '@mui/material/Button';
import Alert from '@mui/material/Alert';
import Divider from '@mui/material/Divider';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';
import Slider from '@mui/material/Slider';
import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';
import { EXPORT_PRESETS, useStore } from '../store';
import type {
  DisplayMode,
  EffectSettings,
  ExportPresetId,
  ImageFxLayerId,
  ImageFxEffectKey,
  ImageFxPreset,
  ParticleShape,
  PresetId,
  VisualizerLayerId,
  WaveBackgroundMode,
  WaveVisualizerType,
} from '../store';
import { PRESETS } from '../visual/presets';
import ShortsControls from './ShortsControls';
import { IMAGE_FX_PRESET_LABELS, IMAGE_FX_PRESETS } from '../visual/imageFxPresets';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CancelIcon from '@mui/icons-material/Cancel';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import RestartAltIcon from '@mui/icons-material/RestartAlt';

const EFFECT_LABELS: { key: keyof EffectSettings; label: string }[] = [
  { key: 'chromaticAberration', label: 'Chromatic' },
  { key: 'rgbSplit', label: 'RGB Split' },
  { key: 'datamosh', label: 'Datamosh' },
  { key: 'strongDatamosh', label: 'Strong Datamosh' },
  { key: 'blockDatamosh', label: 'Block Datamosh' },
  { key: 'glitchDatamosh', label: 'Glitch Datamosh' },
  { key: 'meltingDatamosh', label: 'Melt Datamosh' },
  { key: 'glitchNoise', label: 'Glitch' },
  { key: 'cameraShake', label: 'Cam Shake' },
];

const IMAGE_FX_SLIDERS: { key: ImageFxEffectKey; label: string }[] = [
  { key: 'glow', label: 'Glow' },
  { key: 'blur', label: 'Blur' },
  { key: 'rgbShift', label: 'RGB Shift' },
  { key: 'noise', label: 'Noise' },
  { key: 'distortion', label: 'Distortion' },
  { key: 'pulse', label: 'Pulse' },
];

const PARTICLE_SHAPES: { value: ParticleShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'square', label: 'Square' },
  { value: 'diamond', label: 'Diamond' },
  { value: 'star', label: 'Star' },
  { value: 'ring', label: 'Ring' },
];

const EXPORT_PRESET_OPTIONS = Object.values(EXPORT_PRESETS);

const VISUALIZER_LAYER_LABELS: Record<VisualizerLayerId, string> = {
  background: 'Background',
  particles: 'Particles',
  objects: '3D Objects',
  waveform: 'Waveform Lines',
};

const IMAGE_FX_LAYER_LABELS: Record<ImageFxLayerId, string> = {
  background: 'Background',
  distortion: 'Distortion',
  rgbShift: 'RGB Shift',
  glow: 'Glow',
  pulse: 'Pulse',
  noise: 'Noise',
  scanlines: 'Scanlines',
  vignette: 'Vignette',
  datamosh: 'Datamosh',
  blockDatamosh: 'Block Datamosh',
  glitchDatamosh: 'Glitch Datamosh',
  meltDatamosh: 'Melt Datamosh',
  toggleRgb: 'Chromatic / RGB Split',
  glitch: 'Glitch',
  cameraShake: 'Cam Shake',
};

interface ControlsProps {
  onExport: () => void;
  onCancelExport: () => void;
}

export default function Controls({ onExport, onCancelExport }: ControlsProps) {
  const {
    preset,
    displayMode,
    effects,
    analysis,
    isExporting,
    exportProgress,
    exportError,
    exportStatus,
    exportDownloadUrl,
    exportDownloadName,
    fps,
    particleSettings,
    visualizerSettings,
    visualizerLayerOrder,
    waveSettings,
    imageFxSettings,
    imageFxLayerOrder,
    backgroundImageUrl,
    isLiveMode,
    liveUiVisible,
    liveIntensity,
    exportPreset,
    setDisplayMode,
    setPreset,
    toggleEffect,
    setParticleCountScale,
    setParticleSizeScale,
    setParticleShape,
    setCameraDistance,
    setMorphIntensity,
    moveVisualizerLayer,
    resetVisualizerLayerOrder,
    setWaveType,
    setWaveBackgroundMode,
    setImageFxPreset,
    setImageFxEffect,
    moveImageFxLayer,
    resetImageFxLayerOrder,
    setIsLiveMode,
    setLiveUiVisible,
    setLiveHelpOpen,
    setExportPreset,
  } = useStore();
  const activePreset = PRESETS[preset];
  const activeExportPreset = EXPORT_PRESETS[exportPreset];
  const visibleParticleCount = Math.round(
    activePreset.particleCount
      * particleSettings.countScale
      * (activePreset.geometryMode === 'particles' ? 1 : 0.3),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5, height: '100%', overflow: 'auto', pr: 0.5 }}>
      {/* Display mode */}
      <Paper elevation={0} sx={{ p: 1.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
          Display Mode
        </Typography>
        <ToggleButtonGroup
          value={displayMode}
          exclusive
          onChange={(_, value) => value && setDisplayMode(value as DisplayMode)}
          orientation="vertical"
          fullWidth
          size="small"
          disabled={isExporting}
        >
          <ToggleButton value="visualizer3d" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
              3D Visualizer Mode
            </Typography>
          </ToggleButton>
          <ToggleButton value="wave" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
              Wave Visualizer Mode
            </Typography>
          </ToggleButton>
          <ToggleButton value="imageFx" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
              Image FX Mode
            </Typography>
          </ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {/* Live / VJ */}
      <Paper elevation={0} sx={{ p: 1.5 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
            Live / VJ
          </Typography>
          <Chip
            label={isLiveMode ? 'ON' : 'OFF'}
            size="small"
            color={isLiveMode ? 'primary' : 'default'}
            variant="outlined"
            sx={{ fontSize: 10, height: 18 }}
          />
        </Box>
        <Button
          variant={isLiveMode ? 'outlined' : 'contained'}
          color={isLiveMode ? 'inherit' : 'primary'}
          fullWidth
          size="small"
          disabled={isExporting}
          onClick={() => setIsLiveMode(!isLiveMode)}
          sx={{ fontWeight: 600, mb: isLiveMode ? 1 : 0 }}
        >
          {isLiveMode ? 'Exit Live / VJ' : 'Enter Live / VJ'}
        </Button>
        {isLiveMode && (
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setLiveUiVisible(!liveUiVisible)}
              sx={{ fontSize: 10, minWidth: 0 }}
            >
              {liveUiVisible ? 'Hide UI' : 'Show UI'}
            </Button>
            <Button
              variant="outlined"
              size="small"
              onClick={() => setLiveHelpOpen(true)}
              sx={{ fontSize: 10, minWidth: 0 }}
            >
              Help
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ gridColumn: '1 / -1', fontSize: 10 }}>
              Intensity {Math.round(liveIntensity * 100)}%
            </Typography>
          </Box>
        )}
      </Paper>

      {/* Analysis Stats */}
      {analysis && (
        <Paper elevation={0} sx={{ p: 1.5, bgcolor: 'background.paper' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
            <GraphicEqIcon sx={{ fontSize: 14, color: 'primary.main' }} />
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
              Analysis
            </Typography>
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.75 }}>
            <StatItem label="BPM" value={String(analysis.bpm)} />
            <StatItem label="LUFS" value={`${analysis.loudness.toFixed(1)} dB`} />
            <StatItem label="Stereo" value={`${(analysis.stereoWidth * 100).toFixed(0)}%`} />
            <StatItem label="Energy" value={analysis.energy} />
          </Box>
          <Box sx={{ mt: 1, display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            <Chip
              label={analysis.mood}
              size="small"
              color="primary"
              variant="outlined"
              sx={{ fontSize: 10, height: 18 }}
            />
          </Box>
        </Paper>
      )}

      {displayMode === 'visualizer3d' ? (
        <>
          {/* Presets */}
          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              Preset
            </Typography>
            <ToggleButtonGroup
              value={preset}
              exclusive
              onChange={(_, v) => setPreset((v ?? preset) as PresetId)}
              orientation="vertical"
              fullWidth
              size="small"
              disabled={isExporting}
            >
              {Object.values(PRESETS).map((p) => (
                <ToggleButton key={p.id} value={p.id} sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75 }}>
                  <Box>
                    <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600, textAlign: 'left' }}>
                      {p.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                      {p.description}
                    </Typography>
                  </Box>
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Paper>

          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              Camera / Morph
            </Typography>
            <ControlSlider
              label="Camera Distance"
              value={visualizerSettings.cameraDistance}
              valueLabel={visualizerSettings.cameraDistance.toFixed(1)}
              min={2.8}
              max={12}
              step={0.1}
              disabled={isExporting}
              onChange={setCameraDistance}
            />
            <ControlSlider
              label="Morph"
              value={visualizerSettings.morphIntensity}
              valueLabel={`${Math.round(visualizerSettings.morphIntensity * 100)}%`}
              min={0.35}
              max={3}
              step={0.05}
              disabled={isExporting}
              onChange={setMorphIntensity}
            />
          </Paper>

          {/* Particles */}
          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              Particles
            </Typography>
            <ControlSlider
              label="Count"
              value={particleSettings.countScale}
              valueLabel={formatParticleCount(visibleParticleCount)}
              min={0.25}
              max={2.5}
              step={0.05}
              disabled={isExporting}
              onChange={setParticleCountScale}
            />
            <ControlSlider
              label="Size"
              value={particleSettings.sizeScale}
              valueLabel={`${Math.round(particleSettings.sizeScale * 100)}%`}
              min={0.35}
              max={2}
              step={0.05}
              disabled={isExporting}
              onChange={setParticleSizeScale}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, display: 'block', mt: 1.25, mb: 0.5 }}>
              Shape
            </Typography>
            <ToggleButtonGroup
              value={particleSettings.shape}
              exclusive
              onChange={(_, value) => value && setParticleShape(value as ParticleShape)}
              fullWidth
              size="small"
              disabled={isExporting}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                '& .MuiToggleButton-root': {
                  fontSize: 10,
                  px: 0.5,
                  py: 0.45,
                  letterSpacing: 0,
                },
              }}
            >
              {PARTICLE_SHAPES.map(({ value, label }) => (
                <ToggleButton key={value} value={value}>
                  {label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          </Paper>

          {/* Effects */}
          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.5 }}>
              Effects
            </Typography>
            <EffectToggleList effects={effects} onToggle={toggleEffect} />
          </Paper>

          <Paper elevation={0} sx={{ p: 1.5 }}>
            <LayerOrderControls
              order={visualizerLayerOrder}
              labels={VISUALIZER_LAYER_LABELS}
              highlightedLayer="background"
              disabled={isExporting}
              onMove={moveVisualizerLayer}
              onReset={resetVisualizerLayerOrder}
            />
          </Paper>
        </>
      ) : displayMode === 'wave' ? (
        <Paper elevation={0} sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
            Wave
          </Typography>
          <ToggleButtonGroup
            value={waveSettings.type}
            exclusive
            onChange={(_, value) => value && setWaveType(value as WaveVisualizerType)}
            orientation="vertical"
            fullWidth
            size="small"
            disabled={isExporting}
          >
            <ToggleButton value="horizontal" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.65 }}>
              <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                Horizontal Wave
              </Typography>
            </ToggleButton>
            <ToggleButton value="circular" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.65 }}>
              <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                Circular Wave
              </Typography>
            </ToggleButton>
            <ToggleButton value="bars" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.65 }}>
              <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                Spectrum Bars
              </Typography>
            </ToggleButton>
          </ToggleButtonGroup>

          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mt: 1.5, mb: 1 }}>
            Background
          </Typography>
          <ToggleButtonGroup
            value={waveSettings.backgroundMode}
            exclusive
            onChange={(_, value) => value && setWaveBackgroundMode(value as WaveBackgroundMode)}
            fullWidth
            size="small"
            disabled={isExporting}
          >
            <ToggleButton value="solid" sx={{ px: 1, py: 0.65 }}>
              <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                Solid
              </Typography>
            </ToggleButton>
            <ToggleButton value="image" disabled={!backgroundImageUrl} sx={{ px: 1, py: 0.65 }}>
              <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                Image
              </Typography>
            </ToggleButton>
          </ToggleButtonGroup>
        </Paper>
      ) : (
        <Paper elevation={0} sx={{ p: 1.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
            Image FX
          </Typography>
          <ToggleButtonGroup
            value={imageFxSettings.preset}
            exclusive
            onChange={(_, value) => {
              if (value) {
                const presetValue = value as ImageFxPreset;
                setImageFxPreset(presetValue, IMAGE_FX_PRESETS[presetValue]);
              }
            }}
            orientation="vertical"
            fullWidth
            size="small"
            disabled={isExporting}
            sx={{ mb: 1.25 }}
          >
            {IMAGE_FX_PRESET_LABELS.map(({ value, label }) => (
              <ToggleButton key={value} value={value} sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.65 }}>
                <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
                  {label}
                </Typography>
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          {IMAGE_FX_SLIDERS.map(({ key, label }) => (
            <ControlSlider
              key={key}
              label={label}
              value={imageFxSettings[key]}
              valueLabel={`${Math.round(imageFxSettings[key] * 100)}%`}
              min={0}
              max={1}
              step={0.01}
              disabled={isExporting}
              onChange={(value) => setImageFxEffect(key, value)}
            />
          ))}

          <Divider sx={{ my: 1.25 }} />
          <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.5 }}>
            Effects
          </Typography>
          <EffectToggleList effects={effects} onToggle={toggleEffect} />

          <Divider sx={{ my: 1.25 }} />
          <LayerOrderControls
            order={imageFxLayerOrder}
            labels={IMAGE_FX_LAYER_LABELS}
            highlightedLayer="background"
            disabled={isExporting}
            onMove={moveImageFxLayer}
            onReset={resetImageFxLayerOrder}
          />
        </Paper>
      )}

      <Divider />

      {/* FPS */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        <Typography variant="caption" color="text.secondary">FPS</Typography>
        <Chip label={`${fps} fps`} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
      </Box>

      <ShortsControls />

      <Box sx={{ px: 0.5 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.75 }}>
          Export Preset
        </Typography>
        <ToggleButtonGroup
          value={exportPreset}
          exclusive
          onChange={(_, value) => value && setExportPreset(value as ExportPresetId)}
          orientation="vertical"
          fullWidth
          size="small"
          disabled={isExporting}
        >
          {EXPORT_PRESET_OPTIONS.map((option) => (
            <ToggleButton key={option.id} value={option.id} sx={{ justifyContent: 'flex-start', px: 1.25, py: 0.65 }}>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 700, textAlign: 'left', lineHeight: 1.25 }}>
                  {option.label}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9.5, display: 'block', lineHeight: 1.2 }}>
                  {option.description}
                </Typography>
              </Box>
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Box>

      {/* Export */}
      {isExporting ? (
        <Box sx={{ px: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>
            {exportStatus ?? 'Exporting...'} {Math.round(exportProgress * 100)}%
          </Typography>
          <LinearProgress variant="determinate" value={exportProgress * 100} />
          <Button
            variant="outlined"
            color="error"
            fullWidth
            size="small"
            startIcon={<CancelIcon />}
            onClick={onCancelExport}
            sx={{ fontWeight: 600 }}
          >
            Cancel
          </Button>
        </Box>
      ) : (
        <Box sx={{ px: 0.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
          {exportError && (
            <Alert severity="error" variant="outlined" sx={{ fontSize: 10, py: 0.25 }}>
              {exportError}
            </Alert>
          )}
          {exportDownloadUrl && (
            <Tooltip title="Download the last completed MP4 again">
              <Button
                variant="outlined"
                fullWidth
                size="small"
                startIcon={<FileDownloadIcon />}
                href={exportDownloadUrl}
                download={exportDownloadName}
                sx={{ fontWeight: 600 }}
              >
                Download Ready
              </Button>
            </Tooltip>
          )}
          <Tooltip title={!analysis ? 'Upload audio first' : `Export ${activeExportPreset.description} MP4`}>
            <span>
              <Button
                variant="contained"
                fullWidth
                size="small"
                startIcon={<FileDownloadIcon />}
                disabled={!analysis}
                onClick={onExport}
                sx={{
                  background: analysis
                    ? 'linear-gradient(135deg, #00bcd4 0%, #009688 100%)'
                    : undefined,
                  fontWeight: 600,
                  py: 1,
                }}
              >
                Export MP4
              </Button>
            </span>
          </Tooltip>
        </Box>
      )}
    </Box>
  );
}

function EffectToggleList({
  effects,
  onToggle,
}: {
  effects: EffectSettings;
  onToggle: (key: keyof EffectSettings) => void;
}) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column' }}>
      {EFFECT_LABELS.map(({ key, label }) => (
        <FormControlLabel
          key={key}
          control={
            <Switch
              size="small"
              checked={effects[key]}
              onChange={() => onToggle(key)}
              sx={{ '& .MuiSwitch-thumb': { width: 12, height: 12 }, '& .MuiSwitch-track': { borderRadius: 6 } }}
            />
          }
          label={<Typography variant="caption" sx={{ fontSize: 11 }}>{label}</Typography>}
          sx={{ m: 0, py: 0.25 }}
        />
      ))}
    </Box>
  );
}

function LayerOrderControls<TLayer extends string>({
  order,
  labels,
  highlightedLayer,
  disabled,
  onMove,
  onReset,
}: {
  order: TLayer[];
  labels: Record<TLayer, string>;
  highlightedLayer?: TLayer;
  disabled: boolean;
  onMove: (layer: TLayer, direction: -1 | 1) => void;
  onReset: () => void;
}) {
  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, mb: 0.75 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, flex: 1 }}>
          Layer Order
        </Typography>
        <Tooltip title="Reset layer order">
          <span>
            <IconButton
              size="small"
              onClick={onReset}
              disabled={disabled}
              sx={{ p: 0.35 }}
              aria-label="Reset layer order"
            >
              <RestartAltIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </span>
        </Tooltip>
      </Box>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.35 }}>
        {order.map((layer, index) => {
          const label = labels[layer];
          const isHighlighted = layer === highlightedLayer;
          return (
            <Box
              key={layer}
              sx={{
                display: 'grid',
                gridTemplateColumns: '20px 1fr 24px 24px',
                alignItems: 'center',
                gap: 0.35,
                minHeight: 26,
                px: 0.5,
                borderRadius: 1,
                bgcolor: isHighlighted ? 'rgba(0, 229, 238, 0.08)' : 'rgba(255,255,255,0.035)',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, fontWeight: 700 }}>
                {index + 1}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, fontWeight: isHighlighted ? 700 : 500 }}>
                {label}
              </Typography>
              <IconButton
                size="small"
                onClick={() => onMove(layer, -1)}
                disabled={disabled || index === 0}
                sx={{ p: 0.2 }}
                aria-label={`Move ${label} up`}
              >
                <KeyboardArrowUpIcon sx={{ fontSize: 15 }} />
              </IconButton>
              <IconButton
                size="small"
                onClick={() => onMove(layer, 1)}
                disabled={disabled || index === order.length - 1}
                sx={{ p: 0.2 }}
                aria-label={`Move ${label} down`}
              >
                <KeyboardArrowDownIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function ControlSlider({
  label,
  value,
  valueLabel,
  min,
  max,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  valueLabel: string;
  min: number;
  max: number;
  step: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <Box sx={{ '& + &': { mt: 1.25 } }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
          {label}
        </Typography>
        <Typography variant="caption" sx={{ fontSize: 10, fontWeight: 600 }}>
          {valueLabel}
        </Typography>
      </Box>
      <Slider
        size="small"
        value={value}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        onChange={(_, nextValue) => onChange(Array.isArray(nextValue) ? nextValue[0] : nextValue)}
        sx={{ py: 0.5 }}
      />
    </Box>
  );
}

function formatParticleCount(count: number) {
  if (count >= 10000) return `${Math.round(count / 1000)}k`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}k`;
  return String(count);
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontSize: 12, fontWeight: 600, color: 'primary.light' }}>
        {value}
      </Typography>
    </Box>
  );
}
