"use client";

import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Upload, X, Check, RotateCcw } from "lucide-react";

interface SignatureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (imageData: string, svgData: string, color: string) => void;
}

export default function SignatureModal({ isOpen, onClose, onConfirm }: SignatureModalProps) {
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [processedImage, setProcessedImage] = useState<string | null>(null);
  const [svgData, setSvgData] = useState<string | null>(null);
  const [threshold, setThreshold] = useState([255]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStep, setProcessingStep] = useState<string>('');
  const [signatureColor, setSignatureColor] = useState('#000000'); // Color picker
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Simple signature processing with smoothness toggle
  const vectorizeSignature = useCallback((imageData: string, thresholdValue: number) => {
    return new Promise<{imageData: string, svgData: string}>((resolve, reject) => {
      // Set processing timeout to prevent infinite hangs
      const processingTimeout = setTimeout(() => {
        console.error('Processing timed out after 10 seconds');
        setProcessingStep('Processing timed out - try a lower sensitivity');
        setIsProcessing(false);
        reject(new Error('Processing timeout'));
      }, 10000); // 10 second timeout

      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            clearTimeout(processingTimeout);
            return resolve({imageData, svgData: ''});
          }

          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw original image
          ctx.drawImage(img, 0, 0);
          
          // Get image data for processing
          const width = canvas.width;
          const height = canvas.height;
          
          console.log('Processing signature:', width, 'x', height, 'threshold:', thresholdValue);
          
          // Simple processing approach
          setProcessingStep('Removing background...');
          
          // Apply background removal
          const canvasImageData = ctx.getImageData(0, 0, width, height);
          const data = canvasImageData.data;
          
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            const grayscale = 0.299 * r + 0.587 * g + 0.114 * b;
            
            if (grayscale > thresholdValue - 55) {
              data[i + 3] = 0; // Make transparent
            } else {
              data[i + 3] = 255; // Keep signature pixels
              // Make signature pixels black (will be colored by SVG)
              if (grayscale < 128) {
                data[i] = 0;     // Black
                data[i + 1] = 0; // Black
                data[i + 2] = 0; // Black
              }
            }
          }
          
          ctx.putImageData(canvasImageData, 0, 0);
          
          // Create SVG that embeds the actual processed image with color filter
          setProcessingStep('Creating signature...');
          
          // Calculate color values for the SVG filter
          const r = parseInt(signatureColor.substr(1, 2), 16) / 255;
          const g = parseInt(signatureColor.substr(3, 2), 16) / 255;
          const b = parseInt(signatureColor.substr(5, 2), 16) / 255;
          
          const svgContent = `<svg width="100%" height="100%" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
            <defs>
              <filter id="colorize">
                <feColorMatrix type="matrix" values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"/>
              </filter>
            </defs>
            <image href="${ctx.canvas.toDataURL('image/png')}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" filter="url(#colorize)"/>
          </svg>`;
          
          clearTimeout(processingTimeout);
          setProcessingStep('');
          resolve({
            imageData: ctx.canvas.toDataURL('image/png'),
            svgData: svgContent
          });
        } catch (error) {
          console.error('Processing error:', error);
          clearTimeout(processingTimeout);
          setProcessingStep('Processing failed - try a different image');
          setIsProcessing(false);
          reject(error);
        }
      };
      img.src = imageData;
    });
  }, []);


  // Debounced processing for smooth slider interaction with error handling
  const processWithDebounce = useCallback((thresholdValue: number) => {
    // Clear any existing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    // Set new timeout for debounced processing
    processingTimeoutRef.current = setTimeout(() => {
      if (originalImage) {
        setIsProcessing(true);
        vectorizeSignature(originalImage, thresholdValue)
          .then((processed) => {
            setProcessedImage(processed.imageData);
            setSvgData(processed.svgData);
            setIsProcessing(false);
          })
          .catch((error) => {
            console.error('Vectorization failed:', error);
            setIsProcessing(false);
            setProcessingStep('Processing failed - try adjusting the sensitivity');
            
            // Reset after 3 seconds
            setTimeout(() => {
              setProcessingStep('');
            }, 3000);
          });
      }
    }, 300); // 300ms debounce delay
  }, [originalImage, vectorizeSignature]);

  // Handle file upload
  const handleFileUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      setOriginalImage(result);
      
      // Process immediately after upload (no debounce delay)
      setIsProcessing(true);
      vectorizeSignature(result, threshold[0])
        .then((processed) => {
          setProcessedImage(processed.imageData);
          setSvgData(processed.svgData);
          setIsProcessing(false);
        })
        .catch((error) => {
          console.error('Vectorization failed:', error);
          setIsProcessing(false);
          setProcessingStep('Processing failed - try adjusting the sensitivity');
          
          // Reset after 3 seconds
          setTimeout(() => {
            setProcessingStep('');
          }, 3000);
        });
    };
    reader.readAsDataURL(file);
  }, [threshold, vectorizeSignature]);

  // Handle threshold change (only update slider value, don't process)
  const handleThresholdChange = useCallback((value: number[]) => {
    setThreshold(value);
    // Don't process immediately - wait for user to stop dragging
  }, []);

  // NEW: Handle slider release (process when user stops dragging)
  const handleSliderRelease = useCallback(() => {
    processWithDebounce(threshold[0]);
  }, [threshold, processWithDebounce]);

  // Reset modal state
  const resetModal = useCallback(() => {
    setOriginalImage(null);
    setProcessedImage(null);
    setSvgData(null);
    setThreshold([255]);
    setSignatureColor('#000000');
    setIsProcessing(false);
    setProcessingStep('');
    
    // Clear any pending processing
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (processedImage && svgData) {
      onConfirm(processedImage, svgData, signatureColor);
      resetModal();
      onClose();
    }
  }, [processedImage, svgData, signatureColor, onConfirm, resetModal, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Upload Signature</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Upload Section */}
          <div className="space-y-4">
            <Label>Upload your signature image</Label>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                className="mx-auto"
              >
                <Upload className="w-4 h-4 mr-2" />
                Choose Image
              </Button>
              <p className="text-sm text-muted-foreground mt-2">
                Upload a photo of your signature on paper
              </p>
            </div>
          </div>

          {/* Processing Section */}
          {originalImage && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Original Image */}
                <div className="space-y-2">
                  <Label>Original</Label>
                  <div className="border rounded-lg p-4 bg-gray-50">
                    <img 
                      src={originalImage} 
                      alt="Original signature" 
                      className="w-full h-auto max-h-48 object-contain"
                    />
                  </div>
                </div>

                {/* Processed Image */}
                <div className="space-y-2">
                  <Label>Background Removed</Label>
                  <div className="border rounded-lg p-4 bg-transparent bg-[linear-gradient(45deg,#f0f0f0_25%,transparent_25%),linear-gradient(-45deg,#f0f0f0_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f0f0f0_75%),linear-gradient(-45deg,transparent_75%,#f0f0f0_75%)] bg-[length:10px_10px] bg-[0_0,0_5px,5px_-5px,-5px_0px]">
                    {isProcessing ? (
                      <div className="w-full h-48 flex flex-col items-center justify-center space-y-3">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                        {processingStep && (
                          <p className="text-sm text-muted-foreground text-center">
                            {processingStep}
                          </p>
                        )}
                      </div>
                    ) : svgData ? (
                      <div 
                        className="w-full h-auto max-h-48 flex items-center justify-center"
                        dangerouslySetInnerHTML={{ 
                          __html: svgData 
                        }}
                      />
                    ) : processedImage ? (
                      <img 
                        src={processedImage} 
                        alt="Processed signature" 
                        className="w-full h-auto max-h-48 object-contain"
                      />
                    ) : null}
                  </div>
                </div>
              </div>

              {/* Signature Color */}
              <div className="space-y-3">
                <Label>Signature Color</Label>
                <input
                  type="color"
                  value={signatureColor}
                  onChange={(e) => {
                    setSignatureColor(e.target.value);
                    // Update the SVG color immediately without reprocessing
                    if (svgData) {
                      const r = parseInt(e.target.value.substr(1, 2), 16) / 255;
                      const g = parseInt(e.target.value.substr(3, 2), 16) / 255;
                      const b = parseInt(e.target.value.substr(5, 2), 16) / 255;
                      
                      const updatedSvgData = svgData.replace(
                        /values="[^"]*"/,
                        `values="0 0 0 0 ${r} 0 0 0 0 ${g} 0 0 0 0 ${b} 0 0 0 1 0"`
                      );
                      setSvgData(updatedSvgData);
                    }
                  }}
                  className="w-full h-10 border border-border rounded-md bg-background cursor-pointer"
                  disabled={isProcessing}
                />
              </div>


              {/* Threshold Control */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Background Removal Sensitivity</Label>
                  <span className="text-sm text-muted-foreground">{threshold[0]}</span>
                </div>
                <Slider
                  value={threshold}
                  onValueChange={handleThresholdChange}
                  onPointerUp={handleSliderRelease}
                  onKeyUp={handleSliderRelease}
                  max={255}
                  min={50}
                  step={5}
                  className="w-full"
                  disabled={isProcessing}
                />
                <p className="text-xs text-muted-foreground">
                  Adjust to remove more or less background. Higher values remove more white areas.
                </p>
              </div>

              {/* Reset Button */}
              <Button variant="outline" onClick={resetModal} className="w-full">
                <RotateCcw className="w-4 h-4 mr-2" />
                Try Different Image
              </Button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={!processedImage || !svgData || isProcessing}
            >
              <Check className="w-4 h-4 mr-2" />
              Use Signature
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}