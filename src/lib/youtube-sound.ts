/**
 * Plays a YouTube video as a sound effect through the YouTube IFrame Player API.
 *
 * The player keeps YouTube's minimum embed size (200 x 200 px) but is invisible and lets
 * clicks through, so it never covers the raffle or its confetti (Leon, 2026-11-14; YouTube's
 * embed rules ask for a visible player). Everything here is best effort: if YouTube can't
 * load (offline, blocked), the sound simply stays silent.
 */

const API_SRC = 'https://www.youtube.com/iframe_api';
const PLAYER_SIZE = 200;

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  destroy(): void;
}

interface YTNamespace {
  Player: new (
    element: HTMLElement,
    options: {
      videoId: string;
      width: number;
      height: number;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
        onStateChange?: (event: { target: YTPlayer; data: number }) => void;
      };
    }
  ) => YTPlayer;
}

type YTWindow = Window & { YT?: YTNamespace; onYouTubeIframeAPIReady?: () => void };

const ENDED = 0;

let apiPromise: Promise<YTNamespace> | null = null;

/** Loads YouTube's player script once per page. */
function loadYouTubeApi(): Promise<YTNamespace> {
  const w = window as YTWindow;
  if (w.YT?.Player) return Promise.resolve(w.YT);
  if (!apiPromise) {
    apiPromise = new Promise<YTNamespace>((resolve, reject) => {
      const previous = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => {
        previous?.();
        if (w.YT?.Player) resolve(w.YT);
        else reject(new Error('YouTube player API missing after load'));
      };
      const script = document.createElement('script');
      script.src = API_SRC;
      script.async = true;
      script.onerror = () => {
        apiPromise = null;
        reject(new Error('YouTube player API failed to load'));
      };
      document.head.appendChild(script);
    });
  }
  return apiPromise;
}

export interface YouTubeSound {
  /** Plays from the start. */
  play(): void;
  /** Pauses. */
  stop(): void;
  /** Removes the player and its tile. */
  destroy(): void;
}

export function createYouTubeSound(videoId: string): YouTubeSound {
  const tile = document.createElement('div');
  tile.dataset.youtubeSound = videoId;
  Object.assign(tile.style, {
    position: 'fixed',
    right: '16px',
    bottom: '16px',
    width: `${PLAYER_SIZE}px`,
    height: `${PLAYER_SIZE}px`,
    borderRadius: '12px',
    overflow: 'hidden',
    zIndex: '40',
    pointerEvents: 'none',
    opacity: '0',
  });
  const mount = document.createElement('div');
  tile.appendChild(mount);
  document.body.appendChild(tile);

  let player: YTPlayer | null = null;
  let wanted = false;
  let destroyed = false;

  const start = () => {
    if (!player) return;
    try {
      player.seekTo(0, true);
      player.playVideo();
    } catch (err) {
      console.error('Sound failed to play:', err);
    }
  };

  loadYouTubeApi()
    .then(YT => {
      if (destroyed) return;
      new YT.Player(mount, {
        videoId,
        width: PLAYER_SIZE,
        height: PLAYER_SIZE,
        playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: e => {
            player = e.target;
            if (wanted) start();
          },
          onStateChange: e => {
            if (e.data === ENDED) wanted = false;
          },
        },
      });
    })
    .catch(err => {
      console.error('Sounds are off:', err);
      tile.remove();
    });

  return {
    play() {
      if (destroyed) return;
      wanted = true;
      start();
    },
    stop() {
      wanted = false;
      try {
        player?.pauseVideo();
      } catch (err) {
        console.error('Sound failed to stop:', err);
      }
    },
    destroy() {
      destroyed = true;
      wanted = false;
      try {
        player?.destroy();
      } catch (err) {
        console.error('Sound failed to close:', err);
      }
      player = null;
      tile.remove();
    },
  };
}
