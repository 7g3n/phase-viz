import React, { useCallback, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Paper from '@mui/material/Paper';
import CircularProgress from '@mui/material/CircularProgress';
import IconButton from '@mui/material/IconButton';
import Tooltip from '@mui/material/Tooltip';
import { useStore } from '../store';
import { analyzeAudio } from '../audio/analyze';
import AudioFileIcon from '@mui/icons-material/AudioFile';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ImageIcon from '@mui/icons-material/Image';
import DeleteIcon from '@mui/icons-material/Delete';

export default function Uploader() {
  const {
    audioFile,
    isAnalyzing,
    backgroundImageUrl,
    setAudioFile,
    setAudioBuffer,
    setAnalysis,
    setIsAnalyzing,
    setDuration,
    setBackgroundImageUrl,
  } = useStore();
  const [dragOver, setDragOver] = useState(false);
  const [imageDragOver, setImageDragOver] = useState(false);

  const handleAudioFile = useCallback(
    async (file: File) => {
      if (!file.name.match(/\.(wav|mp3|flac|ogg|aac)$/i)) return;
      setAudioFile(file);
      setIsAnalyzing(true);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const ctx = new AudioContext();
        const buffer = await ctx.decodeAudioData(arrayBuffer);
        setAudioBuffer(buffer);
        setDuration(buffer.duration);
        const analysis = await analyzeAudio(buffer);
        setAnalysis(analysis);
      } catch (e) {
        console.error('Analysis failed:', e);
      } finally {
        setIsAnalyzing(false);
      }
    },
    [setAudioFile, setAudioBuffer, setAnalysis, setIsAnalyzing, setDuration],
  );

  const handleImageFile = useCallback(
    (file: File) => {
      if (!file.type.match(/^image\/(jpeg|png|webp|gif)$/)) return;
      const url = URL.createObjectURL(file);
      setBackgroundImageUrl(url);
    },
    [setBackgroundImageUrl],
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleAudioFile(file);
  };

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAudioFile(file);
  };

  const onImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setImageDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImageFile(file);
  };

  const onImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImageFile(file);
  };

  const clearBackgroundImage = () => {
    if (backgroundImageUrl) URL.revokeObjectURL(backgroundImageUrl);
    setBackgroundImageUrl(null);
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {/* Audio Upload */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          border: '1px dashed',
          borderColor: dragOver ? 'primary.main' : 'divider',
          borderRadius: 2,
          cursor: 'pointer',
          transition: 'border-color 0.2s, background-color 0.2s',
          bgcolor: dragOver ? 'rgba(0,188,212,0.05)' : 'background.paper',
          '&:hover': {
            borderColor: 'primary.main',
            bgcolor: 'rgba(0,188,212,0.04)',
          },
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => document.getElementById('audio-file-input')?.click()}
      >
        <input
          id="audio-file-input"
          type="file"
          accept=".wav,.mp3,.flac,.ogg,.aac"
          style={{ display: 'none' }}
          onChange={onInputChange}
        />

        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.5 }}>
          {isAnalyzing ? (
            <CircularProgress size={24} sx={{ color: 'primary.main' }} />
          ) : audioFile ? (
            <CheckCircleOutlineIcon sx={{ color: 'success.main', fontSize: 24 }} />
          ) : (
            <AudioFileIcon sx={{ color: 'primary.main', fontSize: 24, opacity: 0.7 }} />
          )}

          <Typography variant="caption" color={audioFile ? 'success.main' : 'text.secondary'} sx={{ textAlign: 'center', fontSize: 10 }}>
            {isAnalyzing
              ? 'Analyzing...'
              : audioFile
              ? audioFile.name.length > 20 ? audioFile.name.slice(0, 20) + '...' : audioFile.name
              : 'Drop audio file'}
          </Typography>
        </Box>
      </Paper>

      {/* Background Image Upload */}
      <Paper
        elevation={0}
        sx={{
          p: 1.5,
          border: '1px dashed',
          borderColor: imageDragOver ? 'secondary.main' : 'divider',
          borderRadius: 2,
          cursor: 'pointer',
          transition: 'border-color 0.2s, background-color 0.2s',
          bgcolor: imageDragOver ? 'rgba(0,150,136,0.05)' : 'background.paper',
          '&:hover': {
            borderColor: 'secondary.main',
            bgcolor: 'rgba(0,150,136,0.04)',
          },
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setImageDragOver(true);
        }}
        onDragLeave={() => setImageDragOver(false)}
        onDrop={onImageDrop}
        onClick={() => !backgroundImageUrl && document.getElementById('image-file-input')?.click()}
      >
        <input
          id="image-file-input"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          style={{ display: 'none' }}
          onChange={onImageInputChange}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <ImageIcon sx={{ color: backgroundImageUrl ? 'secondary.main' : 'text.secondary', fontSize: 20, opacity: backgroundImageUrl ? 1 : 0.6 }} />
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
              {backgroundImageUrl ? 'Background set' : 'Background image'}
            </Typography>
          </Box>
          {backgroundImageUrl && (
            <Tooltip title="Remove background">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  clearBackgroundImage();
                }}
                sx={{ p: 0.25 }}
              >
                <DeleteIcon sx={{ fontSize: 16, color: 'text.secondary' }} />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </Paper>
    </Box>
  );
}
