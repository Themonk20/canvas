// Define element types
export interface TextElement {
  id: string;
  type: 'text';
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  rotation: number; // Rotation in degrees
  zIndex: number;
  visible: boolean;
  name: string;
  groupId?: string;
}

export interface LabelElement {
  id: string;
  type: 'label';
  x: number;
  y: number;
  width: number;
  height: number;
  jsonKey: string; // The key to bind to (e.g., "studentName")
  placeholder: string; // Fallback text when no data
  fontSize: number; // This acts as maxFontSize
  minFontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor: string;
  textAlign: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'center' | 'bottom';
  autoSizeText: boolean;
  rotation: number; // Rotation in degrees
  zIndex: number;
  visible: boolean;
  name: string;
  groupId?: string;
}

export interface GroupElement {
  id: string;
  type: 'group';
  name: string;
  zIndex: number;
  visible: boolean;
  children: string[]; // Array of element IDs
}

export interface SignatureElement {
  id: string;
  type: 'signature';
  x: number;
  y: number;
  width: number;
  height: number;
  svgData: string; // SVG path data for vector scaling
  imageData: string; // Base64 encoded PNG with transparent background (fallback)
  originalImageData?: string; // Optional: Original image before background removal
  color: string; // Signature stroke color
  rotation: number; // Rotation in degrees
  zIndex: number;
  visible: boolean;
  name: string;
  groupId?: string;
}

export interface MediaElement {
  id: string;
  type: 'media';
  x: number;
  y: number;
  width: number;
  height: number;
  mediaType: 'image' | 'svg'; // Type of media
  data: string; // Base64 data or SVG content
  originalData?: string; // Original unmodified data
  fileName: string; // Original file name
  strokeColor?: string; // For SVG stroke color editing
  fillColor?: string; // For SVG fill color editing
  rotation: number; // Rotation in degrees
  zIndex: number;
  visible: boolean;
  name: string;
  groupId?: string;
}

export type CanvasElement = TextElement | LabelElement | GroupElement | SignatureElement | MediaElement;

export type Tool = 'cursor' | 'text' | 'label' | 'signature' | 'media';

// History types for undo/redo
export interface CanvasSettings {
  meshColor: string;
  backgroundColor: string;
  canvasRatio: string;
  showGrid: boolean;
  backgroundImage?: string;
  backgroundImageOpacity: number;
  backgroundImageBrightness: number;
  backgroundImageContrast: number;
  backgroundImageBlur: number;
  backgroundImageOverlay: 'none' | 'dark' | 'light';
  backgroundImageOverlayOpacity: number;
}

export interface HistoryState {
  elements: CanvasElement[];
  canvasSettings: CanvasSettings;
  timestamp: number;
  operation: string;
}

export interface HistoryStack {
  past: HistoryState[];
  present: HistoryState;
  future: HistoryState[];
}