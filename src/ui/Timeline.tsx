import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import IconButton from '@mui/material/IconButton';
import Typography from '@mui/material/Typography';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PauseIcon from '@mui/icons-material/Pause';
import StopIcon from '@mui/icons-material/Stop';
import { useStore } from '../store';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function Timeline() {
  const { isPlaying, currentTime, duration, fps, setIsPlaying, setCurrentTime, analysis } =
    useStore();

  const handlePlayPause = () => {
    if (!analysis) return;
    setIsPlaying(!isPlaying);
  };

  const handleStop = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 2,
        py: 0.75,
        bgcolor: 'background.paper',
        borderTop: '1px solid',
        borderColor: 'divider',
        minHeight: 44,
      }}
    >
      <IconButton
        size="small"
        onClick={handlePlayPause}
        disabled={!analysis}
        sx={{ color: 'primary.main' }}
      >
        {isPlaying ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
      </IconButton>

      <IconButton size="small" onClick={handleStop} disabled={!analysis} sx={{ color: 'text.secondary' }}>
        <StopIcon fontSize="small" />
      </IconButton>

      <Typography variant="caption" sx={{ minWidth: 36, color: 'text.secondary', fontSize: 10 }}>
        {formatTime(currentTime)}
      </Typography>

      <Slider
        value={currentTime}
        min={0}
        max={duration || 1}
        step={0.01}
        onChange={(_, v) => setCurrentTime(v as number)}
        disabled={!analysis}
        size="small"
        sx={{ flex: 1, mx: 1 }}
      />

      <Typography variant="caption" sx={{ minWidth: 36, color: 'text.secondary', fontSize: 10 }}>
        {formatTime(duration)}
      </Typography>

      <Typography
        variant="caption"
        sx={{
          ml: 1,
          px: 0.75,
          py: 0.25,
          borderRadius: 1,
          bgcolor: fps >= 55 ? 'rgba(0,200,83,0.12)' : fps >= 30 ? 'rgba(255,160,0,0.12)' : 'rgba(211,47,47,0.12)',
          color: fps >= 55 ? 'success.main' : fps >= 30 ? 'warning.main' : 'error.main',
          fontSize: 10,
          fontWeight: 700,
          fontFamily: 'monospace',
          minWidth: 40,
          textAlign: 'center',
        }}
      >
        {fps} FPS
      </Typography>
    </Box>
  );
}
