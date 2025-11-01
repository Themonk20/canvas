// Text measurement utility for auto-sizing labels

interface TextMeasurementOptions {
  text: string;
  fontFamily: string;
  fontSize: number;
  maxWidth: number;
  padding?: number;
}

interface TextDimensions {
  width: number;
  height: number;
}

// Create a canvas context for text measurement
let measurementCanvas: HTMLCanvasElement | null = null;
let measurementContext: CanvasRenderingContext2D | null = null;

function getMeasurementContext(): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') {
    // Server-side rendering
    return null;
  }
  if (!measurementCanvas || !measurementContext) {
    measurementCanvas = document.createElement('canvas');
    measurementContext = measurementCanvas.getContext('2d');
    if (!measurementContext) {
      console.warn('Failed to create canvas context for text measurement');
      return null;
    }
  }
  return measurementContext;
}

/**
 * Measures the dimensions of text with given font properties
 */
export function measureText({ text, fontFamily, fontSize, padding = 8 }: Omit<TextMeasurementOptions, 'maxWidth'>): TextDimensions {
  const ctx = getMeasurementContext();
  if (!ctx) {
    // Fallback estimation when canvas context is not available
    const charWidth = fontSize * 0.6; // Rough approximation
    const width = (text.length * charWidth) + (padding * 2);
    const height = fontSize * 1.2 + (padding * 2);
    return { width, height };
  }
  
  ctx.font = `${fontSize}px ${fontFamily}`;
  
  const metrics = ctx.measureText(text);
  const width = metrics.width + (padding * 2);
  
  // Approximate height based on font size and metrics
  const height = fontSize * 1.2 + (padding * 2); // 1.2 is typical line height multiplier
  
  return { width, height };
}

/**
 * Calculates the optimal font size that fits within the given width constraint
 */
export function calculateOptimalFontSize({
  text,
  fontFamily,
  maxWidth,
  maxFontSize,
  minFontSize = 8,
  padding = 8
}: {
  text: string;
  fontFamily: string;
  maxWidth: number;
  maxFontSize: number;
  minFontSize?: number;
  padding?: number;
}): number {
  if (!text || maxWidth <= padding * 2) {
    return minFontSize; // Use minFontSize as fallback
  }

  const availableWidth = maxWidth - (padding * 2);
  let fontSize = maxFontSize;
  let iterations = 0;
  const maxIterations = 20; // Prevent infinite loops

  // Binary search approach for optimal font size
  let minSize = minFontSize;
  let maxSize = maxFontSize;

  while (minSize <= maxSize && iterations < maxIterations) {
    fontSize = Math.floor((minSize + maxSize) / 2);
    const { width } = measureText({ text, fontFamily, fontSize, padding: 0 });
    
    if (width <= availableWidth) {
      minSize = fontSize + 1;
    } else {
      maxSize = fontSize - 1;
    }
    
    iterations++;
  }

  // Use the largest size that fits
  fontSize = maxSize;
  
  // Ensure it's within bounds
  return Math.max(minFontSize, Math.min(fontSize, maxFontSize));
}

/**
 * Gets the CSS properties for vertical alignment based on vertical alignment type
 */
export function getVerticalAlignmentStyle(verticalAlign: 'top' | 'center' | 'bottom', textAlign: 'left' | 'center' | 'right'): {
  alignItems: string;
  justifyContent: string;
  flexDirection: string;
} {
  // Convert text alignment to flexbox alignment values
  const getFlexAlignment = (align: 'left' | 'center' | 'right'): string => {
    switch (align) {
      case 'left': return 'flex-start';
      case 'center': return 'center';
      case 'right': return 'flex-end';
    }
  };

  switch (verticalAlign) {
    case 'top':
      return {
        alignItems: getFlexAlignment(textAlign), // Horizontal alignment when flexDirection is column
        justifyContent: 'flex-start', // Vertical alignment (top)
        flexDirection: 'column'
      };
    case 'bottom':
      return {
        alignItems: getFlexAlignment(textAlign), // Horizontal alignment when flexDirection is column
        justifyContent: 'flex-end', // Vertical alignment (bottom)
        flexDirection: 'column'
      };
    case 'center':
    default:
      return {
        alignItems: 'center', // Vertical alignment when flexDirection is row
        justifyContent: getFlexAlignment(textAlign), // Horizontal alignment when flexDirection is row
        flexDirection: 'row'
      };
  }
}