/**
 * bwip-js ships no TypeScript declarations; the SVG interface is the only
 * surface devtext-core uses (works from both the node and browser entries).
 */
declare module 'bwip-js/node' {
  export function toSVG(options: {
    bcid: string;
    text: string;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    scale?: number;
    [key: string]: unknown;
  }): string;
}
declare module 'bwip-js/browser' {
  export function toSVG(options: {
    bcid: string;
    text: string;
    height?: number;
    includetext?: boolean;
    textxalign?: string;
    scale?: number;
    [key: string]: unknown;
  }): string;
}
