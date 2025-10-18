import { useRef, useState, useLayoutEffect } from 'react';
import { Box, CircularProgress, Typography, Alert, IconButton } from '@mui/material';
import { PlayArrow, Pause, Replay, FastForward, FastRewind } from '@mui/icons-material';

interface AsciinemaPlayerProps {
  sessionId: string;
  recording: string | null;
  cols?: number;
  rows?: number;
}

export default function AsciinemaPlayer({ sessionId, recording, cols = 120, rows = 30 }: AsciinemaPlayerProps) {
  const playerDivRef = useRef<HTMLDivElement | null>(null);
  const playerInstanceRef = useRef<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(true); // 自动播放，初始状态为 true

  // 使用 useLayoutEffect 确保 DOM 同步更新后立即执行
  useLayoutEffect(() => {
    console.log('[AsciinemaPlayer] useLayoutEffect triggered (同步执行)');
    console.log('[AsciinemaPlayer] Session:', sessionId);
    console.log('[AsciinemaPlayer] Recording size:', recording?.length || 0);

    // 检查录制数据
    if (!recording || recording.trim() === '') {
      setLoading(false);
      setError('没有可用的录制数据');
      return;
    }

    let attempts = 0;
    const maxAttempts = 50; // 最多等待 5 秒
    let intervalId: ReturnType<typeof setInterval> | null = null;
    
    // 轮询等待 DOM 元素就绪
    const checkAndLoad = () => {
      attempts++;
      console.log(`[AsciinemaPlayer] Checking DOM (attempt ${attempts}/${maxAttempts})...`);
      console.log('[AsciinemaPlayer] playerDivRef.current:', playerDivRef.current ? 'EXISTS ' : 'null ');

      if (playerDivRef.current) {
        console.log('[AsciinemaPlayer]  DOM is ready! Starting player...');
        if (intervalId) clearInterval(intervalId);
        loadPlayerAsync(playerDivRef.current);
      } else if (attempts >= maxAttempts) {
        console.error('[AsciinemaPlayer]  Timeout waiting for DOM');
        if (intervalId) clearInterval(intervalId);
        setLoading(false);
        setError('播放器容器未就绪（超时）');
      }
    };

    // 立即检查一次
    checkAndLoad();
    
    // 如果第一次检查失败，开始轮询
    intervalId = setInterval(checkAndLoad, 100);

    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [sessionId, recording, cols, rows]);

  // 播放控制函数
  const handlePlay = () => {
    if (playerInstanceRef.current) {
      playerInstanceRef.current.play();
    }
  };

  const handlePause = () => {
    if (playerInstanceRef.current) {
      playerInstanceRef.current.pause();
    }
  };

  const handleRestart = () => {
    if (playerInstanceRef.current) {
      playerInstanceRef.current.seek(0);
      playerInstanceRef.current.play();
    }
  };

  const handleFastForward = () => {
    if (playerInstanceRef.current && playerInstanceRef.current.getCurrentTime) {
      const currentTime = playerInstanceRef.current.getCurrentTime();
      playerInstanceRef.current.seek(currentTime + 5);
    }
  };

  const handleFastRewind = () => {
    if (playerInstanceRef.current && playerInstanceRef.current.getCurrentTime) {
      const currentTime = playerInstanceRef.current.getCurrentTime();
      playerInstanceRef.current.seek(Math.max(0, currentTime - 5));
    }
  };

  // 将 loadPlayer 改名为 loadPlayerAsync 并提取到外部
  const loadPlayerAsync = async (containerNode: HTMLDivElement) => {
    try {
      console.log('[AsciinemaPlayer] Loading asciinema-player module...');

      // 动态导入 asciinema-player 和 CSS
      const [AsciinemaPlayerModule] = await Promise.all([
        import('asciinema-player'),
        import('asciinema-player/dist/bundle/asciinema-player.css'),
      ]);
      
      console.log('[AsciinemaPlayer] Module loaded successfully');
      
      // asciinema-player v3 的正确导入方式
      const create = AsciinemaPlayerModule.default?.create || AsciinemaPlayerModule.create;
      
      if (!create) {
        throw new Error('asciinema-player create function not found');
      }

      // 清空容器
      containerNode.innerHTML = '';

      // 创建 Blob URL
      const blob = new Blob([recording!], { type: 'text/plain' });
      const recordingUrl = URL.createObjectURL(blob);
      
      console.log('[AsciinemaPlayer] Blob URL created:', recordingUrl);
      console.log('[AsciinemaPlayer] Recording preview:', recording!.substring(0, 100));

      // 创建播放器 - 完整配置（参考 demo）
      const player = create(recordingUrl, containerNode, {
        cols: cols,
        rows: rows,
        autoPlay: true,            // 自动播放
        loop: false,               // 不循环播放
        startAt: 0,                // 从头开始
        speed: 1,                  // 正常速度
        idleTimeLimit: 2,          // 空闲时间限制 2 秒
        preload: true,             // 预加载
        theme: 'monokai',          // 主题
        fit: 'width',              // 适配宽度
        terminalFontSize: '14px',  // 字体大小
        terminalLineHeight: 1.4,   // 行高
        terminalFontFamily: 'Consolas, Menlo, "Courier New", monospace',
      });
      
      console.log('[AsciinemaPlayer] Player config:', { autoPlay: true, loop: false });

      console.log('[AsciinemaPlayer] Player created with methods:', {
        hasPlay: typeof player.play === 'function',
        hasPause: typeof player.pause === 'function',
        hasSeek: typeof player.seek === 'function'
      });
      
      // 保存 player 实例以便控制按钮使用
      playerInstanceRef.current = player;
      
      // 监听播放事件
      player.addEventListener?.('play', () => {
        console.log('[AsciinemaPlayer] Playing');
        setIsPlaying(true);
      });
      
      player.addEventListener?.('pause', () => {
        console.log('[AsciinemaPlayer] Paused');
        setIsPlaying(false);
      });
      
      player.addEventListener?.('ended', () => {
        console.log('[AsciinemaPlayer] Ended - stopping playback');
        setIsPlaying(false);
        // 确保播放完成后停止，不循环
        if (player.pause) {
          player.pause();
        }
      });

      console.log('[AsciinemaPlayer]  Player created successfully');
      setLoading(false);
      setError(null);
    } catch (err: any) {
      console.error('[AsciinemaPlayer]  Failed to load player:', err);
      setError('播放器加载失败: ' + err.message);
      setLoading(false);
    }
  };

  // 始终渲染容器（确保 ref 被设置），在上面叠加 loading/error 状态
  return (
    <Box
      sx={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: '#000',
        borderRadius: 1,
        overflow: 'hidden',
        position: 'relative',
        
        // 为播放器 div 添加滚动条样式
        '& > div:first-of-type': {
          // 自定义滚动条样式（Chrome/Safari）
          '&::-webkit-scrollbar': {
            width: '14px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(255, 255, 255, 0.05)',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(102, 126, 234, 0.7)',
            borderRadius: '7px',
            border: '3px solid rgba(0, 0, 0, 1)',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(102, 126, 234, 0.9)',
          },
        },
        
        // asciinema-player 样式优化
        '& .asciinema-player-wrapper': {
          width: '100%',
          height: 'auto',
          maxHeight: '600px',
          overflowY: 'scroll',  // 始终显示滚动条
          // 自定义滚动条样式（Chrome/Safari）
          '&::-webkit-scrollbar': {
            width: '12px',
          },
          '&::-webkit-scrollbar-track': {
            background: 'rgba(255, 255, 255, 0.05)',
            borderRadius: '0 0 8px 0',
          },
          '&::-webkit-scrollbar-thumb': {
            background: 'rgba(102, 126, 234, 0.6)',
            borderRadius: '6px',
            border: '2px solid transparent',
            backgroundClip: 'padding-box',
          },
          '&::-webkit-scrollbar-thumb:hover': {
            background: 'rgba(102, 126, 234, 0.8)',
          },
        },
        '& .asciinema-player': {
          width: '100%',
          height: 'auto',
        },
        '& .asciinema-terminal': {
          minHeight: '450px',
          paddingBottom: '20px',
        },
        '& .asciinema-terminal pre': {
          paddingBottom: '20px !important',  // 适度的底部留白
          marginBottom: '0 !important',
        },
        // 确保控制条可见且突出
        '& .control-bar': {
          display: 'flex !important',
          visibility: 'visible !important',
          background: 'rgba(0, 0, 0, 0.9) !important',
          padding: '10px !important',
          borderTop: '1px solid rgba(255, 255, 255, 0.1) !important',
        },
        '& .playback-button': {
          display: 'inline-block !important',
        },
      }}
    >
      {/* 播放器容器 - 始终存在，带滚动条，占据剩余空间 */}
      <div 
        ref={playerDivRef} 
        style={{ 
          width: '100%', 
          flex: '1',
          overflowY: 'scroll',
          visibility: (loading || error) ? 'hidden' : 'visible',
        }} 
      />
      
      {/* 自定义控制条 - 位于播放器下方的独立区域，固定不滚动 */}
      {!loading && !error && (
        <Box
          sx={{
            width: '100%',
            padding: '16px 0',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: '#000',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            flexShrink: 0,
          }}
        >
          <Box
            sx={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.95), rgba(0,0,0,0.9))',
              backdropFilter: 'blur(10px)',
              padding: '10px 20px',
              borderRadius: '30px',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              gap: 1,
            }}
          >
          <IconButton
            onClick={handleFastRewind}
            sx={{ color: 'white' }}
            title="后退 5 秒"
          >
            <FastRewind />
          </IconButton>
          
          {isPlaying ? (
            <IconButton
              onClick={handlePause}
              sx={{ 
                color: 'white',
                backgroundColor: 'rgba(255,255,255,0.1)',
                '&:hover': {
                  backgroundColor: 'rgba(255,255,255,0.2)',
                }
              }}
              title="暂停"
            >
              <Pause sx={{ fontSize: 32 }} />
            </IconButton>
          ) : (
            <IconButton
              onClick={handlePlay}
              sx={{ 
                color: 'white',
                backgroundColor: 'rgba(102,126,234,0.8)',
                '&:hover': {
                  backgroundColor: 'rgba(102,126,234,1)',
                }
              }}
              title="播放"
            >
              <PlayArrow sx={{ fontSize: 32 }} />
            </IconButton>
          )}
          
          <IconButton
            onClick={handleFastForward}
            sx={{ color: 'white' }}
            title="前进 5 秒"
          >
            <FastForward />
          </IconButton>
          
          <Box sx={{ width: 24 }} />
          
          <IconButton
            onClick={handleRestart}
            sx={{ color: 'white' }}
            title="重新开始"
          >
            <Replay />
          </IconButton>
          </Box>
        </Box>
      )}
      
      {/* Loading 叠加层 */}
      {loading && (
        <Box 
          display="flex" 
          justifyContent="center" 
          alignItems="center" 
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          bgcolor="rgba(30, 30, 30, 0.9)"
        >
          <CircularProgress sx={{ color: '#667eea' }} />
        </Box>
      )}
      
      {/* Error 叠加层 */}
      {error && !loading && (
        <Box 
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          display="flex"
          alignItems="center"
          justifyContent="center"
          p={2}
        >
          <Alert severity="warning">
            <Typography variant="body1" gutterBottom>
              {error}
            </Typography>
            {error === '没有可用的录制数据' && (
              <Typography variant="body2" color="text.secondary">
                该会话可能在录制完成前被中断，或录制功能未正常工作。
              </Typography>
            )}
          </Alert>
        </Box>
      )}
    </Box>
  );
}

