"use client";

import { useState, useEffect } from "react";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MousePointer, Type, Download, Upload, Eye, EyeOff, GripVertical, Layers, Trash2, Group, Ungroup, Undo, Redo, Tag, Play, Pause, PenTool, Image } from "lucide-react";
import Canvas from "@/components/Canvas";
import SignatureModal from "@/components/SignatureModal";
import MediaModal from "@/components/MediaModal";
import type { CanvasElement, Tool, GroupElement, HistoryState, HistoryStack, CanvasSettings, SignatureElement, MediaElement } from "@/types/canvas";

const STORAGE_KEY = 'canvas-app-state';

declare global {
  interface Window {
    layerRenameTimeout?: NodeJS.Timeout;
    textInputTimeout?: NodeJS.Timeout;
  }
}

export default function Home() {
  const [meshColor, setMeshColor] = useState("#e2e8f0");
  const [backgroundColor, setBackgroundColor] = useState("#ffffff");
  const [canvasRatio, setCanvasRatio] = useState("16:9");
  const [showGrid, setShowGrid] = useState(true);
  
  // Background image settings
  const [backgroundImage, setBackgroundImage] = useState<string>();
  const [backgroundImageOpacity, setBackgroundImageOpacity] = useState(100);
  const [backgroundImageBrightness, setBackgroundImageBrightness] = useState(100);
  const [backgroundImageContrast, setBackgroundImageContrast] = useState(100);
  const [backgroundImageBlur, setBackgroundImageBlur] = useState(0);
  const [backgroundImageOverlay, setBackgroundImageOverlay] = useState<'none' | 'dark' | 'light'>('none');
  const [backgroundImageOverlayOpacity, setBackgroundImageOverlayOpacity] = useState(50);
  
  // Element management
  const [elements, setElements] = useState<CanvasElement[]>([]);
  const [selectedElementIds, setSelectedElementIds] = useState<string[]>([]);
  const [activeTool, setActiveTool] = useState<Tool>('cursor');
  const [isLoaded, setIsLoaded] = useState(false);

  // Local input states for better UX (allows empty fields during editing)
  const [fontSizeInputs, setFontSizeInputs] = useState<Record<string, string>>({});
  
  // Modal states
  const [isSignatureModalOpen, setIsSignatureModalOpen] = useState(false);
  const [isMediaModalOpen, setIsMediaModalOpen] = useState(false);
  
  // Export settings
  const [exportResolution, setExportResolution] = useState(4);
  const [customExportResolution, setCustomExportResolution] = useState(4);
  const [isCustomExportResolution, setIsCustomExportResolution] = useState(false);

  // Helper function for font size input management
  const getFontSizeInputValue = (elementId: string, property: 'fontSize' | 'minFontSize', actualValue: number) => {
    const inputKey = `${elementId}-${property}`;
    return fontSizeInputs[inputKey] !== undefined ? fontSizeInputs[inputKey] : actualValue.toString();
  };

  const handleFontSizeInputChange = (elementId: string, property: 'fontSize' | 'minFontSize', value: string) => {
    const inputKey = `${elementId}-${property}`;
    setFontSizeInputs(prev => ({ ...prev, [inputKey]: value }));
  };

  const handleFontSizeInputBlur = (elementId: string, property: 'fontSize' | 'minFontSize', value: string, defaultValue: number, minValue: number = 4, maxValue: number = 100) => {
    const inputKey = `${elementId}-${property}`;
    
    if (value.trim() === '' || isNaN(parseInt(value))) {
      // Reset to default and clear local state
      setFontSizeInputs(prev => {
        const newState = { ...prev };
        delete newState[inputKey];
        return newState;
      });
      updateElementProperty(elementId, { [property]: defaultValue }, `change_${property}`);
    } else {
      const numValue = Math.max(minValue, Math.min(maxValue, parseInt(value)));
      setFontSizeInputs(prev => {
        const newState = { ...prev };
        delete newState[inputKey];
        return newState;
      });
      updateElementProperty(elementId, { [property]: numValue }, `change_${property}`);
    }
  };

  const handleFontSizeKeyDown = (e: React.KeyboardEvent, elementId: string, property: 'fontSize' | 'minFontSize', value: string, defaultValue: number, minValue: number = 4, maxValue: number = 100) => {
    if (e.key === 'Enter') {
      handleFontSizeInputBlur(elementId, property, value, defaultValue, minValue, maxValue);
    }
  };
  
  // Preview mode and sample data
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [sampleData, setSampleData] = useState<Record<string, string>>({});
  const [sampleDataJson, setSampleDataJson] = useState('{\n  "name": "John Doe",\n  "course": "Web Development",\n  "date": "2024-01-15"\n}');

  // History management for undo/redo
  const [history, setHistory] = useState<HistoryStack>({
    past: [],
    present: {
      elements: [],
      canvasSettings: {
        meshColor: "#e2e8f0",
        backgroundColor: "#ffffff",
        canvasRatio: "16:9",
        showGrid: true,
        backgroundImageOpacity: 100,
        backgroundImageBrightness: 100,
        backgroundImageContrast: 100,
        backgroundImageBlur: 0,
        backgroundImageOverlay: 'none',
        backgroundImageOverlayOpacity: 50
      },
      timestamp: Date.now(),
      operation: 'initial'
    },
    future: []
  });

  const MAX_HISTORY_SIZE = 100;
  
  // Get selected elements
  const selectedElements = elements.filter(el => selectedElementIds.includes(el.id));
  const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null;

  // History management functions
  const saveToHistory = (operation: string, newElements?: CanvasElement[], newCanvasSettings?: CanvasSettings) => {
    const currentCanvasSettings = {
      meshColor,
      backgroundColor,
      canvasRatio,
      showGrid,
      backgroundImage,
      backgroundImageOpacity,
      backgroundImageBrightness,
      backgroundImageContrast,
      backgroundImageBlur,
      backgroundImageOverlay,
      backgroundImageOverlayOpacity
    };

    const newState: HistoryState = {
      elements: newElements || elements,
      canvasSettings: newCanvasSettings || currentCanvasSettings,
      timestamp: Date.now(),
      operation
    };

    setHistory(prev => {
      const newPast = [...prev.past, prev.present];
      
      // Limit history size to prevent memory issues
      if (newPast.length > MAX_HISTORY_SIZE) {
        newPast.shift(); // Remove oldest entry
      }

      return {
        past: newPast,
        present: newState,
        future: [] // Clear future when new action is performed
      };
    });
  };

  const undo = () => {
    if (history.past.length === 0) return;

    const previous = history.past[history.past.length - 1];
    const newPast = history.past.slice(0, -1);

    setElements(previous.elements);
    setMeshColor(previous.canvasSettings.meshColor);
    setBackgroundColor(previous.canvasSettings.backgroundColor);
    setCanvasRatio(previous.canvasSettings.canvasRatio);
    setShowGrid(previous.canvasSettings.showGrid);
    setBackgroundImage(previous.canvasSettings.backgroundImage);
    setBackgroundImageOpacity(previous.canvasSettings.backgroundImageOpacity);
    setBackgroundImageBrightness(previous.canvasSettings.backgroundImageBrightness);
    setBackgroundImageContrast(previous.canvasSettings.backgroundImageContrast);
    setBackgroundImageBlur(previous.canvasSettings.backgroundImageBlur);
    setBackgroundImageOverlay(previous.canvasSettings.backgroundImageOverlay);
    setBackgroundImageOverlayOpacity(previous.canvasSettings.backgroundImageOverlayOpacity);
    // Don't restore selection - keep current selection

    setHistory({
      past: newPast,
      present: previous,
      future: [history.present, ...history.future]
    });
  };

  const redo = () => {
    if (history.future.length === 0) return;

    const next = history.future[0];
    const newFuture = history.future.slice(1);

    setElements(next.elements);
    setMeshColor(next.canvasSettings.meshColor);
    setBackgroundColor(next.canvasSettings.backgroundColor);
    setCanvasRatio(next.canvasSettings.canvasRatio);
    setShowGrid(next.canvasSettings.showGrid);
    setBackgroundImage(next.canvasSettings.backgroundImage);
    setBackgroundImageOpacity(next.canvasSettings.backgroundImageOpacity);
    setBackgroundImageBrightness(next.canvasSettings.backgroundImageBrightness);
    setBackgroundImageContrast(next.canvasSettings.backgroundImageContrast);
    setBackgroundImageBlur(next.canvasSettings.backgroundImageBlur);
    setBackgroundImageOverlay(next.canvasSettings.backgroundImageOverlay);
    setBackgroundImageOverlayOpacity(next.canvasSettings.backgroundImageOverlayOpacity);
    // Don't restore selection - keep current selection

    setHistory({
      past: [...history.past, history.present],
      present: next,
      future: newFuture
    });
  };

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(STORAGE_KEY);
      if (savedState) {
        const state = JSON.parse(savedState);
        
        if (state.elements) {
          const migratedElements = migrateLabelElements(state.elements);
          setElements(migratedElements);
        }
        if (state.meshColor) setMeshColor(state.meshColor);
        if (state.backgroundColor) setBackgroundColor(state.backgroundColor);
        if (state.canvasRatio) setCanvasRatio(state.canvasRatio);
        if (state.showGrid !== undefined) setShowGrid(state.showGrid);
        if (state.activeTool) setActiveTool(state.activeTool);
        if (state.selectedElementIds) setSelectedElementIds(state.selectedElementIds);
        if (state.backgroundImage) setBackgroundImage(state.backgroundImage);
        if (state.backgroundImageOpacity !== undefined) setBackgroundImageOpacity(state.backgroundImageOpacity);
        if (state.backgroundImageBrightness !== undefined) setBackgroundImageBrightness(state.backgroundImageBrightness);
        if (state.backgroundImageContrast !== undefined) setBackgroundImageContrast(state.backgroundImageContrast);
        if (state.backgroundImageBlur !== undefined) setBackgroundImageBlur(state.backgroundImageBlur);
        if (state.backgroundImageOverlay !== undefined) setBackgroundImageOverlay(state.backgroundImageOverlay);
        if (state.backgroundImageOverlayOpacity !== undefined) setBackgroundImageOverlayOpacity(state.backgroundImageOverlayOpacity);
        if (state.isPreviewMode !== undefined) setIsPreviewMode(state.isPreviewMode);
        if (state.sampleDataJson !== undefined) setSampleDataJson(state.sampleDataJson);
        if (state.exportResolution !== undefined) setExportResolution(state.exportResolution);
        if (state.customExportResolution !== undefined) setCustomExportResolution(state.customExportResolution);
        if (state.isCustomExportResolution !== undefined) setIsCustomExportResolution(state.isCustomExportResolution);
        
        // Initialize history with loaded state
        if (state.elements) {
          setHistory({
            past: [],
            present: {
              elements: state.elements || [],
              canvasSettings: {
                meshColor: state.meshColor || "#e2e8f0",
                backgroundColor: state.backgroundColor || "#ffffff", 
                canvasRatio: state.canvasRatio || "16:9",
                showGrid: state.showGrid !== undefined ? state.showGrid : true,
                backgroundImage: state.backgroundImage,
                backgroundImageOpacity: state.backgroundImageOpacity || 100,
                backgroundImageBrightness: state.backgroundImageBrightness || 100,
                backgroundImageContrast: state.backgroundImageContrast || 100,
                backgroundImageBlur: state.backgroundImageBlur || 0,
                backgroundImageOverlay: state.backgroundImageOverlay || 'none',
                backgroundImageOverlayOpacity: state.backgroundImageOverlayOpacity || 50
              },
              timestamp: Date.now(),
              operation: 'load_state'
            },
            future: []
          });
        }
      }
    } catch (error) {
      console.warn('Failed to load saved canvas state:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    if (!isLoaded) return; // Don't save during initial load
    
    const state = {
      elements,
      meshColor,
      backgroundColor,
      canvasRatio,
      showGrid,
      activeTool,
      selectedElementIds,
      backgroundImage,
      backgroundImageOpacity,
      backgroundImageBrightness,
      backgroundImageContrast,
      backgroundImageBlur,
      backgroundImageOverlay,
      backgroundImageOverlayOpacity,
      isPreviewMode,
      sampleDataJson,
      exportResolution,
      customExportResolution,
      isCustomExportResolution,
      timestamp: new Date().toISOString()
    };
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      console.warn('Failed to save canvas state:', error);
    }
  }, [elements, meshColor, backgroundColor, canvasRatio, showGrid, activeTool, selectedElementIds, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity, isPreviewMode, sampleDataJson, exportResolution, customExportResolution, isCustomExportResolution, isLoaded]);

  // Keyboard event handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent actions when typing in input fields
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Undo/Redo shortcuts
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
        return;
      }

      // Delete selected elements
      if (selectedElementIds.length > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        deleteSelectedElements();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [selectedElementIds]);

  // Template save/load functionality
  const saveTemplate = () => {
    const template = {
      elements,
      canvasSettings: {
        meshColor,
        backgroundColor,
        canvasRatio,
        showGrid
      },
      timestamp: new Date().toISOString()
    };

    const dataStr = JSON.stringify(template, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `canvas-template-${Date.now()}.json`;
    link.click();
    
    URL.revokeObjectURL(url);
  };

  const loadTemplate = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const template = JSON.parse(e.target?.result as string);
        
        if (template.elements) {
          setElements(template.elements);
        }
        
        if (template.canvasSettings) {
          setMeshColor(template.canvasSettings.meshColor || "#e2e8f0");
          setBackgroundColor(template.canvasSettings.backgroundColor || "#ffffff");
          setCanvasRatio(template.canvasSettings.canvasRatio || "16:9");
          setShowGrid(template.canvasSettings.showGrid !== false);
        }
        
        setSelectedElementIds([]);
      } catch {
        alert('Invalid template file format');
      }
    };
    
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  // Export canvas as image
  const exportAsImage = async () => {
    try {
      // Create a new canvas to render the export
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        alert('Unable to create export canvas');
        return;
      }

      // Get actual canvas dimensions from the Canvas component
      const getCanvasDimensions = () => {
        const baseGridSize = 20;
        const baseUnitsWidth = 60;
        
        switch (canvasRatio) {
          case "16:9": {
            const unitsHeight = Math.round(baseUnitsWidth * (9/16));
            return { 
              width: baseUnitsWidth * baseGridSize, 
              height: unitsHeight * baseGridSize
            };
          }
          case "4:3": {
            const unitsHeight = Math.round(baseUnitsWidth * (3/4));
            return { 
              width: baseUnitsWidth * baseGridSize, 
              height: unitsHeight * baseGridSize
            };
          }
          case "1:1": {
            const unitsHeight = baseUnitsWidth;
            return { 
              width: baseUnitsWidth * baseGridSize, 
              height: unitsHeight * baseGridSize
            };
          }
          default: {
            const unitsHeight = Math.round(baseUnitsWidth * (9/16));
            return { 
              width: baseUnitsWidth * baseGridSize, 
              height: unitsHeight * baseGridSize
            };
          }
        }
      };

      const { width, height } = getCanvasDimensions();
      const exportScale = isCustomExportResolution ? customExportResolution : exportResolution; // Configurable resolution
      canvas.width = width * exportScale;
      canvas.height = height * exportScale;
      
      // Scale the context to render at higher resolution
      ctx.scale(exportScale, exportScale);

      // Fill background
      ctx.fillStyle = backgroundColor;
      ctx.fillRect(0, 0, width, height);

      // Draw background image if present
      if (backgroundImage) {
        const img = document.createElement('img');
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject();
          img.src = backgroundImage;
        });

        // Create a temporary canvas for background image processing
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        if (!tempCtx) return;
        
        tempCanvas.width = width;
        tempCanvas.height = height;

        // Draw the background image to temp canvas first
        tempCtx.drawImage(img, 0, 0, width, height);

        // Apply filters using Canvas 2D context (more reliable than CSS filters)
        ctx.save();
        ctx.globalAlpha = backgroundImageOpacity / 100;
        
        // Apply filters - using more reliable canvas filter if available, fallback to CSS filter
        let filterString = '';
        if (backgroundImageBrightness !== 100) filterString += `brightness(${backgroundImageBrightness}%) `;
        if (backgroundImageContrast !== 100) filterString += `contrast(${backgroundImageContrast}%) `;
        if (backgroundImageBlur > 0) filterString += `blur(${backgroundImageBlur}px) `;
        
        if (filterString) {
          try {
            ctx.filter = filterString.trim();
          } catch (e) {
            console.warn('Canvas filter not supported, filters may not apply in export');
          }
        }

        // Draw the processed background image
        ctx.drawImage(tempCanvas, 0, 0, width, height);
        
        // Reset filter
        ctx.filter = 'none';
        
        // Draw overlay if present
        if (backgroundImageOverlay !== 'none') {
          const overlayAlpha = backgroundImageOverlayOpacity / 100;
          ctx.globalAlpha = overlayAlpha;
          ctx.fillStyle = backgroundImageOverlay === 'dark' ? '#000000' : '#ffffff';
          ctx.fillRect(0, 0, width, height);
        }
        
        ctx.restore();
      }

      // Sort elements by zIndex
      const sortedElements = [...elements]
        .filter(el => el.visible && (el.type === 'text' || el.type === 'label' || el.type === 'signature' || el.type === 'media'))
        .sort((a, b) => a.zIndex - b.zIndex);

      // Render each element
      for (const element of sortedElements) {
        ctx.save();

        // Apply rotation (skip groups as they don't have these properties)
        if (element.type !== 'group' && (element as any).rotation) {
          const centerX = (element as any).x + (element as any).width / 2;
          const centerY = (element as any).y + (element as any).height / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate(((element as any).rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }

        if (element.type === 'text') {
          const textElement = element as Extract<CanvasElement, { type: 'text' }>;
          
          // Draw background
          if (textElement.backgroundColor !== 'transparent') {
            ctx.fillStyle = textElement.backgroundColor;
            ctx.fillRect(textElement.x, textElement.y, textElement.width, textElement.height);
          }

          // Draw text
          ctx.fillStyle = textElement.color;
          ctx.font = `${textElement.fontSize}px ${textElement.fontFamily}`;
          ctx.textAlign = textElement.textAlign as CanvasTextAlign;
          ctx.textBaseline = 'middle';

          const textX = textElement.textAlign === 'center' ? textElement.x + textElement.width / 2 :
                       textElement.textAlign === 'right' ? textElement.x + textElement.width - 4 :
                       textElement.x + 4;
          const textY = textElement.y + textElement.height / 2;

          ctx.fillText(textElement.text, textX, textY);
        } 
        else if (element.type === 'label') {
          const labelElement = element as Extract<CanvasElement, { type: 'label' }>;
          // For export, always use JSON data if available, otherwise use placeholder
          const displayText = sampleData[labelElement.jsonKey] || labelElement.placeholder;
          
          // Draw background
          if (labelElement.backgroundColor !== 'transparent') {
            ctx.fillStyle = labelElement.backgroundColor;
            ctx.fillRect(labelElement.x, labelElement.y, labelElement.width, labelElement.height);
          }

          // Draw text with proper font sizing (respect auto-sizing)
          ctx.fillStyle = labelElement.color;
          
          // Calculate font size based on auto-sizing if enabled
          let fontSize = labelElement.fontSize;
          if (labelElement.autoSizeText && displayText) {
            // Simple font size calculation to fit text in bounds
            ctx.font = `${fontSize}px ${labelElement.fontFamily}`;
            const textMetrics = ctx.measureText(displayText);
            const textWidth = textMetrics.width;
            const availableWidth = labelElement.width - 8; // 4px padding on each side
            
            if (textWidth > availableWidth && availableWidth > 0) {
              fontSize = Math.max(labelElement.minFontSize, (fontSize * availableWidth) / textWidth);
            }
          }
          
          ctx.font = `${fontSize}px ${labelElement.fontFamily}`;
          ctx.textAlign = labelElement.textAlign as CanvasTextAlign;
          
          // Handle vertical alignment
          let textY = labelElement.y + labelElement.height / 2; // default center
          if (labelElement.verticalAlign === 'top') {
            ctx.textBaseline = 'top';
            textY = labelElement.y + 4;
          } else if (labelElement.verticalAlign === 'bottom') {
            ctx.textBaseline = 'bottom';
            textY = labelElement.y + labelElement.height - 4;
          } else {
            ctx.textBaseline = 'middle';
            textY = labelElement.y + labelElement.height / 2;
          }

          const textX = labelElement.textAlign === 'center' ? labelElement.x + labelElement.width / 2 :
                       labelElement.textAlign === 'right' ? labelElement.x + labelElement.width - 4 :
                       labelElement.x + 4;

          ctx.fillText(displayText, textX, textY);
        }
        else if (element.type === 'signature') {
          const signatureElement = element as Extract<CanvasElement, { type: 'signature' }>;
          
          // Use SVG data with color filter if available, otherwise fall back to imageData
          if (signatureElement.svgData) {
            // Create SVG blob and convert to image
            const svgBlob = new Blob([signatureElement.svgData], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            const img = document.createElement('img');
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.src = url;
            });
            
            // Calculate aspect ratio preserving dimensions
            const imageAspectRatio = img.naturalWidth / img.naturalHeight;
            const containerAspectRatio = signatureElement.width / signatureElement.height;
            
            let drawWidth = signatureElement.width;
            let drawHeight = signatureElement.height;
            let drawX = signatureElement.x;
            let drawY = signatureElement.y;
            
            // Preserve aspect ratio by fitting within the bounds
            if (imageAspectRatio > containerAspectRatio) {
              // Image is wider - fit to width
              drawHeight = signatureElement.width / imageAspectRatio;
              drawY = signatureElement.y + (signatureElement.height - drawHeight) / 2;
            } else {
              // Image is taller - fit to height
              drawWidth = signatureElement.height * imageAspectRatio;
              drawX = signatureElement.x + (signatureElement.width - drawWidth) / 2;
            }
            
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            URL.revokeObjectURL(url);
          } else if (signatureElement.imageData) {
            // Fallback to imageData if no SVG available
            const img = document.createElement('img');
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.src = signatureElement.imageData;
            });
            
            // Calculate aspect ratio preserving dimensions for imageData too
            const imageAspectRatio = img.naturalWidth / img.naturalHeight;
            const containerAspectRatio = signatureElement.width / signatureElement.height;
            
            let drawWidth = signatureElement.width;
            let drawHeight = signatureElement.height;
            let drawX = signatureElement.x;
            let drawY = signatureElement.y;
            
            // Preserve aspect ratio by fitting within the bounds
            if (imageAspectRatio > containerAspectRatio) {
              // Image is wider - fit to width
              drawHeight = signatureElement.width / imageAspectRatio;
              drawY = signatureElement.y + (signatureElement.height - drawHeight) / 2;
            } else {
              // Image is taller - fit to height
              drawWidth = signatureElement.height * imageAspectRatio;
              drawX = signatureElement.x + (signatureElement.width - drawWidth) / 2;
            }
            
            ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          }
        }
        else if (element.type === 'media') {
          const mediaElement = element as Extract<CanvasElement, { type: 'media' }>;
          
          if (mediaElement.mediaType === 'svg') {
            // For SVG, we need to convert it to an image first
            const svgBlob = new Blob([mediaElement.data], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(svgBlob);
            const img = document.createElement('img');
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.src = url;
            });
            ctx.drawImage(img, mediaElement.x, mediaElement.y, mediaElement.width, mediaElement.height);
            URL.revokeObjectURL(url);
          } else {
            const img = document.createElement('img');
            await new Promise<void>((resolve) => {
              img.onload = () => resolve();
              img.src = mediaElement.data;
            });
            ctx.drawImage(img, mediaElement.x, mediaElement.y, mediaElement.width, mediaElement.height);
          }
        }

        ctx.restore();
      }

      // Download the image
      canvas.toBlob((blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `canvas-export-${Date.now()}.png`;
          link.click();
          URL.revokeObjectURL(url);
        }
      }, 'image/png');

    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export image. Please try again.');
    }
  };

  // Layer management functions (moveLayerUp and moveLayerDown removed - now using drag-and-drop)

  const toggleLayerVisibility = (elementId: string) => {
    const element = elements.find(el => el.id === elementId);
    let newSelectedIds = selectedElementIds;
    
    if (element && element.visible && selectedElementIds.includes(elementId)) {
      // If hiding a currently selected element, remove it from selection
      newSelectedIds = selectedElementIds.filter(id => id !== elementId);
      setSelectedElementIds(newSelectedIds);
    }
    
    const newElements = elements.map(el => 
      el.id === elementId ? { ...el, visible: !el.visible } : el
    );
    setElements(newElements);
    saveToHistory('toggle_layer_visibility', newElements);
  };

  const renameLayer = (elementId: string, newName: string) => {
    const newElements = elements.map(el => 
      el.id === elementId ? { ...el, name: newName } : el
    );
    setElements(newElements);
    // Use debounced saving for layer renaming to avoid excessive history entries
    clearTimeout(window.layerRenameTimeout);
    window.layerRenameTimeout = setTimeout(() => {
      saveToHistory('rename_layer', newElements);
    }, 500);
  };

  const clearCanvas = () => {
    if (confirm('Are you sure you want to clear the canvas? This will remove all elements.')) {
      const newElements: CanvasElement[] = [];
      const newSelectedIds: string[] = [];
      
      setElements(newElements);
      setSelectedElementIds(newSelectedIds);
      saveToHistory('clear_canvas', newElements);
    }
  };

  // Selection management
  // Wrapper function for updating elements with history
  const updateElements = (newElements: CanvasElement[], operation: string, newSelectedIds?: string[]) => {
    setElements(newElements);
    if (newSelectedIds !== undefined) {
      setSelectedElementIds(newSelectedIds);
    }
    saveToHistory(operation, newElements);
  };

  // Migration function to ensure all labels have required properties
  const migrateLabelElements = (elements: CanvasElement[]): CanvasElement[] => {
    return elements.map(element => {
      if (element.type === 'label') {
        const labelElement = element as Extract<CanvasElement, { type: 'label' }>;
        return {
          ...labelElement,
          // Add missing properties with sensible defaults
          verticalAlign: labelElement.verticalAlign ?? 'center',
          minFontSize: labelElement.minFontSize ?? 8,
          autoSizeText: labelElement.autoSizeText ?? true,
        } as CanvasElement;
      }
      return element;
    });
  };

  // Helper function for updating element properties
  const updateElementProperty = (elementId: string, updates: Partial<CanvasElement>, operation: string) => {
    const newElements = elements.map(el => {
      if (el.id === elementId) {
        if (el.type === 'text') {
          return { ...el, ...updates } as CanvasElement;
        } else if (el.type === 'label') {
          return { ...el, ...updates } as CanvasElement;
        } else if (el.type === 'signature') {
          return { ...el, ...updates } as CanvasElement;
        } else if (el.type === 'media') {
          const mediaElement = el as MediaElement;
          const updatedElement = { ...mediaElement, ...updates } as MediaElement;
          
          // Handle SVG color changes
          if (mediaElement.mediaType === 'svg' && ((updates as MediaElement).strokeColor || (updates as MediaElement).fillColor)) {
            let svgContent = mediaElement.originalData || mediaElement.data;
            
            const newStrokeColor = (updates as MediaElement).strokeColor || mediaElement.strokeColor;
            const newFillColor = (updates as MediaElement).fillColor || mediaElement.fillColor;
            
            // Simple SVG color replacement
            if (newStrokeColor) {
              svgContent = svgContent.replace(/stroke="[^"]*"/g, `stroke="${newStrokeColor}"`);
              svgContent = svgContent.replace(/stroke:[^;"]*/g, `stroke:${newStrokeColor}`);
            }
            
            if (newFillColor) {
              svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${newFillColor}"`);
              svgContent = svgContent.replace(/fill:[^;"]*/g, `fill:${newFillColor}`);
            }
            
            updatedElement.data = svgContent;
          }
          
          return updatedElement as CanvasElement;
        } else if (el.type === 'group') {
          return { ...el, ...updates } as CanvasElement;
        }
      }
      return el;
    });
    setElements(newElements);
    saveToHistory(operation, newElements);
  };

  // Helper functions for canvas settings changes
  const updateMeshColor = (newColor: string) => {
    setMeshColor(newColor);
    const newCanvasSettings = { meshColor: newColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_mesh_color', elements, newCanvasSettings);
  };

  const updateBackgroundColor = (newColor: string) => {
    setBackgroundColor(newColor);
    const newCanvasSettings = { meshColor, backgroundColor: newColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_canvas_background', elements, newCanvasSettings);
  };

  const updateCanvasRatio = (newRatio: string) => {
    setCanvasRatio(newRatio);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio: newRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_canvas_ratio', elements, newCanvasSettings);
  };

  // Update signature color function
  const updateSignatureColor = (elementId: string, newColor: string) => {
    const element = elements.find(el => el.id === elementId) as SignatureElement;
    if (element && element.type === 'signature') {
      // Update SVG color filter values
      const r = parseInt(newColor.substr(1, 2), 16) / 255;
      const g = parseInt(newColor.substr(3, 2), 16) / 255;
      const b = parseInt(newColor.substr(5, 2), 16) / 255;
      
      const updatedSvgData = element.svgData.replace(
        /values="[^"]*"/,
        `values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"`
      );
      
      // Update element with new color and SVG data
      updateElementProperty(elementId, { 
        color: newColor, 
        svgData: updatedSvgData 
      }, 'change_signature_color');
    }
  };

  const updateShowGrid = (newShowGrid: boolean) => {
    setShowGrid(newShowGrid);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid: newShowGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_grid_visibility', elements, newCanvasSettings);
  };

  // Background image update functions
  const updateBackgroundImage = (newImage?: string) => {
    setBackgroundImage(newImage);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage: newImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_image', elements, newCanvasSettings);
  };

  const updateBackgroundImageOpacity = (newOpacity: number) => {
    setBackgroundImageOpacity(newOpacity);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity: newOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_opacity', elements, newCanvasSettings);
  };

  const updateBackgroundImageBrightness = (newBrightness: number) => {
    setBackgroundImageBrightness(newBrightness);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness: newBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_brightness', elements, newCanvasSettings);
  };

  const updateBackgroundImageContrast = (newContrast: number) => {
    setBackgroundImageContrast(newContrast);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast: newContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_contrast', elements, newCanvasSettings);
  };

  const updateBackgroundImageBlur = (newBlur: number) => {
    setBackgroundImageBlur(newBlur);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur: newBlur, backgroundImageOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_blur', elements, newCanvasSettings);
  };

  const updateBackgroundImageOverlay = (newOverlay: 'none' | 'dark' | 'light') => {
    setBackgroundImageOverlay(newOverlay);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay: newOverlay, backgroundImageOverlayOpacity };
    saveToHistory('change_background_overlay', elements, newCanvasSettings);
  };

  const updateBackgroundImageOverlayOpacity = (newOpacity: number) => {
    setBackgroundImageOverlayOpacity(newOpacity);
    const newCanvasSettings = { meshColor, backgroundColor, canvasRatio, showGrid, backgroundImage, backgroundImageOpacity, backgroundImageBrightness, backgroundImageContrast, backgroundImageBlur, backgroundImageOverlay, backgroundImageOverlayOpacity: newOpacity };
    saveToHistory('change_background_overlay_opacity', elements, newCanvasSettings);
  };

  // Background image upload handler
  const handleBackgroundImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const imageDataUrl = e.target?.result as string;
        updateBackgroundImage(imageDataUrl);
      };
      reader.readAsDataURL(file);
    } else {
      alert('Please select a valid image file');
    }
    
    event.target.value = ''; // Reset input
  };

  const removeBackgroundImage = () => {
    updateBackgroundImage(undefined);
  };

  // Parse sample data JSON
  const updateSampleDataJson = (jsonString: string) => {
    setSampleDataJson(jsonString);
    try {
      const parsed = JSON.parse(jsonString);
      setSampleData(parsed);
    } catch (error) {
      // Keep previous sample data if JSON is invalid
    }
  };

  // Initialize sample data on component mount
  useEffect(() => {
    try {
      const parsed = JSON.parse(sampleDataJson);
      setSampleData(parsed);
    } catch (error) {
      setSampleData({});
    }
  }, []);

  const selectElement = (elementId: string, isShiftClick = false) => {
    if (isShiftClick) {
      setSelectedElementIds(prev => 
        prev.includes(elementId) 
          ? prev.filter(id => id !== elementId)
          : [...prev, elementId]
      );
    } else {
      setSelectedElementIds([elementId]);
    }
  };

  const deleteSelectedElements = () => {
    const remainingElements = elements.filter(el => !selectedElementIds.includes(el.id));
    const newSelectedIds: string[] = [];
    
    setElements(remainingElements);
    setSelectedElementIds(newSelectedIds);
    saveToHistory('delete_elements', remainingElements);
  };

  const deleteElement = (elementId: string) => {
    const remainingElements = elements.filter(el => el.id !== elementId);
    const newSelectedIds = selectedElementIds.filter(id => id !== elementId);
    
    setElements(remainingElements);
    setSelectedElementIds(newSelectedIds);
    saveToHistory('delete_element', remainingElements);
  };

  // Signature creation
  const handleSignatureConfirm = (imageData: string, svgData: string, color: string) => {
    const newSignatureElement: SignatureElement = {
      id: `signature-${Date.now()}`,
      type: 'signature',
      x: 100, // Default position
      y: 100,
      width: 200, // Default size
      height: 100,
      svgData,
      imageData,
      color: color, // Color from modal
      rotation: 0,
      zIndex: Math.max(...elements.map(el => el.zIndex), 0) + 1, // Higher zIndex to appear on top
      visible: true,
      name: `Signature ${elements.filter(el => el.type === 'signature').length + 1}`
    };
    
    const newElements = [...elements, newSignatureElement];
    updateElements(newElements, 'add_signature', [newSignatureElement.id]);
    selectElement(newSignatureElement.id);
    setActiveTool('cursor');
  };

  // Handle media selection from media modal
  const handleMediaConfirm = (mediaItem: any) => {
    const newMediaElement: MediaElement = {
      id: `media-${Date.now()}`,
      type: 'media',
      x: 100, // Default position
      y: 100,
      width: 200, // Default size
      height: 200,
      mediaType: mediaItem.mediaType,
      data: mediaItem.data,
      originalData: mediaItem.originalData,
      fileName: mediaItem.fileName,
      strokeColor: mediaItem.strokeColor,
      fillColor: mediaItem.fillColor,
      rotation: 0,
      zIndex: Math.max(...elements.map(el => el.zIndex), 0) + 1,
      visible: true,
      name: `Media ${elements.filter(el => el.type === 'media').length + 1}`
    };
    
    const newElements = [...elements, newMediaElement];
    updateElements(newElements, 'add_media', [newMediaElement.id]);
    selectElement(newMediaElement.id);
    setActiveTool('cursor');
  };

  // Group management
  const createGroup = () => {
    if (selectedElementIds.length < 2) return;
    
    const groupId = `group-${Date.now()}`;
    const newGroup: CanvasElement = {
      id: groupId,
      type: 'group',
      name: `Group ${elements.filter(el => el.type === 'group').length + 1}`,
      zIndex: Math.max(...elements.map(el => el.zIndex)) + 1,
      visible: true,
      children: selectedElementIds
    };

    // Update elements to belong to the group
    const updatedElements = elements.map(el => 
      selectedElementIds.includes(el.id) && el.type === 'text'
        ? { ...el, groupId }
        : el
    );

    const newElements = [...updatedElements, newGroup];
    const newSelectedIds = [groupId];
    
    setElements(newElements);
    setSelectedElementIds(newSelectedIds);
    saveToHistory('create_group', newElements);
  };

  const ungroupElements = (groupId: string) => {
    const group = elements.find(el => el.id === groupId && el.type === 'group') as GroupElement;
    if (!group) return;

    // Remove group reference from children
    const newElements = elements
      .filter(el => el.id !== groupId)
      .map(el => 
        el.type === 'text' && el.groupId === groupId
          ? { ...el, groupId: undefined }
          : el
      );

    const newSelectedIds = group.children;
    
    setElements(newElements);
    setSelectedElementIds(newSelectedIds);
    saveToHistory('ungroup_elements', newElements);
  };

  // Drag and drop for layer reordering
  const [draggedElementId, setDraggedElementId] = useState<string | null>(null);

  const handleDragStart = (e: React.DragEvent, elementId: string) => {
    setDraggedElementId(elementId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetElementId: string) => {
    e.preventDefault();
    if (!draggedElementId || draggedElementId === targetElementId) return;

    const draggedElement = elements.find(el => el.id === draggedElementId);
    const targetElement = elements.find(el => el.id === targetElementId);
    
    if (!draggedElement || !targetElement) return;

    // Swap z-index values
    const newElements = elements.map(el => {
      if (el.id === draggedElementId) {
        return { ...el, zIndex: targetElement.zIndex };
      }
      if (el.id === targetElementId) {
        return { ...el, zIndex: draggedElement.zIndex };
      }
      return el;
    });

    setElements(newElements);
    setDraggedElementId(null);
    saveToHistory('reorder_layers', newElements);
  };

  // Show loading state while initializing
  if (!isLoaded) {
    return (
      <div className="h-screen w-full flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-sm text-muted-foreground">Loading canvas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <Card className="h-full rounded-none border-r border-t-0 flex flex-col">
            <CardHeader className="pb-3 flex-shrink-0">
              <CardTitle className="text-lg font-semibold">Tools Panel</CardTitle>
            </CardHeader>
            <Separator className="flex-shrink-0" />
            <CardContent className="p-4 space-y-4 flex-1 overflow-y-auto">
              {/* Preview Mode Toggle */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Mode</Label>
                <Button
                  variant={isPreviewMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setIsPreviewMode(!isPreviewMode);
                    // Clear selections when switching modes
                    setSelectedElementIds([]);
                    // Switch to cursor tool when entering preview mode
                    if (!isPreviewMode) {
                      setActiveTool('cursor');
                    }
                  }}
                  className="w-full justify-start"
                >
                  {isPreviewMode ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                  {isPreviewMode ? 'Preview Mode' : 'Edit Mode'}
                </Button>
              </div>

              <Separator />

              {/* Tools Section */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tools</Label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant={activeTool === 'cursor' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTool('cursor')}
                    className="w-full justify-start"
                    disabled={isPreviewMode}
                  >
                    <MousePointer className="w-4 h-4 mr-2" />
                    Cursor
                  </Button>
                  <Button
                    variant={activeTool === 'text' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTool('text')}
                    className="w-full justify-start"
                    disabled={isPreviewMode}
                  >
                    <Type className="w-4 h-4 mr-2" />
                    Text
                  </Button>
                  <Button
                    variant={activeTool === 'label' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setActiveTool('label')}
                    className="w-full justify-start"
                    disabled={isPreviewMode}
                  >
                    <Tag className="w-4 h-4 mr-2" />
                    Label
                  </Button>
                  <Button
                    variant={activeTool === 'signature' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setActiveTool('signature');
                      setIsSignatureModalOpen(true);
                    }}
                    className="w-full justify-start"
                    disabled={isPreviewMode}
                  >
                    <PenTool className="w-4 h-4 mr-2" />
                    Signature
                  </Button>
                  <Button
                    variant={activeTool === 'media' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setActiveTool('media');
                      setIsMediaModalOpen(true);
                    }}
                    className="w-full justify-start"
                    disabled={isPreviewMode}
                  >
                    <Image className="w-4 h-4 mr-2" />
                    Media
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Preview Mode Controls */}
              {isPreviewMode && (
                <>
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Sample Data (JSON)</Label>
                    <textarea
                      value={sampleDataJson}
                      onChange={(e) => updateSampleDataJson(e.target.value)}
                      placeholder="Enter JSON data here..."
                      className="w-full p-2 text-xs border border-border rounded-md bg-background font-mono resize-none"
                      rows={6}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Labels</Label>
                    <div className="max-h-32 overflow-y-auto border rounded-md">
                      {elements
                        .filter(el => el.type === 'label')
                        .map((element) => {
                          const labelElement = element as Extract<CanvasElement, { type: 'label' }>;
                          return (
                            <div key={element.id} className="p-2 border-b last:border-b-0">
                              <div className="text-xs font-medium text-muted-foreground mb-1">
                                {labelElement.jsonKey}
                              </div>
                              <input
                                type="text"
                                value={sampleData[labelElement.jsonKey] || ''}
                                onChange={(e) => {
                                  setSampleData(prev => ({
                                    ...prev,
                                    [labelElement.jsonKey]: e.target.value
                                  }));
                                }}
                                placeholder={labelElement.placeholder}
                                className="w-full text-xs border border-border rounded px-2 py-1 bg-background"
                              />
                            </div>
                          );
                        })}
                      {elements.filter(el => el.type === 'label').length === 0 && (
                        <div className="p-3 text-center text-xs text-muted-foreground">
                          No labels yet. Switch to Edit Mode and add some labels.
                        </div>
                      )}
                    </div>
                  </div>

                  <Separator />
                </>
              )}
              
              {/* Export Settings */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Export Settings</Label>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs text-muted-foreground">Resolution Multiplier</Label>
                    <select
                      value={isCustomExportResolution ? 'custom' : exportResolution}
                      onChange={(e) => {
                        if (e.target.value === 'custom') {
                          setIsCustomExportResolution(true);
                        } else {
                          setIsCustomExportResolution(false);
                          setExportResolution(parseInt(e.target.value));
                        }
                      }}
                      className="w-full p-2 text-sm border border-border rounded-md bg-background"
                    >
                      <option value="1">1x - Web Quality (1200×675)</option>
                      <option value="2">2x - Standard Quality (2400×1350)</option>
                      <option value="4">4x - High Quality (4800×2700)</option>
                      <option value="6">6x - Print Quality (7200×4050)</option>
                      <option value="8">8x - Large Print (9600×5400)</option>
                      <option value="12">12x - Ultra Quality (14400×8100)</option>
                      <option value="custom">Custom</option>
                    </select>
                    {isCustomExportResolution && (
                      <div className="mt-2">
                        <input
                          type="number"
                          min="1"
                          max="20"
                          value={customExportResolution}
                          onChange={(e) => setCustomExportResolution(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          placeholder="Enter multiplier (1-20)"
                        />
                        <p className="text-xs text-muted-foreground mt-1">
                          {customExportResolution}x - Custom ({1200 * customExportResolution}×{675 * customExportResolution})
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Template Save/Load Section */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Template</Label>
                <div className="flex flex-col gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={saveTemplate}
                    className="w-full justify-start"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Save Template
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={exportAsImage}
                    className="w-full justify-start"
                  >
                    <Image className="w-4 h-4 mr-2" />
                    Export as Image
                  </Button>
                  <label className="w-full">
                    <input
                      type="file"
                      accept=".json"
                      onChange={loadTemplate}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full justify-start cursor-pointer"
                      asChild
                    >
                      <span>
                        <Upload className="w-4 h-4 mr-2" />
                        Load Template
                      </span>
                    </Button>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearCanvas}
                    className="w-full justify-start text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Clear Canvas
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Undo/Redo Section */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">History</Label>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={undo}
                    disabled={history.past.length === 0}
                    className="flex-1 justify-start"
                    title="Undo (Ctrl+Z)"
                  >
                    <Undo className="w-4 h-4 mr-2" />
                    Undo
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={redo}
                    disabled={history.future.length === 0}
                    className="flex-1 justify-start"
                    title="Redo (Ctrl+Y)"
                  >
                    <Redo className="w-4 h-4 mr-2" />
                    Redo
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <Label htmlFor="mesh-color" className="text-sm font-medium">
                  Mesh Color
                </Label>
                <div className="flex items-center space-x-2">
                  <input
                    id="mesh-color"
                    type="color"
                    value={meshColor}
                    onChange={(e) => updateMeshColor(e.target.value)}
                    className="w-12 h-8 rounded border border-border cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground font-mono">
                    {meshColor.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bg-color" className="text-sm font-medium">
                  Background Color
                </Label>
                <div className="flex items-center space-x-2">
                  <input
                    id="bg-color"
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => updateBackgroundColor(e.target.value)}
                    className="w-12 h-8 rounded border border-border cursor-pointer"
                  />
                  <span className="text-xs text-muted-foreground font-mono">
                    {backgroundColor.toUpperCase()}
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="canvas-ratio" className="text-sm font-medium">
                  Canvas Ratio
                </Label>
                <select
                  id="canvas-ratio"
                  value={canvasRatio}
                  onChange={(e) => updateCanvasRatio(e.target.value)}
                  className="w-full p-2 text-sm border border-border rounded-md bg-background"
                >
                  <option value="16:9">16:9 (Widescreen)</option>
                  <option value="4:3">4:3 (Standard)</option>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="3:2">3:2 (Photo)</option>
                  <option value="21:9">21:9 (Ultrawide)</option>
                  <option value="free">Free Form</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">Grid Settings</Label>
                <div className="flex items-center space-x-2">
                  <input
                    id="show-grid"
                    type="checkbox"
                    checked={showGrid}
                    onChange={(e) => updateShowGrid(e.target.checked)}
                    className="rounded border border-border"
                  />
                  <Label htmlFor="show-grid" className="text-sm">
                    Show Grid
                  </Label>
                </div>
              </div>

              <Separator />

              {/* Background Image Settings */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Background Image</Label>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <label className="flex-1">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleBackgroundImageUpload}
                        className="hidden"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full justify-start cursor-pointer"
                        asChild
                      >
                        <span>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Image
                        </span>
                      </Button>
                    </label>
                    {backgroundImage && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={removeBackgroundImage}
                        className="px-2"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>

                  {backgroundImage && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Opacity</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={backgroundImageOpacity}
                            onChange={(e) => updateBackgroundImageOpacity(parseInt(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {backgroundImageOpacity}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Brightness</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="200"
                            value={backgroundImageBrightness}
                            onChange={(e) => updateBackgroundImageBrightness(parseInt(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {backgroundImageBrightness}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Contrast</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="200"
                            value={backgroundImageContrast}
                            onChange={(e) => updateBackgroundImageContrast(parseInt(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {backgroundImageContrast}%
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Blur</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="10"
                            value={backgroundImageBlur}
                            onChange={(e) => updateBackgroundImageBlur(parseInt(e.target.value))}
                            className="flex-1"
                          />
                          <span className="text-xs text-muted-foreground w-8">
                            {backgroundImageBlur}px
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs font-medium">Overlay</Label>
                        <select
                          value={backgroundImageOverlay}
                          onChange={(e) => updateBackgroundImageOverlay(e.target.value as 'none' | 'dark' | 'light')}
                          className="w-full p-1 text-xs border border-border rounded-md bg-background"
                        >
                          <option value="none">None</option>
                          <option value="dark">Dark</option>
                          <option value="light">Light</option>
                        </select>
                      </div>

                      {backgroundImageOverlay !== 'none' && (
                        <div className="space-y-2">
                          <Label className="text-xs font-medium">Overlay Strength</Label>
                          <div className="flex items-center space-x-2">
                            <input
                              type="range"
                              min="0"
                              max="100"
                              value={backgroundImageOverlayOpacity}
                              onChange={(e) => updateBackgroundImageOverlayOpacity(parseInt(e.target.value))}
                              className="flex-1"
                            />
                            <span className="text-xs text-muted-foreground w-8">
                              {backgroundImageOverlayOpacity}%
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              <Separator />

              {/* Layers Panel */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="w-4 h-4" />
                    <Label className="text-sm font-medium">Layers</Label>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={createGroup}
                      disabled={selectedElementIds.length < 2}
                      className="h-6 w-6 p-0"
                      title="Group selected elements"
                    >
                      <Group className="w-3 h-3" />
                    </Button>
                    {selectedElementIds.length === 1 && elements.find(el => el.id === selectedElementIds[0])?.type === 'group' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => ungroupElements(selectedElementIds[0])}
                        className="h-6 w-6 p-0"
                        title="Ungroup elements"
                      >
                        <Ungroup className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="max-h-48 overflow-y-auto border rounded-md scrollbar-thin scrollbar-track-gray-100 scrollbar-thumb-gray-300 hover:scrollbar-thumb-gray-400">
                  {elements
                    .sort((a, b) => b.zIndex - a.zIndex) // Show highest z-index first
                    .map((element) => (
                      <div
                        key={element.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, element.id)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, element.id)}
                        className={`flex items-center p-2 border-b last:border-b-0 gap-2 cursor-pointer hover:bg-muted/50 ${
                          selectedElementIds.includes(element.id) ? 'bg-muted' : ''
                        } ${!element.visible ? 'opacity-60' : ''} ${element.type === 'group' ? 'bg-blue-50 dark:bg-blue-950' : ''} ${
                          draggedElementId === element.id ? 'opacity-50' : ''
                        }`}
                        onClick={(e) => {
                          if (element.visible) {
                            selectElement(element.id, e.shiftKey);
                          }
                        }}
                      >
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleLayerVisibility(element.id);
                          }}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {element.visible ? (
                            <Eye className="w-3 h-3" />
                          ) : (
                            <EyeOff className="w-3 h-3 text-muted-foreground" />
                          )}
                        </button>
                        
                        <div className="flex items-center gap-1 flex-1">
                          {element.type === 'group' && <Group className="w-3 h-3 text-blue-600" />}
                          <input
                            type="text"
                            value={element.name}
                            onChange={(e) => renameLayer(element.id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 text-xs bg-transparent border-none outline-none"
                          />
                        </div>
                        
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteElement(element.id);
                          }}
                          className="p-1 hover:bg-red-100 hover:text-red-600 rounded transition-colors"
                          title="Delete layer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                        
                        <div 
                          className="p-1 hover:bg-muted rounded cursor-grab active:cursor-grabbing"
                          onMouseDown={(e) => e.stopPropagation()} // Prevent layer selection when grabbing handle
                          title="Drag to reorder layer"
                        >
                          <GripVertical className="w-3 h-3 text-muted-foreground" />
                        </div>
                      </div>
                    ))}
                  {elements.length === 0 && (
                    <div className="p-3 text-center text-xs text-muted-foreground">
                      No layers yet. Add some text to see layers here.
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="h-full bg-background">
            <Canvas 
              meshColor={meshColor} 
              backgroundColor={backgroundColor}
              canvasRatio={canvasRatio}
              showGrid={showGrid}
              elements={elements}
              setElements={setElements}
              updateElements={updateElements}
              selectedElementIds={selectedElementIds}
              selectElement={selectElement}
              activeTool={activeTool}
              setActiveTool={setActiveTool}
              backgroundImage={backgroundImage}
              backgroundImageOpacity={backgroundImageOpacity}
              backgroundImageBrightness={backgroundImageBrightness}
              backgroundImageContrast={backgroundImageContrast}
              backgroundImageBlur={backgroundImageBlur}
              backgroundImageOverlay={backgroundImageOverlay}
              backgroundImageOverlayOpacity={backgroundImageOverlayOpacity}
              isPreviewMode={isPreviewMode}
              sampleData={sampleData}
            />
          </div>
        </ResizablePanel>
        
        <ResizableHandle withHandle />
        
        <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
          <Card className="h-full rounded-none border-l border-t-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg font-semibold">Properties Panel</CardTitle>
            </CardHeader>
            <Separator />
            <CardContent className="p-4">
              {selectedElement ? (
                <div className="space-y-4">
                  {selectedElement.type === 'text' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Text Content</Label>
                        <input
                          type="text"
                          value={selectedElement.text}
                          onChange={(e) => {
                            const newElements = elements.map(el => 
                              el.id === selectedElement.id 
                                ? { ...el, text: e.target.value }
                                : el
                            );
                            setElements(newElements);
                            // Debounce history saves for text input
                            clearTimeout(window.textInputTimeout);
                            window.textInputTimeout = setTimeout(() => {
                              saveToHistory('edit_text', newElements);
                            }, 1000);
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Font Size</Label>
                        <input
                          type="number"
                          value={getFontSizeInputValue(selectedElement.id, 'fontSize', selectedElement.fontSize)}
                          onChange={(e) => {
                            handleFontSizeInputChange(selectedElement.id, 'fontSize', e.target.value);
                          }}
                          onBlur={(e) => {
                            handleFontSizeInputBlur(selectedElement.id, 'fontSize', e.target.value, 16, 8, 100);
                          }}
                          onKeyDown={(e) => {
                            handleFontSizeKeyDown(e, selectedElement.id, 'fontSize', e.currentTarget.value, 16, 8, 100);
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="8"
                          max="100"
                          placeholder="16"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Font Family</Label>
                        <select
                          value={selectedElement.fontFamily}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { fontFamily: e.target.value }, 'change_font_family');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        >
                          <option value="Arial">Arial</option>
                          <option value="Helvetica">Helvetica</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Verdana">Verdana</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Text Color</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={selectedElement.color}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { color: e.target.value }, 'change_text_color');
                            }}
                            className="w-12 h-8 rounded border border-border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">
                            {selectedElement.color.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Background Color</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={selectedElement.backgroundColor}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { backgroundColor: e.target.value }, 'change_element_background');
                            }}
                            className="w-12 h-8 rounded border border-border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">
                            {selectedElement.backgroundColor.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Text Alignment</Label>
                        <select
                          value={selectedElement.textAlign}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { textAlign: e.target.value as 'left' | 'center' | 'right' }, 'change_text_alignment');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        >
                          <option value="left">Left Aligned</option>
                          <option value="center">Center Aligned</option>
                          <option value="right">Right Aligned</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Position</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">X</Label>
                            <input
                              type="number"
                              value={selectedElement.x}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { x: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Y</Label>
                            <input
                              type="number"
                              value={selectedElement.y}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { y: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Rotation</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { rotation: parseInt(e.target.value) }, 'rotate_element');
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(360, parseInt(e.target.value) || 0));
                              updateElementProperty(selectedElement.id, { rotation: value }, 'rotate_element');
                            }}
                            className="w-16 p-1 text-sm border border-border rounded-md bg-background"
                          />
                          <span className="text-xs text-muted-foreground">°</span>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedElement.type === 'label' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">JSON Key</Label>
                        <input
                          type="text"
                          value={selectedElement.jsonKey}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { jsonKey: e.target.value }, 'change_json_key');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          placeholder="e.g., name, course, date"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Placeholder Text</Label>
                        <input
                          type="text"
                          value={selectedElement.placeholder}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { placeholder: e.target.value }, 'change_placeholder');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          placeholder="Fallback text when no data"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Font Size (Max)</Label>
                        <input
                          type="number"
                          value={getFontSizeInputValue(selectedElement.id, 'fontSize', selectedElement.fontSize)}
                          onChange={(e) => {
                            handleFontSizeInputChange(selectedElement.id, 'fontSize', e.target.value);
                          }}
                          onBlur={(e) => {
                            handleFontSizeInputBlur(selectedElement.id, 'fontSize', e.target.value, 50, 8, 100);
                          }}
                          onKeyDown={(e) => {
                            handleFontSizeKeyDown(e, selectedElement.id, 'fontSize', e.currentTarget.value, 50, 8, 100);
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="8"
                          max="100"
                          placeholder="50"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Font Family</Label>
                        <select
                          value={selectedElement.fontFamily}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { fontFamily: e.target.value }, 'change_font_family');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        >
                          <option value="Arial">Arial</option>
                          <option value="Helvetica">Helvetica</option>
                          <option value="Times New Roman">Times New Roman</option>
                          <option value="Georgia">Georgia</option>
                          <option value="Verdana">Verdana</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Text Color</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={selectedElement.color}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { color: e.target.value }, 'change_text_color');
                            }}
                            className="w-12 h-8 rounded border border-border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">
                            {selectedElement.color.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Background Color</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="color"
                            value={selectedElement.backgroundColor}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { backgroundColor: e.target.value }, 'change_element_background');
                            }}
                            className="w-12 h-8 rounded border border-border cursor-pointer"
                          />
                          <span className="text-xs text-muted-foreground font-mono">
                            {selectedElement.backgroundColor.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Text Alignment</Label>
                        <select
                          value={selectedElement.textAlign}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { textAlign: e.target.value as 'left' | 'center' | 'right' }, 'change_text_alignment');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        >
                          <option value="left">Left Aligned</option>
                          <option value="center">Center Aligned</option>
                          <option value="right">Right Aligned</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Vertical Alignment</Label>
                        <select
                          value={selectedElement.verticalAlign ?? 'center'}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { verticalAlign: e.target.value as 'top' | 'center' | 'bottom' }, 'change_vertical_alignment');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                        >
                          <option value="top">Top Stick</option>
                          <option value="center">Center Stick</option>
                          <option value="bottom">Bottom Stick</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Min Font Size</Label>
                        <input
                          type="number"
                          value={getFontSizeInputValue(selectedElement.id, 'minFontSize', selectedElement.minFontSize ?? 8)}
                          onChange={(e) => {
                            handleFontSizeInputChange(selectedElement.id, 'minFontSize', e.target.value);
                          }}
                          onBlur={(e) => {
                            const maxFontSize = selectedElement.fontSize || 50;
                            handleFontSizeInputBlur(selectedElement.id, 'minFontSize', e.target.value, 8, 4, Math.max(4, maxFontSize - 1));
                          }}
                          onKeyDown={(e) => {
                            const maxFontSize = selectedElement.fontSize || 50;
                            handleFontSizeKeyDown(e, selectedElement.id, 'minFontSize', e.currentTarget.value, 8, 4, Math.max(4, maxFontSize - 1));
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="4"
                          max="50"
                          placeholder="8"
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          id={`autoSizeText-${selectedElement.id}`}
                          checked={selectedElement.autoSizeText ?? true}
                          onChange={(e) => {
                            updateElementProperty(selectedElement.id, { autoSizeText: e.target.checked }, 'toggle_auto_size');
                          }}
                          className="w-4 h-4 cursor-pointer"
                        />
                        <Label htmlFor={`autoSizeText-${selectedElement.id}`} className="text-sm font-medium">
                          Auto-size text to fit width
                        </Label>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Position</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">X</Label>
                            <input
                              type="number"
                              value={selectedElement.x}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { x: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Y</Label>
                            <input
                              type="number"
                              value={selectedElement.y}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { y: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Rotation</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { rotation: parseInt(e.target.value) }, 'rotate_element');
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(360, parseInt(e.target.value) || 0));
                              updateElementProperty(selectedElement.id, { rotation: value }, 'rotate_element');
                            }}
                            className="w-16 p-1 text-sm border border-border rounded-md bg-background"
                          />
                          <span className="text-xs text-muted-foreground">°</span>
                        </div>
                      </div>
                    </>
                  )}
                  {selectedElement.type === 'signature' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Signature</Label>
                        <div className="p-3 border border-border rounded-md bg-gray-50">
                          {selectedElement.svgData ? (
                            <div 
                              className="w-full h-auto max-h-32 flex items-center justify-center"
                              dangerouslySetInnerHTML={{ 
                                __html: selectedElement.svgData 
                              }}
                            />
                          ) : (
                            <img
                              src={selectedElement.imageData}
                              alt={selectedElement.name}
                              className="w-full h-auto max-h-32 object-contain"
                            />
                          )}
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Width</Label>
                        <input
                          type="number"
                          value={selectedElement.width}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 1;
                            updateElementProperty(selectedElement.id, { width: Math.max(1, value) }, 'resize_signature');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="1"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Height</Label>
                        <input
                          type="number"
                          value={selectedElement.height}
                          onChange={(e) => {
                            const value = parseInt(e.target.value) || 1;
                            updateElementProperty(selectedElement.id, { height: Math.max(1, value) }, 'resize_signature');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="1"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Signature Color</Label>
                        <input
                          type="color"
                          value={selectedElement.color}
                          onChange={(e) => {
                            updateSignatureColor(selectedElement.id, e.target.value);
                          }}
                          className="w-full h-10 border border-border rounded-md bg-background cursor-pointer"
                        />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Position</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">X</Label>
                            <input
                              type="number"
                              value={selectedElement.x}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { x: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Y</Label>
                            <input
                              type="number"
                              value={selectedElement.y}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { y: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Rotation</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { rotation: parseInt(e.target.value) }, 'rotate_element');
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(360, parseInt(e.target.value) || 0));
                              updateElementProperty(selectedElement.id, { rotation: value }, 'rotate_element');
                            }}
                            className="w-16 p-1 text-sm border border-border rounded-md bg-background"
                          />
                          <span className="text-xs text-muted-foreground">°</span>
                        </div>
                      </div>
                    </>
                  )}

                  {selectedElement.type === 'media' && (
                    <>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Media</Label>
                        <div className="p-2 border border-border rounded-md bg-gray-50 h-24 flex items-center justify-center overflow-hidden">
                          {selectedElement.mediaType === 'svg' ? (
                            <div
                              className="w-full h-full flex items-center justify-center"
                              style={{ maxWidth: '100%', maxHeight: '100%' }}
                              dangerouslySetInnerHTML={{ __html: selectedElement.data }}
                            />
                          ) : (
                            <img
                              src={selectedElement.data}
                              alt={selectedElement.fileName}
                              className="max-w-full max-h-full object-contain"
                            />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          <div className="truncate">{selectedElement.fileName}</div>
                          <div className="capitalize">{selectedElement.mediaType}</div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Width</Label>
                        <input
                          type="number"
                          value={selectedElement.width}
                          onChange={(e) => {
                            const value = Math.max(1, parseInt(e.target.value) || 1);
                            updateElementProperty(selectedElement.id, { width: value }, 'resize_media');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="1"
                        />
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Height</Label>
                        <input
                          type="number"
                          value={selectedElement.height}
                          onChange={(e) => {
                            const value = Math.max(1, parseInt(e.target.value) || 1);
                            updateElementProperty(selectedElement.id, { height: value }, 'resize_media');
                          }}
                          className="w-full p-2 text-sm border border-border rounded-md bg-background"
                          min="1"
                        />
                      </div>

                      {selectedElement.mediaType === 'svg' && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Stroke Color</Label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={selectedElement.strokeColor || '#000000'}
                                onChange={(e) => {
                                  updateElementProperty(selectedElement.id, { strokeColor: e.target.value }, 'change_svg_stroke');
                                }}
                                className="flex-1 h-10 border border-border rounded-md bg-background cursor-pointer"
                                disabled={selectedElement.strokeColor === 'none'}
                              />
                              <Button
                                variant={selectedElement.strokeColor === 'none' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  const newValue = selectedElement.strokeColor === 'none' ? '#000000' : 'none';
                                  updateElementProperty(selectedElement.id, { strokeColor: newValue }, 'change_svg_stroke');
                                }}
                                className="px-3"
                              >
                                None
                              </Button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Fill Color</Label>
                            <div className="flex gap-2">
                              <input
                                type="color"
                                value={selectedElement.fillColor || '#000000'}
                                onChange={(e) => {
                                  updateElementProperty(selectedElement.id, { fillColor: e.target.value }, 'change_svg_fill');
                                }}
                                className="flex-1 h-10 border border-border rounded-md bg-background cursor-pointer"
                                disabled={selectedElement.fillColor === 'none'}
                              />
                              <Button
                                variant={selectedElement.fillColor === 'none' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => {
                                  const newValue = selectedElement.fillColor === 'none' ? '#000000' : 'none';
                                  updateElementProperty(selectedElement.id, { fillColor: newValue }, 'change_svg_fill');
                                }}
                                className="px-3"
                              >
                                None
                              </Button>
                            </div>
                          </div>
                        </>
                      )}

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Position</Label>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs text-muted-foreground">X</Label>
                            <input
                              type="number"
                              value={selectedElement.x}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { x: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                          <div>
                            <Label className="text-xs text-muted-foreground">Y</Label>
                            <input
                              type="number"
                              value={selectedElement.y}
                              onChange={(e) => {
                                const value = parseInt(e.target.value);
                                if (!isNaN(value)) {
                                  updateElementProperty(selectedElement.id, { y: value }, 'move_element');
                                }
                              }}
                              className="w-full p-2 text-sm border border-border rounded-md bg-background"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Rotation</Label>
                        <div className="flex items-center space-x-2">
                          <input
                            type="range"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              updateElementProperty(selectedElement.id, { rotation: parseInt(e.target.value) }, 'rotate_element');
                            }}
                            className="flex-1"
                          />
                          <input
                            type="number"
                            min="0"
                            max="360"
                            value={selectedElement.rotation || 0}
                            onChange={(e) => {
                              const value = Math.max(0, Math.min(360, parseInt(e.target.value) || 0));
                              updateElementProperty(selectedElement.id, { rotation: value }, 'rotate_element');
                            }}
                            className="w-16 p-1 text-sm border border-border rounded-md bg-background"
                          />
                          <span className="text-xs text-muted-foreground">°</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Select an element to see formatting options
                </p>
              )}
            </CardContent>
          </Card>
        </ResizablePanel>
      </ResizablePanelGroup>
      
      {/* Signature Modal */}
      <SignatureModal
        isOpen={isSignatureModalOpen}
        onClose={() => {
          setIsSignatureModalOpen(false);
          setActiveTool('cursor');
        }}
        onConfirm={handleSignatureConfirm}
      />

      <MediaModal
        isOpen={isMediaModalOpen}
        onClose={() => {
          setIsMediaModalOpen(false);
          setActiveTool('cursor');
        }}
        onConfirm={handleMediaConfirm}
      />
    </div>
  );
}
