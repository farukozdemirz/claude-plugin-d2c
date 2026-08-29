/**
 * pngjs ships no types of its own, and `@types/pngjs` would be an extra devDependency
 * just for this. The two surfaces we use are declared here.
 */
declare module 'pngjs' {
  export class PNG {
    constructor(opts?: { width?: number; height?: number });
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
      write(png: PNG): Buffer;
    };
  }
}
