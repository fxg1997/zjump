declare module 'asciinema-player' {
  export interface PlayerOptions {
    cols?: number;
    rows?: number;
    autoPlay?: boolean;
    loop?: boolean;
    startAt?: number;
    speed?: number;
    idleTimeLimit?: number;
    preload?: boolean;
    theme?: string;
    fit?: string;
    terminalFontSize?: string;
    terminalLineHeight?: number;
    terminalFontFamily?: string;
  }

  export interface Player {
    play: () => void;
    pause: () => void;
    seek: (time: number) => void;
    getCurrentTime?: () => number;
    addEventListener?: (event: string, callback: () => void) => void;
  }

  export function create(
    src: string,
    container: HTMLElement,
    options?: PlayerOptions
  ): Player;

  const AsciinemaPlayer: {
    create: typeof create;
    default?: {
      create: typeof create;
    };
  };

  export default AsciinemaPlayer;
}

