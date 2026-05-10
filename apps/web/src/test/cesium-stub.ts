/**
 * Minimal Cesium stub for vitest. Real Cesium needs the bundler-time
 * runtime injection that vite-plugin-cesium handles in dev/build —
 * the tests use only the *names* of these classes so that
 * `import { Cartesian3, ... } from 'cesium'` resolves and module-load
 * doesn't crash. Tests that need real numerical behaviour from Cesium
 * should mock per-call or run in a browser harness.
 */

export class Cartesian3 {
  x = 0
  y = 0
  z = 0
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z }
  static fromDegrees(_lon: number, _lat: number, _alt = 0): Cartesian3 {
    return new Cartesian3()
  }
}

export class Cartographic {
  longitude = 0
  latitude = 0
  height = 0
  static fromCartesian(_c: Cartesian3): Cartographic {
    return new Cartographic()
  }
}

export class Matrix4 {
  static multiplyByPoint(_m: Matrix4, p: Cartesian3, _out: Cartesian3): Cartesian3 {
    return new Cartesian3(p.x, p.y, p.z)
  }
  static inverseTransformation(_m: Matrix4, _out: Matrix4): Matrix4 {
    return new Matrix4()
  }
}

export const Math = {
  toDegrees(rad: number): number {
    return (rad * 180) / globalThis.Math.PI
  },
  toRadians(deg: number): number {
    return (deg * globalThis.Math.PI) / 180
  },
}

export const Transforms = {
  eastNorthUpToFixedFrame(_origin: Cartesian3): Matrix4 {
    return new Matrix4()
  },
}
