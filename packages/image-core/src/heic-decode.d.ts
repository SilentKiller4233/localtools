declare module 'heic-decode' {
  export interface HeicDecodedImage {
    width: number;
    height: number;
    data: Uint8Array;
  }
  export default function decode(input: { buffer: Uint8Array }): Promise<HeicDecodedImage>;
  export function all(input: {
    buffer: Uint8Array;
  }): Promise<
    { width: number; height: number; decode(): Promise<HeicDecodedImage> }[] & { dispose(): void }
  >;
}
