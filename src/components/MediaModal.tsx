"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Upload, X, Check, Trash2, Palette, Image, FileImage } from "lucide-react";

interface MediaItem {
  id: string;
  fileName: string;
  mediaType: 'image' | 'svg';
  data: string;
  originalData: string;
  strokeColor?: string;
  fillColor?: string;
  thumbnail: string;
}

interface MediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mediaItem: MediaItem) => void;
}

export default function MediaModal({ isOpen, onClose, onConfirm }: MediaModalProps) {
  const [mediaLibrary, setMediaLibrary] = useState<MediaItem[]>([]);
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [activeTab, setActiveTab] = useState<'gallery' | 'upload'>('gallery');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load media library from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('canvasMediaLibrary');
    if (saved) {
      try {
        setMediaLibrary(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load media library:', error);
      }
    }
  }, []);

  // Save media library to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('canvasMediaLibrary', JSON.stringify(mediaLibrary));
  }, [mediaLibrary]);

  // Generate thumbnail for media item
  const generateThumbnail = useCallback((data: string, mediaType: 'image' | 'svg'): Promise<string> => {
    return new Promise((resolve) => {
      if (mediaType === 'image') {
        resolve(data); // For images, use the data directly as thumbnail
      } else {
        // For SVG, create a data URL
        const svgBlob = new Blob([data], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        resolve(`data:image/svg+xml;base64,${btoa(data)}`);
      }
    });
  }, []);

  // Handle file upload
  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    setIsUploading(true);

    try {
      const newMediaItems: MediaItem[] = [];

      for (const file of files) {
        // Validate file type
        const isImage = file.type.startsWith('image/');
        const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
        
        if (!isImage && !isSvg) {
          alert(`Unsupported file type: ${file.name}`);
          continue;
        }

        const mediaType: 'image' | 'svg' = isSvg ? 'svg' : 'image';
        
        // Read file content
        const content = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          
          if (mediaType === 'svg') {
            reader.readAsText(file);
          } else {
            reader.readAsDataURL(file);
          }
        });

        // Generate thumbnail
        const thumbnail = await generateThumbnail(content, mediaType);

        // Create media item
        const mediaItem: MediaItem = {
          id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
          fileName: file.name,
          mediaType,
          data: content,
          originalData: content,
          thumbnail,
          strokeColor: mediaType === 'svg' ? '#000000' : undefined,
          fillColor: mediaType === 'svg' ? '#000000' : undefined,
        };

        newMediaItems.push(mediaItem);
      }

      setMediaLibrary(prev => [...prev, ...newMediaItems]);
      
      if (newMediaItems.length === 1) {
        setSelectedMedia(newMediaItems[0]);
      }

      setActiveTab('gallery');
    } catch (error) {
      console.error('Failed to upload media:', error);
      alert('Failed to upload media files');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [generateThumbnail]);

  // Update SVG colors
  const updateSvgColors = useCallback((mediaItem: MediaItem, strokeColor?: string, fillColor?: string) => {
    if (mediaItem.mediaType !== 'svg') return mediaItem;

    let svgContent = mediaItem.originalData;
    
    // Simple SVG color replacement - this is a basic implementation
    if (strokeColor !== undefined) {
      // Replace stroke attributes
      svgContent = svgContent.replace(/stroke="[^"]*"/g, `stroke="${strokeColor}"`);
      svgContent = svgContent.replace(/stroke:[^;"]*/g, `stroke:${strokeColor}`);
    }
    
    if (fillColor !== undefined) {
      // Replace fill attributes
      svgContent = svgContent.replace(/fill="[^"]*"/g, `fill="${fillColor}"`);
      svgContent = svgContent.replace(/fill:[^;"]*/g, `fill:${fillColor}`);
    }

    return {
      ...mediaItem,
      data: svgContent,
      strokeColor,
      fillColor,
    };
  }, []);

  // Handle color change
  const handleColorChange = useCallback((type: 'stroke' | 'fill', color: string) => {
    if (!selectedMedia || selectedMedia.mediaType !== 'svg') return;

    const updatedMedia = updateSvgColors(
      selectedMedia,
      type === 'stroke' ? color : selectedMedia.strokeColor,
      type === 'fill' ? color : selectedMedia.fillColor
    );

    setSelectedMedia(updatedMedia);
  }, [selectedMedia, updateSvgColors]);

  // Delete media item
  const handleDelete = useCallback((mediaId: string) => {
    setMediaLibrary(prev => prev.filter(item => item.id !== mediaId));
    if (selectedMedia?.id === mediaId) {
      setSelectedMedia(null);
    }
  }, [selectedMedia]);

  // Handle confirm
  const handleConfirm = useCallback(() => {
    if (selectedMedia) {
      onConfirm(selectedMedia);
      onClose();
    }
  }, [selectedMedia, onConfirm, onClose]);

  // Reset modal state
  const resetModal = useCallback(() => {
    setSelectedMedia(null);
    setActiveTab('gallery');
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    resetModal();
    onClose();
  }, [resetModal, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999]">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Media Library</CardTitle>
          <Button variant="ghost" size="sm" onClick={handleClose}>
            <X className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex h-[70vh]">
            {/* Left Panel - Gallery/Upload */}
            <div className="flex-1 border-r border-border">
              {/* Tabs */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => setActiveTab('gallery')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'gallery'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Gallery ({mediaLibrary.length})
                </button>
                <button
                  onClick={() => setActiveTab('upload')}
                  className={`px-4 py-2 text-sm font-medium ${
                    activeTab === 'upload'
                      ? 'border-b-2 border-primary text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Upload
                </button>
              </div>

              {/* Content */}
              <div className="p-4 h-[calc(100%-48px)] overflow-y-auto">
                {activeTab === 'gallery' ? (
                  <div className="space-y-4">
                    {mediaLibrary.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <FileImage className="w-12 h-12 mx-auto mb-4 opacity-50" />
                        <p>No media files yet</p>
                        <p className="text-sm">Upload some images or SVGs to get started</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {mediaLibrary.map((item) => (
                          <div
                            key={item.id}
                            className={`relative group cursor-pointer rounded-lg border-2 overflow-hidden aspect-square ${
                              selectedMedia?.id === item.id
                                ? 'border-primary ring-2 ring-primary/20'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => setSelectedMedia(item)}
                          >
                            {/* Thumbnail */}
                            <div className="w-full h-full bg-gray-50 flex items-center justify-center">
                              {item.mediaType === 'svg' ? (
                                <div
                                  className="w-full h-full flex items-center justify-center p-2"
                                  dangerouslySetInnerHTML={{ __html: item.data }}
                                />
                              ) : (
                                <img
                                  src={item.thumbnail}
                                  alt={item.fileName}
                                  className="w-full h-full object-cover"
                                />
                              )}
                            </div>

                            {/* File type indicator */}
                            <div className="absolute top-2 left-2">
                              {item.mediaType === 'svg' ? (
                                <div className="bg-green-500 text-white text-xs px-1.5 py-0.5 rounded">
                                  SVG
                                </div>
                              ) : (
                                <div className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded">
                                  IMG
                                </div>
                              )}
                            </div>

                            {/* Delete button */}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(item.id);
                              }}
                              className="absolute top-2 right-2 bg-red-500 hover:bg-red-600 text-white p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>

                            {/* File name */}
                            <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs p-1 truncate">
                              {item.fileName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-4">
                    <Label>Upload Media Files</Label>
                    <div className="border-2 border-dashed border-border rounded-lg p-8 text-center">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*,.svg"
                        multiple
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Upload className="w-12 h-12 mx-auto text-muted-foreground" />
                          <p className="text-lg font-medium">Drop files here or click to browse</p>
                          <p className="text-sm text-muted-foreground">
                            Supports: PNG, JPG, GIF, SVG and other image formats
                          </p>
                        </div>
                        <Button 
                          variant="outline" 
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                        >
                          {isUploading ? 'Uploading...' : 'Choose Files'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right Panel - Preview & Edit */}
            <div className="w-80 flex flex-col">
              {selectedMedia ? (
                <>
                  {/* Preview */}
                  <div className="p-4 border-b border-border">
                    <Label className="text-sm font-medium">Preview</Label>
                    <div className="mt-2 border rounded-lg p-2 bg-gray-50 h-32 flex items-center justify-center overflow-hidden">
                      {selectedMedia.mediaType === 'svg' ? (
                        <div
                          className="w-full h-full flex items-center justify-center"
                          style={{ maxWidth: '100%', maxHeight: '100%' }}
                          dangerouslySetInnerHTML={{ __html: selectedMedia.data }}
                        />
                      ) : (
                        <img
                          src={selectedMedia.thumbnail}
                          alt={selectedMedia.fileName}
                          className="max-w-full max-h-full object-contain"
                        />
                      )}
                    </div>
                    <div className="mt-2 text-xs text-muted-foreground">
                      <div className="truncate">{selectedMedia.fileName}</div>
                      <div className="capitalize">{selectedMedia.mediaType}</div>
                    </div>
                  </div>

                  {/* SVG Color Controls */}
                  {selectedMedia.mediaType === 'svg' && (
                    <div className="p-4 border-b border-border space-y-4">
                      <Label className="text-sm font-medium flex items-center gap-2">
                        <Palette className="w-4 h-4" />
                        SVG Colors
                      </Label>
                      
                      <div className="space-y-3">
                        <div>
                          <Label className="text-xs">Stroke Color</Label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={selectedMedia.strokeColor || '#000000'}
                              onChange={(e) => handleColorChange('stroke', e.target.value)}
                              className="flex-1 h-8 border border-border rounded cursor-pointer"
                              disabled={selectedMedia.strokeColor === 'none'}
                            />
                            <Button
                              variant={selectedMedia.strokeColor === 'none' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const newValue = selectedMedia.strokeColor === 'none' ? '#000000' : 'none';
                                handleColorChange('stroke', newValue);
                              }}
                              className="px-2 text-xs"
                            >
                              None
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <Label className="text-xs">Fill Color</Label>
                          <div className="flex gap-2">
                            <input
                              type="color"
                              value={selectedMedia.fillColor || '#000000'}
                              onChange={(e) => handleColorChange('fill', e.target.value)}
                              className="flex-1 h-8 border border-border rounded cursor-pointer"
                              disabled={selectedMedia.fillColor === 'none'}
                            />
                            <Button
                              variant={selectedMedia.fillColor === 'none' ? 'default' : 'outline'}
                              size="sm"
                              onClick={() => {
                                const newValue = selectedMedia.fillColor === 'none' ? '#000000' : 'none';
                                handleColorChange('fill', newValue);
                              }}
                              className="px-2 text-xs"
                            >
                              None
                            </Button>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-xs text-muted-foreground">
                        Note: Color changes may not apply to all SVG elements depending on their structure.
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="p-4 mt-auto">
                    <Button 
                      onClick={handleConfirm} 
                      className="w-full"
                      disabled={!selectedMedia}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Use Media
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-center p-4">
                  <div className="text-muted-foreground">
                    <Image className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Select a media file to preview</p>
                    <p className="text-sm">Choose from gallery or upload new files</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}