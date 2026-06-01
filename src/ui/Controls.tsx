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
import { useStore } from '../store';
import type {
  DisplayMode,
  EffectSettings,
  PresetId,
  WaveBackgroundMode,
  WaveVisualizerType,
} from '../store';
import { PRESETS } from '../visual/presets';
import FileDownloadIcon from '@mui/icons-material/FileDownload';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import CancelIcon from '@mui/icons-material/Cancel';

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
    waveSettings,
    backgroundImageUrl,
    setDisplayMode,
    setPreset,
    toggleEffect,
    setParticleCountScale,
    setParticleSizeScale,
    setWaveType,
    setWaveBackgroundMode,
  } = useStore();
  const activePreset = PRESETS[preset];
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
              3D Visualizer
            </Typography>
          </ToggleButton>
          <ToggleButton value="wave" sx={{ justifyContent: 'flex-start', px: 1.5, py: 0.75 }}>
            <Typography variant="body2" sx={{ fontSize: 11, fontWeight: 600 }}>
              Wave Visualizer Mode
            </Typography>
          </ToggleButton>
        </ToggleButtonGroup>
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

          {/* Particles */}
          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 1 }}>
              Particles
            </Typography>
            <ParticleSlider
              label="Count"
              value={particleSettings.countScale}
              valueLabel={formatParticleCount(visibleParticleCount)}
              min={0.25}
              max={2.5}
              step={0.05}
              disabled={isExporting}
              onChange={setParticleCountScale}
            />
            <ParticleSlider
              label="Size"
              value={particleSettings.sizeScale}
              valueLabel={`${Math.round(particleSettings.sizeScale * 100)}%`}
              min={0.35}
              max={2}
              step={0.05}
              disabled={isExporting}
              onChange={setParticleSizeScale}
            />
          </Paper>

          {/* Effects */}
          <Paper elevation={0} sx={{ p: 1.5 }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, display: 'block', mb: 0.5 }}>
              Effects
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column' }}>
              {EFFECT_LABELS.map(({ key, label }) => (
                <FormControlLabel
                  key={key}
                  control={
                    <Switch
                      size="small"
                      checked={effects[key]}
                      onChange={() => toggleEffect(key)}
                      sx={{ '& .MuiSwitch-thumb': { width: 12, height: 12 }, '& .MuiSwitch-track': { borderRadius: 6 } }}
                    />
                  }
                  label={<Typography variant="caption" sx={{ fontSize: 11 }}>{label}</Typography>}
                  sx={{ m: 0, py: 0.25 }}
                />
              ))}
            </Box>
          </Paper>
        </>
      ) : (
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
      )}

      <Divider />

      {/* FPS */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', px: 0.5 }}>
        <Typography variant="caption" color="text.secondary">FPS</Typography>
        <Chip label={`${fps} fps`} size="small" variant="outlined" sx={{ fontSize: 10, height: 18 }} />
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
          <Tooltip title={!analysis ? 'Upload audio first' : 'Export 1080p MP4'}>
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

function ParticleSlider({
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
