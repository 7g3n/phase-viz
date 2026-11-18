import React, { Suspense, useEffect } from 'react';
import FullscreenIcon from '@mui/icons-material/Fullscreen';
import FullscreenExitIcon from '@mui/icons-material/FullscreenExit';
import GraphicEqIcon from '@mui/icons-material/GraphicEq';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import VideocamIcon from '@mui/icons-material/Videocam';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Tooltip from '@mui/material/Tooltip';
import Typography from '@mui/material/Typography';
import Timeline from '../ui/Timeline';
import OverlayPreview from '../ui/OverlayPreview';
import { EXPORT_PRESETS, isPortraitExportPreset, useStore } from '../store';
import { hasVisibleOverlay } from '../export/overlay';
import LiveVJHelp from '../ui/LiveVJHelp';
import type { DisplayMode, LiveHelpLanguage } from '../store';
import type { ExportFrameRenderer, FrameRecorder } from '../export/recorder';

const VisualizerCanvas = React.lazy(() => import('../ui/VisualizerCanvas'));
const WaveVisualizer = React.lazy(() => import('../ui/WaveVisualizer'));
const ImageFXVisualizer = React.lazy(() => import('../ui/ImageFXVisualizer'));

interface CanvasStageProps {
  analysisReady: boolean;
  containerRef: React.MutableRefObject<HTMLDivElement | null>;
  displayMode: DisplayMode;
  exportRendererRef: React.MutableRefObject<ExportFrameRenderer | null>;
  recorderRef: React.MutableRefObject<FrameRecorder | null>;
  isFullscreen: boolean;
  isLiveMode: boolean;
  liveUiVisible: boolean;
  liveHelpOpen: boolean;
  liveHelpLanguage: LiveHelpLanguage;
  liveIntensity: number;
  liveBoost: boolean;
  showChrome: boolean;
  onToggleFullscreen: () => void;
  onExitLiveMode: () => void;
  onHideLiveUi: () => void;
  onOpenLiveHelp: () => void;
  onCloseLiveHelp: () => void;
  onLiveHelpLanguageChange: (language: LiveHelpLanguage) => void;
}

export default function CanvasStage({
  analysisReady,
  containerRef,
  displayMode,
  exportRendererRef,
  recorderRef,
  isFullscreen,
  isLiveMode,
  liveUiVisible,
  liveHelpOpen,
  liveHelpLanguage,
  liveIntensity,
  liveBoost,
  showChrome,
  onToggleFullscreen,
  onExitLiveMode,
  onHideLiveUi,
  onOpenLiveHelp,
  onCloseLiveHelp,
  onLiveHelpLanguageChange,
}: CanvasStageProps) {
  const exportPreset = useStore((state) => state.exportPreset);
  const clipEnabled = useStore((state) => state.exportClip.enabled);
  const exportOverlay = useStore((state) => state.exportOverlay);
  const portraitPreview = !isLiveMode && isPortraitExportPreset(exportPreset);
  const presetSize = EXPORT_PRESETS[exportPreset];
  const showOverlayPreview = clipEnabled && !isLiveMode && hasVisibleOverlay(exportOverlay);

  // The visualizers size their canvases on window resize; nudge them when the frame changes shape.
  useEffect(() => {
    const id = requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
    return () => cancelAnimationFrame(id);
  }, [portraitPreview]);

  return (
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
      <Box sx={{ flex: 1, position: 'relative', bgcolor: portraitPreview ? '#000' : undefined }}>
        <Box
          sx={portraitPreview
            ? {
              position: 'absolute',
              top: 0,
              left: '50%',
              height: '100%',
              maxWidth: '100%',
              aspectRatio: `${presetSize.width} / ${presetSize.height}`,
              transform: 'translateX(-50%)',
              boxShadow: '0 0 0 1px rgba(255,255,255,0.08)',
            }
            : { position: 'absolute', inset: 0 }}
        >
          <Suspense fallback={<div style={{ width: '100%', height: '100%' }} />}>
            {displayMode === 'imageFx' ? (
              <ImageFXVisualizer exportRendererRef={exportRendererRef} />
            ) : displayMode === 'wave' ? (
              <WaveVisualizer exportRendererRef={exportRendererRef} />
            ) : (
              <VisualizerCanvas recorderRef={recorderRef} exportRendererRef={exportRendererRef} />
            )}
          </Suspense>
          {showOverlayPreview && <OverlayPreview overlay={exportOverlay} />}
        </Box>

        {showChrome && (
          <Tooltip title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <IconButton
              size="small"
              onClick={onToggleFullscreen}
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
        )}

        {!analysisReady && showChrome && (
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

        {isLiveMode && liveUiVisible && (
          <Paper
            elevation={4}
            sx={{
              position: 'absolute',
              left: 8,
              top: 8,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
              px: 1,
              py: 0.5,
              bgcolor: 'rgba(5,5,8,0.72)',
              borderColor: 'rgba(0, 229, 238, 0.18)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <Chip
              icon={<VideocamIcon sx={{ fontSize: 14 }} />}
              label={liveBoost ? 'BOOST' : `LIVE ${Math.round(liveIntensity * 100)}%`}
              size="small"
              color={liveBoost ? 'secondary' : 'primary'}
              sx={{ height: 22, fontSize: 10, borderRadius: 1 }}
            />
            <Tooltip title="Hide UI (H)">
              <IconButton size="small" onClick={onHideLiveUi} sx={{ color: 'text.primary', p: 0.5 }}>
                <VisibilityOffIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Shortcuts (?)">
              <IconButton size="small" onClick={onOpenLiveHelp} sx={{ color: 'text.primary', p: 0.5 }}>
                <HelpOutlineIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
            <Button
              variant="outlined"
              size="small"
              onClick={onExitLiveMode}
              sx={{ fontSize: 10, minWidth: 0, px: 0.75, py: 0.25 }}
            >
              Exit
            </Button>
          </Paper>
        )}

        {isLiveMode && !liveUiVisible && liveHelpOpen && (
          <Box
            sx={{
              position: 'absolute',
              left: 8,
              top: 8,
              zIndex: 20,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
              px: 0.75,
              py: 0.35,
              borderRadius: 1,
              bgcolor: 'rgba(5,5,8,0.72)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(10px)',
            }}
          >
            <VisibilityIcon sx={{ fontSize: 14, color: 'primary.light' }} />
            <Typography variant="caption" sx={{ fontSize: 10, color: 'text.secondary' }}>
              UI hidden
            </Typography>
          </Box>
        )}

        {isLiveMode && liveHelpOpen && (
          <LiveVJHelp
            language={liveHelpLanguage}
            onLanguageChange={onLiveHelpLanguageChange}
            onClose={onCloseLiveHelp}
          />
        )}
      </Box>

      {showChrome && <Timeline />}
    </Box>
  );
}
