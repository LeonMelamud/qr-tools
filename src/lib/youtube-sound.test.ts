import { describe, it, expect, vi, beforeEach } from 'vitest';

/** Stand-in for YT.Player: records calls and lets a test fire the player's events. */
class FakePlayer {
  static all: FakePlayer[] = [];
  playVideo = vi.fn();
  pauseVideo = vi.fn();
  seekTo = vi.fn();
  destroy = vi.fn();
  constructor(public mount: HTMLElement | string, public opts: { videoId: string; width: number; height: number; events: Record<string, (e: unknown) => void> }) {
    FakePlayer.all.push(this);
  }
  ready() { this.opts.events.onReady({ target: this }); }
  ended() { this.opts.events.onStateChange({ target: this, data: 0 }); }
}

type YTWindow = Window & { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
const w = window as YTWindow;

const flush = () => new Promise(r => setTimeout(r, 0));
const scripts = () => document.querySelectorAll('script[src="https://www.youtube.com/iframe_api"]');
const host = (videoId: string) => document.querySelector<HTMLElement>(`[data-youtube-sound="${videoId}"]`)!;

/** The YouTube script has loaded and announces itself. */
async function apiReady() {
  w.YT = { Player: FakePlayer };
  w.onYouTubeIframeAPIReady?.();
  await flush();
}

async function load() {
  return import('./youtube-sound');
}

beforeEach(() => {
  vi.resetModules();
  FakePlayer.all = [];
  delete w.YT;
  delete w.onYouTubeIframeAPIReady;
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('createYouTubeSound', () => {
  it('loads the YouTube player script once for several sounds', async () => {
    const { createYouTubeSound } = await load();
    createYouTubeSound('drum');
    createYouTubeSound('applause');

    expect(scripts()).toHaveLength(1);
    await apiReady();
    expect(FakePlayer.all.map(p => p.opts.videoId)).toEqual(['drum', 'applause']);
  });

  // Leon, 2026-11-14: the visible player tile covered the confetti. The player keeps
  // YouTube's 200 x 200 size but is invisible and lets clicks through, playing or not.
  it('plays from the start through an invisible 200 x 200 player that lets clicks through', async () => {
    const { createYouTubeSound } = await load();
    const sound = createYouTubeSound('drum');
    await apiReady();
    const player = FakePlayer.all[0];
    player.ready();

    expect(player.opts.width).toBeGreaterThanOrEqual(200);
    expect(player.opts.height).toBeGreaterThanOrEqual(200);

    sound.play();
    expect(player.seekTo).toHaveBeenCalledWith(0, true);
    expect(player.playVideo).toHaveBeenCalledTimes(1);
    expect(host('drum').style.opacity).toBe('0');
    expect(host('drum').style.pointerEvents).toBe('none');
    expect(host('drum').style.visibility).not.toBe('visible');

    sound.stop();
    expect(player.pauseVideo).toHaveBeenCalledTimes(1);
    expect(host('drum').style.opacity).toBe('0');
  });

  it('a sound asked to play before its player is ready starts once it is ready', async () => {
    const { createYouTubeSound } = await load();
    const sound = createYouTubeSound('drum');

    sound.play();
    await apiReady();
    const player = FakePlayer.all[0];
    expect(player.playVideo).not.toHaveBeenCalled();
    player.ready();

    expect(player.playVideo).toHaveBeenCalledTimes(1);
  });

  it('a sound stopped before its player is ready never starts', async () => {
    const { createYouTubeSound } = await load();
    const sound = createYouTubeSound('drum');

    sound.play();
    sound.stop();
    await apiReady();
    FakePlayer.all[0].ready();

    expect(FakePlayer.all[0].playVideo).not.toHaveBeenCalled();
  });

  it('when the YouTube script cannot load, the sound does nothing and never throws', async () => {
    const { createYouTubeSound } = await load();
    const sound = createYouTubeSound('drum');

    scripts()[0].dispatchEvent(new Event('error'));
    await flush();

    expect(() => { sound.play(); sound.stop(); sound.destroy(); }).not.toThrow();
    expect(host('drum')).toBeNull();
  });

  it('destroy removes the player and its tile', async () => {
    const { createYouTubeSound } = await load();
    const sound = createYouTubeSound('drum');
    await apiReady();
    FakePlayer.all[0].ready();

    sound.destroy();

    expect(FakePlayer.all[0].destroy).toHaveBeenCalledTimes(1);
    expect(host('drum')).toBeNull();
  });
});
