"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import type { CanvasElement, Tool } from "@/types/canvas";
import { calculateOptimalFontSize, getVerticalAlignmentStyle } from "@/utils/textMeasurement";

interface CanvasProps {
  className?: string;
  meshColor?: string;
  backgroundColor?: string;
  canvasRatio?: string;
  showGrid?: boolean;
  elements: CanvasElement[];
  setElements: (elements: CanvasElement[]) => void;
  updateElements: (elements: CanvasElement[], operation: string, selectedIds?: string[]) => void;
  selectedElementIds: string[];
  selectElement: (id: string, isShiftClick?: boolean) => void;
  activeTool: Tool;
  setActiveTool: (tool: Tool) => void;
  backgroundImage?: string;
  backgroundImageOpacity?: number;
  backgroundImageBrightness?: number;
  backgroundImageContrast?: number;
  backgroundImageBlur?: number;
  backgroundImageOverlay?: 'none' | 'dark' | 'light';
  backgroundImageOverlayOpacity?: number;
  isPreviewMode?: boolean;
  sampleData?: Record<string, string>;
}

export default function Canvas({ 
  className, 
  meshColor = "#e2e8f0", 
  backgroundColor = "#ffffff",
  canvasRatio = "16:9",
  showGrid = true,
  elements,
  setElements,
  updateElements,
  selectedElementIds,
  selectElement,
  activeTool,
  setActiveTool,
  backgroundImage,
  backgroundImageOpacity = 100,
  backgroundImageBrightness = 100,
  backgroundImageContrast = 100,
  backgroundImageBlur = 0,
  backgroundImageOverlay = 'none',
  backgroundImageOverlayOpacity = 50,
  isPreviewMode = false,
  sampleData = {}
}: CanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [stableWorkspaceSize, setStableWorkspaceSize] = useState(3000);
  const baseGridSize = 20;
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragElementId, setDragElementId] = useState<string | null>(null);
  const [potentialDragElement, setPotentialDragElement] = useState<string | null>(null);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<string | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });
  const [isRotating, setIsRotating] = useState(false);
  const [rotateStart, setRotateStart] = useState({ x: 0, y: 0, rotation: 0 });
  
  // Touch/pinch zoom state
  const [touchStart, setTouchStart] = useState<{distance: number, centerX: number, centerY: number} | null>(null);
  
  // Calculate rotation angle between two points relative to element center
  const calculateRotationAngle = useCallback((centerX: number, centerY: number, mouseX: number, mouseY: number) => {
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;
    return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
  }, []);
  
  // Calculate canvas dimensions based on complete grid units
  const getCanvasDimensions = () => {
    const baseUnitsWidth = 60; // Increased base width in grid units
    
    switch (canvasRatio) {
      case "16:9": {
        const unitsHeight = Math.round(baseUnitsWidth * (9/16));
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
      case "4:3": {
        const unitsHeight = Math.round(baseUnitsWidth * (3/4));
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
      case "1:1": {
        const unitsHeight = baseUnitsWidth;
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
      case "3:2": {
        const unitsHeight = Math.round(baseUnitsWidth * (2/3));
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
      case "21:9": {
        const unitsHeight = Math.round(baseUnitsWidth * (9/21));
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
      default: {
        const unitsHeight = 45; // Increased default height
        return { 
          width: baseUnitsWidth * baseGridSize, 
          height: unitsHeight * baseGridSize,
          unitsWidth: baseUnitsWidth,
          unitsHeight: unitsHeight
        };
      }
    }
  };
  
  const canvasDimensions = getCanvasDimensions();

  const handleWheel = useCallback((e: WheelEvent) => {
    // Disable zoom in preview mode
    if (isPreviewMode) return;
    
    // Only handle zoom when Ctrl/Cmd is pressed, let normal scrolling work for panning
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      
      // Zoom with Ctrl/Cmd + scroll
      const delta = e.deltaY;
      const scaleFactor = delta > 0 ? 0.9 : 1.1;
      const newScale = Math.min(Math.max(scale * scaleFactor, 0.1), 4); // Reduced max zoom to 400%
      
      setScale(newScale);
    }
    // Let normal scroll events bubble up for natural scrolling
  }, [scale, isPreviewMode]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    // Disable all interactions in preview mode
    if (isPreviewMode) return;
    
    e.preventDefault();
    
    if (activeTool === 'text') {
      // Create new text element
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        const newTextElement: CanvasElement = {
          id: `text-${Date.now()}`,
          type: 'text',
          x,
          y,
          width: 100,
          height: 40,
          text: 'Text',
          fontSize: 16,
          fontFamily: 'Arial',
          color: '#000000',
          backgroundColor: 'transparent',
          textAlign: 'left',
          rotation: 0,
          zIndex: Math.max(...elements.map(el => el.zIndex), 0) + 1,
          visible: true,
          name: `Text ${elements.filter(el => el.type === 'text').length + 1}`
        };
        
        const newElements = [...elements, newTextElement];
        updateElements(newElements, 'add_text', [newTextElement.id]);
        selectElement(newTextElement.id);
        setActiveTool('cursor'); // Auto-switch to cursor tool after adding text
      }
    } else if (activeTool === 'label') {
      // Create new label element
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        // Prompt for JSON key
        const jsonKey = prompt('Enter JSON key for this label (e.g., "name", "course"):');
        if (!jsonKey) return; // User cancelled
        
        const placeholder = prompt('Enter placeholder text (optional):') || `{${jsonKey}}`;
        
        const newLabelElement: CanvasElement = {
          id: `label-${Date.now()}`,
          type: 'label',
          x,
          y,
          width: 120,
          height: 40,
          jsonKey: jsonKey.trim(),
          placeholder,
          fontSize: 50, // Max font size
          minFontSize: 8,
          fontFamily: 'Arial',
          color: '#000000',
          backgroundColor: 'transparent',
          textAlign: 'left',
          verticalAlign: 'center',
          autoSizeText: true,
          rotation: 0,
          zIndex: Math.max(...elements.map(el => el.zIndex), 0) + 1,
          visible: true,
          name: `Label ${elements.filter(el => el.type === 'label').length + 1}`
        };
        
        const newElements = [...elements, newLabelElement];
        updateElements(newElements, 'add_label', [newLabelElement.id]);
        selectElement(newLabelElement.id);
        setActiveTool('cursor'); // Auto-switch to cursor tool after adding label
      }
    } else if (activeTool === 'signature') {
      // Handle signature tool click - this will be triggered from parent component
      // For now, just switch back to cursor since signature creation happens via modal
      setActiveTool('cursor');
    } else if (activeTool === 'cursor') {
      // Handle element selection and drag start
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        // Find clicked element (reverse order to get topmost, check text and label elements)
        const clickedElement = [...elements].reverse().find(el => {
          if (el.type === 'text' || el.type === 'label') {
            return x >= el.x && x <= el.x + el.width &&
                   y >= el.y && y <= el.y + el.height;
          }
          return false;
        });
        
        if (clickedElement && (clickedElement.type === 'text' || clickedElement.type === 'label')) {
          const isShiftClick = e.shiftKey;
          selectElement(clickedElement.id, isShiftClick);
          
          // Only prepare for dragging if not shift clicking (multi-selecting)
          // Don't set isDragging yet - wait for actual mouse movement
          if (!isShiftClick) {
            setPotentialDragElement(clickedElement.id);
            setDragStart({ x: x - clickedElement.x, y: y - clickedElement.y });
          }
        } else {
          selectElement(''); // Clear selection
        }
      }
    }
  }, [activeTool, elements, selectElement, scale, setActiveTool, updateElements, isPreviewMode]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    // Disable all interactions in preview mode
    if (isPreviewMode) return;
    
    // Check if we should start dragging from a potential drag
    if (potentialDragElement && !isDragging && !isResizing && !isRotating && activeTool === 'cursor') {
      setIsDragging(true);
      setDragElementId(potentialDragElement);
      setPotentialDragElement(null);
    }
    
    if (isDragging && dragElementId && activeTool === 'cursor' && !isResizing && !isRotating) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const x = (e.clientX - rect.left) / scale;
        const y = (e.clientY - rect.top) / scale;
        
        const newX = x - dragStart.x;
        const newY = y - dragStart.y;
        
        const newElements = elements.map(el => {
          if (el.id === dragElementId && (el.type === 'text' || el.type === 'label' || el.type === 'signature' || el.type === 'media')) {
            return { ...el, x: newX, y: newY };
          }
          return el;
        });
        setElements(newElements);
      }
    } else if (isResizing && dragElementId && resizeHandle) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = (e.clientX - rect.left) / scale;
        const mouseY = (e.clientY - rect.top) / scale;
        
        const deltaX = mouseX - resizeStart.x;
        const deltaY = mouseY - resizeStart.y;
        
        const element = elements.find(el => el.id === dragElementId);
        if (element && (element.type === 'text' || element.type === 'label' || element.type === 'signature' || element.type === 'media')) {
          setElements(elements.map(el => {
            if (el.id === dragElementId && (el.type === 'text' || el.type === 'label' || el.type === 'signature' || el.type === 'media')) {
              let newX = element.x;
              let newY = element.y;
              let newWidth = element.width;
              let newHeight = element.height;
              
              switch (resizeHandle) {
                case 'nw': // Top-left corner
                  newWidth = Math.max(20, resizeStart.width - deltaX);
                  newHeight = Math.max(20, resizeStart.height - deltaY);
                  newX = element.x + (element.width - newWidth);
                  newY = element.y + (element.height - newHeight);
                  break;
                case 'ne': // Top-right corner
                  newWidth = Math.max(20, resizeStart.width + deltaX);
                  newHeight = Math.max(20, resizeStart.height - deltaY);
                  newY = element.y + (element.height - newHeight);
                  break;
                case 'sw': // Bottom-left corner
                  newWidth = Math.max(20, resizeStart.width - deltaX);
                  newHeight = Math.max(20, resizeStart.height + deltaY);
                  newX = element.x + (element.width - newWidth);
                  break;
                case 'se': // Bottom-right corner
                  newWidth = Math.max(20, resizeStart.width + deltaX);
                  newHeight = Math.max(20, resizeStart.height + deltaY);
                  break;
                case 'n': // Top edge
                  newHeight = Math.max(20, resizeStart.height - deltaY);
                  newY = element.y + (element.height - newHeight);
                  break;
                case 's': // Bottom edge
                  newHeight = Math.max(20, resizeStart.height + deltaY);
                  break;
                case 'w': // Left edge
                  newWidth = Math.max(20, resizeStart.width - deltaX);
                  newX = element.x + (element.width - newWidth);
                  break;
                case 'e': // Right edge
                  newWidth = Math.max(20, resizeStart.width + deltaX);
                  break;
              }
              
              return { ...el, x: newX, y: newY, width: newWidth, height: newHeight };
            }
            return el;
          }));
        }
      }
    } else if (isRotating && dragElementId) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const mouseX = (e.clientX - rect.left) / scale;
        const mouseY = (e.clientY - rect.top) / scale;
        
        const element = elements.find(el => el.id === dragElementId);
        if (element && (element.type === 'text' || element.type === 'label' || element.type === 'signature' || element.type === 'media')) {
          const centerX = element.x + element.width / 2;
          const centerY = element.y + element.height / 2;
          
          const currentAngle = calculateRotationAngle(centerX, centerY, mouseX, mouseY);
          const startAngle = calculateRotationAngle(centerX, centerY, rotateStart.x, rotateStart.y);
          const deltaAngle = currentAngle - startAngle;
          
          let newRotation = rotateStart.rotation + deltaAngle;
          
          // Normalize rotation to 0-360 degrees
          newRotation = newRotation % 360;
          if (newRotation < 0) newRotation += 360;
          
          setElements(elements.map(el => {
            if (el.id === dragElementId && (el.type === 'text' || el.type === 'label' || el.type === 'signature' || el.type === 'media')) {
              return { ...el, rotation: newRotation };
            }
            return el;
          }));
        }
      }
    }
  }, [isDragging, dragElementId, dragStart, scale, elements, setElements, activeTool, isResizing, resizeHandle, resizeStart, isRotating, rotateStart, calculateRotationAngle, potentialDragElement, isPreviewMode]);

  const handleMouseUp = useCallback(() => {
    // Disable all interactions in preview mode
    if (isPreviewMode) return;
    
    // Save to history if we were actually dragging, resizing, or rotating
    if (isDragging && dragElementId) {
      updateElements(elements, 'move_element');
    }
    if (isResizing && dragElementId) {
      updateElements(elements, 'resize_element');
    }
    if (isRotating && dragElementId) {
      updateElements(elements, 'rotate_element');
    }
    
    // Reset all drag states
    setIsDragging(false);
    setDragElementId(null);
    setPotentialDragElement(null); // Clear potential drag
    setDragStart({ x: 0, y: 0 });
    setIsResizing(false);
    setResizeHandle(null);
    setResizeStart({ x: 0, y: 0, width: 0, height: 0 });
    setIsRotating(false);
    setRotateStart({ x: 0, y: 0, rotation: 0 });
  }, [isDragging, isResizing, isRotating, dragElementId, elements, updateElements, isPreviewMode]);

  // Helper function to get distance between two touches
  const getTouchDistance = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }, []);

  // Helper function to get center point between two touches
  const getTouchCenter = useCallback((touches: React.TouchList) => {
    if (touches.length < 2) return { x: 0, y: 0 };
    const touch1 = touches[0];
    const touch2 = touches[1];
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isPreviewMode) return;
    
    if (e.touches.length === 2) {
      // Two finger touch - prepare for pinch zoom
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      setTouchStart({ distance, centerX: center.x, centerY: center.y });
    }
  }, [isPreviewMode, getTouchDistance, getTouchCenter]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (isPreviewMode) return;
    
    if (e.touches.length === 2 && touchStart) {
      // Pinch zoom
      e.preventDefault();
      const distance = getTouchDistance(e.touches);
      const center = getTouchCenter(e.touches);
      
      if (touchStart.distance > 0) {
        const scaleFactor = distance / touchStart.distance;
        const newScale = Math.min(Math.max(scale * scaleFactor, 0.1), 4);
        setScale(newScale);
        
        // Update touch start for continuous pinching
        setTouchStart({ distance, centerX: center.x, centerY: center.y });
      }
    }
  }, [isPreviewMode, touchStart, getTouchDistance, getTouchCenter, scale]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) {
      // End pinch zoom when less than 2 fingers
      setTouchStart(null);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener('wheel', handleWheel, { passive: false });
      return () => container.removeEventListener('wheel', handleWheel);
    }
  }, [handleWheel]);

  const gridSize = baseGridSize;
  
  // Calculate canvas position to center it during zoom
  const scaledCanvasWidth = canvasDimensions.width * scale;
  const scaledCanvasHeight = canvasDimensions.height * scale;

  // Calculate required workspace size
  const requiredWorkspaceSize = Math.max(
    scaledCanvasWidth + 1200,   // Canvas width + generous padding
    scaledCanvasHeight + 1200,  // Canvas height + generous padding  
    3000                        // Minimum workspace size
  );

  // Use stepped workspace sizes to reduce jumping
  const getSteppedWorkspaceSize = (required: number) => {
    const steps = [3000, 4000, 5000, 6500, 8000, 10000];
    return steps.find(step => step >= required) || 10000;
  };

  const targetWorkspaceSize = getSteppedWorkspaceSize(requiredWorkspaceSize);

  // Update workspace size with scroll position preservation
  useEffect(() => {
    if (targetWorkspaceSize !== stableWorkspaceSize) {
      const container = containerRef.current;
      if (container) {
        // Store current scroll position relative to canvas center
        const currentScrollLeft = container.scrollLeft;
        const currentScrollTop = container.scrollTop;
        const canvasCenterX = (stableWorkspaceSize - scaledCanvasWidth) / 2;
        const canvasCenterY = (stableWorkspaceSize - scaledCanvasHeight) / 2;
        const relativeX = currentScrollLeft - canvasCenterX;
        const relativeY = currentScrollTop - canvasCenterY;
        
        // Update workspace size
        setStableWorkspaceSize(targetWorkspaceSize);
        
        // Restore scroll position relative to new canvas center
        setTimeout(() => {
          const newCanvasCenterX = (targetWorkspaceSize - scaledCanvasWidth) / 2;
          const newCanvasCenterY = (targetWorkspaceSize - scaledCanvasHeight) / 2;
          container.scrollTo({
            left: newCanvasCenterX + relativeX,
            top: newCanvasCenterY + relativeY,
            behavior: 'auto'
          });
        }, 0);
      }
    }
  }, [targetWorkspaceSize, stableWorkspaceSize, scaledCanvasWidth, scaledCanvasHeight]);

  const workspaceSize = stableWorkspaceSize;

  // Auto-scroll to center the canvas on initial mount
  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      // Small delay to ensure layout is complete
      setTimeout(() => {
        const scrollLeft = (workspaceSize - container.clientWidth) / 2;
        const scrollTop = (workspaceSize - container.clientHeight) / 2;
        
        container.scrollTo({
          left: scrollLeft,
          top: scrollTop,
          behavior: 'smooth'
        });
      }, 100);
    }
  }, []); // Only run once on mount

  // Re-center when canvas ratio changes (but not when zooming)
  useEffect(() => {
    const container = containerRef.current;
    if (container && scale === 1) {
      const scrollLeft = (workspaceSize - container.clientWidth) / 2;
      const scrollTop = (workspaceSize - container.clientHeight) / 2;
      
      container.scrollTo({
        left: scrollLeft,
        top: scrollTop,
        behavior: 'smooth'
      });
    }
  }, [canvasRatio, workspaceSize]); // Re-center when ratio changes, but not when scale changes
  const canvasOffsetX = (workspaceSize - scaledCanvasWidth) / 2;
  const canvasOffsetY = (workspaceSize - scaledCanvasHeight) / 2;

  return (
    <div 
      className={`relative h-full w-full ${className}`}
      style={{ 
        // Prevent text selection during resize operations
        ...(isResizing && { userSelect: 'none', WebkitUserSelect: 'none', MozUserSelect: 'none' })
      }}
    >
      {/* Scrollable Background Workspace */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto bg-gray-100"
        style={{
          backgroundImage: `
            radial-gradient(circle, #d1d5db 1px, transparent 1px)
          `,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0'
        }}
      >
        {/* Large workspace content */}
        <div
          style={{
            width: workspaceSize,
            height: workspaceSize,
            position: 'relative'
          }}
        >
          {/* Canvas Area */}
          <div
            ref={canvasRef}
            className={`absolute border border-gray-300 shadow-lg ${isPreviewMode ? 'cursor-default' : 'cursor-default'}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            style={{
              left: canvasOffsetX,
              top: canvasOffsetY,
              width: scaledCanvasWidth,
              height: scaledCanvasHeight,
              backgroundColor: backgroundColor,
            }}
          >
            {/* Background Image */}
            {backgroundImage && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundImage: `url(${backgroundImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat',
                  opacity: backgroundImageOpacity / 100,
                  filter: `brightness(${backgroundImageBrightness}%) contrast(${backgroundImageContrast}%) blur(${backgroundImageBlur}px)`,
                }}
              />
            )}

            {/* Background Image Overlay */}
            {backgroundImage && backgroundImageOverlay !== 'none' && (
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: backgroundImageOverlay === 'dark' ? '#000000' : '#ffffff',
                  opacity: backgroundImageOverlayOpacity / 100,
                }}
              />
            )}

            {/* Mesh Grid - Only show in edit mode */}
            {showGrid && !isPreviewMode && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width="100%"
                height="100%"
              >
                <defs>
                  <pattern
                    id="mesh-grid"
                    width={gridSize * scale}
                    height={gridSize * scale}
                    patternUnits="userSpaceOnUse"
                  >
                    <path
                      d={`M ${gridSize * scale} 0 L 0 0 0 ${gridSize * scale}`}
                      fill="none"
                      stroke={meshColor}
                      strokeWidth="1"
                    />
                  </pattern>
                </defs>
                <rect 
                  width="100%" 
                  height="100%" 
                  fill="url(#mesh-grid)" 
                />
              </svg>
            )}
            
            {/* Render Canvas Elements */}
            {elements
              .filter(element => element.visible && (element.type === 'text' || element.type === 'label' || element.type === 'signature' || element.type === 'media'))
              .sort((a, b) => a.zIndex - b.zIndex)
              .map((element) => {
                // Handle signature elements separately
                if (element.type === 'signature') {
                  const signatureElement = element as Extract<CanvasElement, { type: 'signature' }>;
                  const isSelected = selectedElementIds.includes(element.id);
                  
                  return (
                    <div
                      key={element.id}
                      className="absolute cursor-move select-none"
                      style={{
                        left: signatureElement.x * scale,
                        top: signatureElement.y * scale,
                        width: signatureElement.width * scale,
                        height: signatureElement.height * scale,
                        zIndex: signatureElement.zIndex,
                        transform: `rotate(${signatureElement.rotation || 0}deg)`,
                        transformOrigin: 'center center',
                      }}
                      onMouseDown={(e) => {
                        if (isPreviewMode) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        selectElement(signatureElement.id, e.shiftKey);
                        
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          const x = (e.clientX - rect.left) / scale;
                          const y = (e.clientY - rect.top) / scale;
                          
                          setIsDragging(true);
                          setDragElementId(signatureElement.id);
                          setDragStart({
                            x: x - signatureElement.x,
                            y: y - signatureElement.y
                          });
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDragging) {
                          selectElement(signatureElement.id, e.shiftKey);
                        }
                      }}
                    >
                      {/* Render SVG for vector scaling */}
                      <div 
                        className="w-full h-full pointer-events-none"
                        dangerouslySetInnerHTML={{ 
                          __html: signatureElement.svgData || ''
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      />
                      
                      {/* Selection border and resize handles */}
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 border-2 border-dashed border-blue-500 pointer-events-none" />
                          {/* Resize handles */}
                          <div 
                            className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-nw-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('nw');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white cursor-n-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('n');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-ne-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('ne');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-e-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('e');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-se-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('se');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white cursor-s-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('s');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-sw-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('sw');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute top-1/2 -translate-y-1/2 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-w-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('w');
                                setDragElementId(signatureElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: signatureElement.width, height: signatureElement.height });
                              }
                            }}
                          />
                          
                          {/* Rotation handle - green circle at top center */}
                          <div 
                            className="absolute left-1/2 -translate-x-1/2 w-4 h-4 bg-green-500 border-2 border-white rounded-full cursor-grab"
                            style={{ top: '-20px' }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsRotating(true);
                                setDragElementId(signatureElement.id);
                                setRotateStart({ 
                                  x: mouseX, 
                                  y: mouseY, 
                                  rotation: signatureElement.rotation || 0 
                                });
                              }
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                }

                // Handle media elements separately
                if (element.type === 'media') {
                  const mediaElement = element as Extract<CanvasElement, { type: 'media' }>;
                  const isSelected = selectedElementIds.includes(element.id);
                  
                  return (
                    <div
                      key={element.id}
                      className="absolute select-none"
                      style={{
                        left: mediaElement.x * scale,
                        top: mediaElement.y * scale,
                        width: mediaElement.width * scale,
                        height: mediaElement.height * scale,
                        zIndex: mediaElement.zIndex,
                        transform: `rotate(${mediaElement.rotation || 0}deg)`,
                        transformOrigin: 'center center',
                        cursor: isPreviewMode ? 'default' : (activeTool === 'cursor' ? (isDragging ? 'grabbing' : 'grab') : 'default'),
                      }}
                      onMouseDown={(e) => {
                        if (isPreviewMode) return;
                        e.preventDefault();
                        e.stopPropagation();
                        
                        selectElement(mediaElement.id, e.shiftKey);
                        
                        const rect = canvasRef.current?.getBoundingClientRect();
                        if (rect) {
                          const x = (e.clientX - rect.left) / scale;
                          const y = (e.clientY - rect.top) / scale;
                          
                          setIsDragging(true);
                          setDragElementId(mediaElement.id);
                          setDragStart({
                            x: x - mediaElement.x,
                            y: y - mediaElement.y
                          });
                        }
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!isDragging) {
                          selectElement(mediaElement.id, e.shiftKey);
                        }
                      }}
                    >
                      {/* Render media content */}
                      <div className="w-full h-full pointer-events-none">
                        {mediaElement.mediaType === 'svg' ? (
                          <div
                            className="w-full h-full flex items-center justify-center"
                            dangerouslySetInnerHTML={{ __html: mediaElement.data }}
                          />
                        ) : (
                          <img
                            src={mediaElement.data}
                            alt={mediaElement.fileName}
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>
                      
                      {/* Selection border and resize handles - Inside rotated container */}
                      {isSelected && (
                        <>
                          <div className="absolute inset-0 border-2 border-dashed border-blue-500 pointer-events-none" />
                          
                          {/* Corner resize handles */}
                          <div 
                            className="absolute -top-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-nw-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('nw');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white cursor-n-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('n');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -top-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-ne-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('ne');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -left-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-white cursor-w-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('w');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -right-1 top-1/2 -translate-y-1/2 w-3 h-3 bg-blue-500 border border-white cursor-e-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('e');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 -left-1 w-3 h-3 bg-blue-500 border border-white cursor-sw-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('sw');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-blue-500 border border-white cursor-s-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('s');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          <div 
                            className="absolute -bottom-1 -right-1 w-3 h-3 bg-blue-500 border border-white cursor-se-resize"
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsResizing(true);
                                setResizeHandle('se');
                                setDragElementId(mediaElement.id);
                                setResizeStart({ x: mouseX, y: mouseY, width: mediaElement.width, height: mediaElement.height });
                              }
                            }}
                          />
                          
                          {/* Rotation handle - green circle at top center */}
                          <div 
                            style={{ 
                              position: 'absolute', 
                              left: '50%', 
                              top: '-20px',
                              transform: 'translateX(-50%)', 
                              width: 16, 
                              height: 16, 
                              backgroundColor: '#10b981', 
                              border: '2px solid white',
                              borderRadius: '50%',
                              cursor: 'grab', 
                              pointerEvents: 'auto', 
                              userSelect: 'none' 
                            }} 
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const rect = canvasRef.current?.getBoundingClientRect();
                              if (rect) {
                                const mouseX = (e.clientX - rect.left) / scale;
                                const mouseY = (e.clientY - rect.top) / scale;
                                setIsRotating(true);
                                setDragElementId(mediaElement.id);
                                setRotateStart({ 
                                  x: mouseX, 
                                  y: mouseY, 
                                  rotation: mediaElement.rotation || 0 
                                });
                              }
                            }}
                          />
                        </>
                      )}
                    </div>
                  );
                }
                
                // Handle text and label elements
                const renderElement = element as Extract<CanvasElement, { type: 'text' | 'label' }>;
                
                // Get display text and calculate font size based on element type and preview mode
                let displayText = '';
                let actualFontSize = renderElement.fontSize;
                let verticalAlignmentStyle: { alignItems?: string; justifyContent?: string; flexDirection?: string } = {};
                
                if (element.type === 'text') {
                  const textElement = renderElement as Extract<CanvasElement, { type: 'text' }>;
                  displayText = textElement.text;
                } else if (element.type === 'label') {
                  const labelElement = renderElement as Extract<CanvasElement, { type: 'label' }>;
                  if (isPreviewMode) {
                    displayText = sampleData[labelElement.jsonKey] || labelElement.placeholder;
                  } else {
                    displayText = `{${labelElement.jsonKey}}`;
                  }
                  
                  // Use label properties (migration ensures they exist)
                  const autoSizeText = labelElement.autoSizeText;
                  const maxFontSize = labelElement.fontSize; // fontSize is the max size
                  const minFontSize = labelElement.minFontSize;
                  const verticalAlign = labelElement.verticalAlign;
                  
                  // Apply auto-sizing for labels if enabled and text exists
                  if (autoSizeText && displayText && displayText.trim()) {
                    actualFontSize = calculateOptimalFontSize({
                      text: displayText,
                      fontFamily: labelElement.fontFamily,
                      maxWidth: labelElement.width,
                      maxFontSize: maxFontSize,
                      minFontSize: minFontSize,
                      padding: 4
                    });
                  } else {
                    // Use manual font size when auto-sizing is disabled or no text
                    actualFontSize = labelElement.fontSize;
                  }
                  
                  // Get vertical alignment styles
                  verticalAlignmentStyle = getVerticalAlignmentStyle(verticalAlign, labelElement.textAlign);
                }
                
                return (
              <div key={element.id}>
                <div
                  style={{
                    position: 'absolute',
                    left: renderElement.x * scale,
                    top: renderElement.y * scale,
                    width: renderElement.width * scale,
                    height: renderElement.height * scale,
                    cursor: isPreviewMode ? 'default' : (activeTool === 'cursor' ? (isDragging ? 'grabbing' : 'grab') : 'default'),
                    transform: `rotate(${renderElement.rotation || 0}deg)`,
                    transformOrigin: 'center center',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (activeTool === 'cursor' && !isPreviewMode) {
                      selectElement(element.id, e.shiftKey);
                    }
                  }}
                >
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      fontSize: actualFontSize * scale,
                      fontFamily: renderElement.fontFamily,
                      color: renderElement.color,
                      backgroundColor: renderElement.backgroundColor === 'transparent' ? 'transparent' : renderElement.backgroundColor,
                      display: 'flex',
                      alignItems: element.type === 'label' ? verticalAlignmentStyle.alignItems || 'center' : 'center',
                      justifyContent: element.type === 'label' ? verticalAlignmentStyle.justifyContent || renderElement.textAlign : renderElement.textAlign,
                      flexDirection: (element.type === 'label' ? verticalAlignmentStyle.flexDirection || 'row' : 'row') as 'row' | 'column',
                      padding: `${4 * scale}px`,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      userSelect: 'none',
                      border: element.type === 'label' && !isPreviewMode ? '1px dashed #94a3b8' : 'none',
                    }}
                  >
                    {displayText}
                  </div>

                  {/* Selection Border and Handles - Inside rotated container */}
                  {selectedElementIds.includes(element.id) && !isPreviewMode && (
                    <>
                      <div className="absolute inset-0 border-2 border-dashed border-blue-500 pointer-events-none" style={{ margin: '-2px' }} />
                      
                      {/* Corner resize handles */}
                      <div 
                        style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'nw-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('nw');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', right: -4, top: -4, width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'ne-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('ne');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', left: -4, bottom: -4, width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'sw-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('sw');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', right: -4, bottom: -4, width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'se-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('se');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      
                      {/* Side handles */}
                      <div 
                        style={{ position: 'absolute', left: '50%', top: -4, transform: 'translateX(-50%)', width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'n-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('n');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', left: '50%', bottom: -4, transform: 'translateX(-50%)', width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 's-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('s');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'w-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('w');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      <div 
                        style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 8, backgroundColor: '#3b82f6', cursor: 'e-resize', pointerEvents: 'auto', userSelect: 'none' }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsResizing(true);
                            setResizeHandle('e');
                            setDragElementId(element.id);
                            setResizeStart({ x: mouseX, y: mouseY, width: renderElement.width, height: renderElement.height });
                          }
                        }}
                      />
                      
                      {/* Rotation handle - green circle at top center */}
                      <div 
                        style={{ 
                          position: 'absolute', 
                          left: '50%', 
                          top: '-20px',
                          transform: 'translateX(-50%)', 
                          width: 16, 
                          height: 16, 
                          backgroundColor: '#10b981', 
                          border: '2px solid white',
                          borderRadius: '50%',
                          cursor: 'grab', 
                          pointerEvents: 'auto', 
                          userSelect: 'none' 
                        }} 
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const rect = canvasRef.current?.getBoundingClientRect();
                          if (rect) {
                            const mouseX = (e.clientX - rect.left) / scale;
                            const mouseY = (e.clientY - rect.top) / scale;
                            setIsRotating(true);
                            setDragElementId(element.id);
                            setRotateStart({ 
                              x: mouseX, 
                              y: mouseY, 
                              rotation: renderElement.rotation || 0 
                            });
                          }
                        }}
                      />
                    </>
                  )}
                </div>
              </div>
                );
            })}
          </div>
        </div>
      </div>
      
      {/* Fixed UI Elements */}
      <div className="absolute bottom-4 right-4 bg-background/80 backdrop-blur-sm rounded-md px-3 py-2 text-sm font-mono pointer-events-none">
        {Math.round(scale * 100)}%
      </div>
      
      <div className="absolute top-4 left-4 bg-background/80 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-muted-foreground pointer-events-none">
        {isPreviewMode ? (
          <div>
            <div className="text-blue-600 font-medium">Preview Mode</div>
            <div>Read-only view with sample data</div>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <div>Zoom: Ctrl/Cmd + Scroll over canvas</div>
              <div>Pan: Scroll background or drag canvas</div>
            </div>
            <div className="md:hidden">Pinch to zoom • Scroll to pan</div>
          </>
        )}
      </div>
      
      <div className="absolute top-4 right-4 bg-background/80 backdrop-blur-sm rounded-md px-3 py-2 text-xs text-muted-foreground pointer-events-none">
        <div>{canvasDimensions.width} × {canvasDimensions.height}px</div>
        <div className="text-[10px] text-muted-foreground/70">
          {canvasDimensions.unitsWidth} × {canvasDimensions.unitsHeight} units
        </div>
      </div>
    </div>
  );
}