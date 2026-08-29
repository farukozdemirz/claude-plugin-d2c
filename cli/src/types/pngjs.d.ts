/**
 * pngjs kendi tiplerini getirmiyor ve `@types/pngjs` yalnız bunun için ek bir
 * devDependency olurdu. Kullandığımız iki yüzey burada.
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
