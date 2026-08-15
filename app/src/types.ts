/** A point in page space: PDF points (1/72"), top-left origin, at scale 1. */
export interface PagePoint {
  x: number;
  y: number;
}

/** Camera state: zoom is CSS pixels per page point; pan is the CSS-pixel
 *  translation of the page-space origin relative to the container. */
export interface ViewTransform {
  zoom: number;
  panX: number;
  panY: number;
}

export type ToolMode = 'pan' | 'calibrate' | 'axisCheck' | 'measure' | 'quickArea';
