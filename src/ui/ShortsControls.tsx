import { useEffect, useMemo, useRef } from 'react';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Paper from '@mui/material/Paper';
import Slider from '@mui/material/Slider';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { EXPORT_CLIP_LENGTHS, isPortraitExportPreset, useStore } from '../store';
import { findHookWindow } from '../audio/hook';

const TEXT_FIELD_SX = {
  '& .MuiInputBase-input': { fontSize: 11, py: 0.75 },
  '& .MuiInputLabel-root': { fontSize: 11 },
};

export default function ShortsControls() {
  const {
    analysis,
    isExporting,
    exportClip,
    exportOverlay,
    exportPreset,
    setExportClip,
    setExportOverlay,
    setExportPreset,
  } = useStore();
  const previewTimerRef = useRef<number>(0);
  const { enabled, length, start, autoStart } = exportClip;
  const duration = analysis?.duration ?? 0;
  const clipLength = duration > 0 ? Math.min(length, duration) : length;
  const maxStart = Math.max(0, duration - clipLength);
  const clampedStart = Math.min(start, maxStart);

  const hook = useMemo(
    () => (enabled && analysis ? findHookWindow(analysis, length) : null),
    [enabled, analysis, length],
  );

  // Keep the start on the detected hook until the user drags it somewhere else.
  useEffect(() => {
    if (!autoStart || !hook || hook.start === start) return;
    setExportClip({ start: hook.start });
  }, [autoStart, hook, start, setExportClip]);

  useEffect(() => () => window.clearTimeout(previewTimerRef.current), []);

  const handleToggle = (next: boolean) => {
    setExportClip({ enabled: next });
    if (next && !isPortraitExportPreset(exportPreset)) {
      setExportPreset('shorts1080');
    } else if (!next && isPortraitExportPreset(exportPreset)) {
      setExportPreset('high1080p');
    }
  };

  const handlePreview = () => {
    const state = useStore.getState();
    window.clearTimeout(previewTimerRef.current);
    state.setIsPlaying(false);
    state.setCurrentTime(clampedStart);
    // Restart on the next frame so the visualizers tear down and recreate their audio source.
    requestAnimationFrame(() => {
      useStore.getState().setIsPlaying(true);
      previewTimerRef.current = window.setTimeout(() => {
        useStore.getState().setIsPlaying(false);
      }, clipLength * 1000);
    });
  };

  return (
    <Paper elevation={0} sx={{ p: 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Shorts / Clip
        </Typography>
        <Switch
          size="small"
          checked={enabled}
          onChange={(_, checked) => handleToggle(checked)}
          disabled={isExporting}
          slotProps={{ input: { 'aria-label': 'Export a short clip' } }}
        />
      </Box>

      {!enabled ? (
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, opacity: 0.7 }}>
          Export the hook of the track as a 9:16 clip with a title.
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25, mt: 0.5 }}>
          <ToggleButtonGroup
            value={length}
            exclusive
            fullWidth
            size="small"
            onChange={(_, value) => value && setExportClip({ length: value as number })}
            disabled={isExporting}
          >
            {EXPORT_CLIP_LENGTHS.map((seconds) => (
              <ToggleButton key={seconds} value={seconds} sx={{ fontSize: 11, py: 0.4 }}>
                {seconds}s
              </ToggleButton>
            ))}
          </ToggleButtonGroup>

          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color={autoStart ? 'primary' : 'text.secondary'} sx={{ fontSize: 10 }}>
                {autoStart ? 'Hook' : 'Start'}
              </Typography>
              <Typography variant="caption" sx={{ fontSize: 10, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                {formatClipTime(clampedStart)}–{formatClipTime(clampedStart + clipLength)}
              </Typography>
            </Box>
            <Slider
              size="small"
              value={clampedStart}
              min={0}
              max={maxStart || 1}
              step={0.1}
              disabled={!analysis || isExporting || maxStart === 0}
              onChange={(_, value) => setExportClip({ start: value as number, autoStart: false })}
            />
            <Box sx={{ display: 'flex', gap: 0.5, '& .MuiButton-startIcon': { mr: 0.4, ml: -0.25 } }}>
              <Tooltip title="Jump to the loudest section that starts on a drop">
                <span style={{ flex: 1 }}>
                  <Button
                    fullWidth
                    size="small"
                    variant={autoStart ? 'contained' : 'outlined'}
                    startIcon={<AutoAwesomeIcon sx={{ fontSize: 14 }} />}
                    disabled={!analysis || isExporting}
                    onClick={() => setExportClip({ autoStart: true })}
                    sx={{ fontSize: 10, py: 0.4, whiteSpace: 'nowrap', minWidth: 0 }}
                  >
                    Find hook
                  </Button>
                </span>
              </Tooltip>
              <Button
                size="small"
                variant="outlined"
                startIcon={<PlayArrowIcon sx={{ fontSize: 14 }} />}
                disabled={!analysis || isExporting}
                onClick={handlePreview}
                sx={{ fontSize: 10, py: 0.4, flex: 1, whiteSpace: 'nowrap', minWidth: 0 }}
              >
                Preview
              </Button>
            </Box>
          </Box>

          <TextField
            label="Title"
            size="small"
            value={exportOverlay.title}
            onChange={(event) => setExportOverlay({ title: event.target.value })}
            disabled={isExporting}
            sx={TEXT_FIELD_SX}
          />
          <TextField
            label="Artist"
            size="small"
            value={exportOverlay.artist}
            onChange={(event) => setExportOverlay({ artist: event.target.value })}
            disabled={isExporting}
            sx={TEXT_FIELD_SX}
          />
          <FormControlLabel
            control={(
              <Switch
                size="small"
                checked={exportOverlay.showCredit}
                onChange={(_, checked) => setExportOverlay({ showCredit: checked })}
                disabled={isExporting}
              />
            )}
            label={<Typography sx={{ fontSize: 11 }}>Credit (phase-viz URL)</Typography>}
            sx={{ mx: 0 }}
          />
        </Box>
      )}
    </Paper>
  );
}

function formatClipTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = safe - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}
