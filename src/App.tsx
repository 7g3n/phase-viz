import { useRef } from 'react';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import theme from './theme';
import { useStore } from './store';
import Uploader from './ui/Uploader';
import Controls from './ui/Controls';
import VisualizerCanvas from './ui/VisualizerCanvas';
import Timeline from './ui/Timeline';
import type { ExportFrameRenderer, FrameRecorder } from './export/recorder';

export default function App() {
  const recorderRef = useRef<FrameRecorder | null>(null);
  const exportRendererRef = useRef<ExportFrameRenderer | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { audioBuffer, analysis, isExporting, isFullscreen, setIsFullscreen, setIsExporting, setExportProgress } = useStore();

  const handleExport = async () => {
    if (isExporting || !audioBuffer || !analysis || !exportRendererRef.current) return;

    const abortController = new AbortController();
    exportAbortRef.current = abortController;
    setIsExporting(true);
    setExportProgress(0);

    const fps = 30;

    try {
      await exportRendererRef.current({
        duration: analysis.duration,
        fps,
        signal: abortController.signal,
        onProgress: setExportProgress,
      });

      setExportProgress(0);
    } catch (err) {
      if (!abortController.signal.aborted && !isAbortError(err)) {
        console.error('Export failed:', err);
      }
    } finally {
      if (exportAbortRef.current === abortController) {
        exportAbortRef.current = null;
      }
      setIsExporting(false);
      setExportProgress(0);
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const toggleFullscreen = () => {
    const el = containerRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      el.requestFullscreen().then(() => setIsFullscreen(true));
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          bgcolor: 'background.default',
        }}
      >
        {/* Header */}
        <Box
          component="header"
          sx={{
            display: 'flex',
            alignItems: 'center',
            px: 2,
            py: 1,
            borderBottom: '1px solid',
            borderColor: 'divider',
            bgcolor: 'background.paper',
            gap: 1.5,
            flexShrink: 0,
            zIndex: 10,
          }}
        >
          <GraphicEqIcon sx={{ color: 'primary.main', fontSize: 20 }} />
          <Typography
            variant="h6"
            sx={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'primary.light',
              flex: 1,
            }}
          >
            Audio Reactive 3D Visualizer
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
            Three.js · Web Audio API · WebGL
          </Typography>
        </Box>

        {/* Main layout */}
        <Box sx={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left panel */}
          {!isFullscreen && (
            <Paper
              elevation={0}
              sx={{
                width: 220,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                gap: 1.5,
                p: 1.5,
                borderRadius: 0,
                borderRight: '1px solid',
                borderColor: 'divider',
                overflow: 'auto',
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 9 }}>
                Input
              </Typography>
              <Uploader />

              {analysis && (
                <Box>
                  <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, fontSize: 9, display: 'block', mb: 0.5 }}>
                    Waveform
                  </Typography>
                  <WaveformMini waveform={analysis.waveform} />
                </Box>
              )}
            </Paper>
          )}

          {/* Canvas */}
          <Box
            ref={containerRef}
            sx={{
              flex: 1,
              position: 'relative',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <Box sx={{ flex: 1, position: 'relative' }}>
              <VisualizerCanvas recorderRef={recorderRef} exportRendererRef={exportRendererRef} />

              {/* Fullscreen toggle */}
              <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
                <IconButton
                  size="small"
                  onClick={toggleFullscreen}
                  sx={{
                    position: 'absolute',
                    top: 8,
                    right: 8,
                    bgcolor: 'rgba(0,0,0,0.5)',
                    color: 'text.primary',
                    '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' },
                  }}
                >
                  {isFullscreen ? (
                    <FullscreenExitIcon fontSize="small" />
                  ) : (
                    <FullscreenIcon fontSize="small" />
                  )}
                </IconButton>
              </Tooltip>

              {/* Empty state */}
              {!analysis && (
                <Box
                  sx={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    pointerEvents: 'none',
                  }}
                >
                  <GraphicEqIcon sx={{ fontSize: 48, color: 'primary.main', opacity: 0.15, mb: 1 }} />
                  <Typography variant="body2" color="text.secondary" sx={{ opacity: 0.4, fontSize: 12 }}>
                    Upload audio to start visualizing
                  </Typography>
                </Box>
              )}
            </Box>

            <Timeline />
          </Box>

          {/* Right panel */}
          {!isFullscreen && (
            <Paper
              elevation={0}
              sx={{
                width: 220,
                flexShrink: 0,
                p: 1.5,
                borderRadius: 0,
                borderLeft: '1px solid',
                borderColor: 'divider',
                overflow: 'auto',
              }}
            >
              <Controls onExport={handleExport} onCancelExport={handleCancelExport} />
            </Paper>
          )}
        </Box>
      </Box>
    </ThemeProvider>
  );
}

function isAbortError(err: unknown) {
  return err instanceof DOMException && err.name === 'AbortError';
}

function WaveformMini({ waveform }: { waveform: Float32Array }) {
  const width = 186;
  const height = 40;
  const points = Array.from(waveform);
  const step = width / points.length;

  const pathTop = points
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${i * step},${height / 2 - v * (height / 2 - 2)}`)
    .join(' ');
  const pathBottom = points
    .map((v, i) => `${i * step},${height / 2 + v * (height / 2 - 2)}`)
    .reverse()
    .join(' L');

  return (
    <svg width={width} height={height} style={{ display: 'block' }}>
      <path
        d={`${pathTop} L${(points.length - 1) * step},${height / 2} ${pathBottom} Z`}
        fill="rgba(0,188,212,0.25)"
        stroke="rgba(0,188,212,0.6)"
        strokeWidth="0.5"
      />
    </svg>
  );
}
