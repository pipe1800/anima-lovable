
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Slider } from '@/components/ui/slider';
import { RotateCw, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageCropperProps {
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  onCrop: (croppedImageUrl: string) => void;
  aspectRatio?: number;
}

export const ImageCropper = ({ 
  imageUrl, 
  isOpen, 
  onClose, 
  onCrop, 
  aspectRatio = 1 
}: ImageCropperProps) => {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [minZoom, setMinZoom] = useState(1);
  const [imageNaturalSize, setImageNaturalSize] = useState({ width: 0, height: 0 });
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const CROP_SIZE = 200; // Fixed crop circle size
  const CONTAINER_SIZE = 400; // Fixed container size

  const handleImageLoad = useCallback(() => {
    const image = imageRef.current;
    if (!image) return;

    const naturalWidth = image.naturalWidth;
    const naturalHeight = image.naturalHeight;
    
    setImageNaturalSize({ width: naturalWidth, height: naturalHeight });
    
    // Calculate minimum zoom so image always covers the crop circle
    const scaleX = CROP_SIZE / naturalWidth;
    const scaleY = CROP_SIZE / naturalHeight;
    const calculatedMinZoom = Math.max(scaleX, scaleY);
    
    setMinZoom(calculatedMinZoom);
    setZoom(calculatedMinZoom);
    setPosition({ x: 0, y: 0 });
    setRotation(0);
    setImageLoaded(true);
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ 
      x: e.clientX - position.x, 
      y: e.clientY - position.y 
    });
  }, [position]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    setPosition({ x: newX, y: newY });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleCrop = useCallback(async () => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !imageLoaded) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to crop size
    canvas.width = CROP_SIZE;
    canvas.height = CROP_SIZE;

    // Clear canvas
    ctx.clearRect(0, 0, CROP_SIZE, CROP_SIZE);

    // Create circular clipping path
    ctx.save();
    ctx.beginPath();
    ctx.arc(CROP_SIZE / 2, CROP_SIZE / 2, CROP_SIZE / 2, 0, Math.PI * 2);
    ctx.clip();

    // Calculate the source area from the natural image
    const centerX = imageNaturalSize.width / 2;
    const centerY = imageNaturalSize.height / 2;
    
    // The crop area size in natural image coordinates
    const cropAreaSize = CROP_SIZE / zoom;
    
    // Account for position offset (convert screen pixels to natural image pixels)
    const offsetX = -position.x / zoom;
    const offsetY = -position.y / zoom;
    
    // Source rectangle in natural image coordinates
    const sourceX = centerX - cropAreaSize / 2 + offsetX;
    const sourceY = centerY - cropAreaSize / 2 + offsetY;

    // Apply transformations
    ctx.translate(CROP_SIZE / 2, CROP_SIZE / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-CROP_SIZE / 2, -CROP_SIZE / 2);

    // Draw the image
    ctx.drawImage(
      image,
      sourceX, sourceY, cropAreaSize, cropAreaSize,
      0, 0, CROP_SIZE, CROP_SIZE
    );

    ctx.restore();

    const croppedImageUrl = canvas.toDataURL('image/jpeg', 0.9);
    onCrop(croppedImageUrl);
  }, [imageLoaded, zoom, position, rotation, imageNaturalSize, onCrop]);

  const handleClose = useCallback(() => {
    setZoom(1);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
    setImageLoaded(false);
    setMinZoom(1);
    setImageNaturalSize({ width: 0, height: 0 });
    onClose();
  }, [onClose]);

  const handleReset = useCallback(() => {
    setZoom(minZoom);
    setRotation(0);
    setPosition({ x: 0, y: 0 });
  }, [minZoom]);

  const getImageStyle = useCallback(() => {
    return {
      transform: `translate(${position.x}px, ${position.y}px) scale(${zoom}) rotate(${rotation}deg)`,
      transformOrigin: 'center center',
      maxWidth: 'none',
      maxHeight: 'none',
      userSelect: 'none' as const,
      pointerEvents: 'none' as const
    };
  }, [position, zoom, rotation]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="bg-[#1a1a2e] border-gray-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-white">Crop Avatar Image</DialogTitle>
          <DialogDescription className="text-gray-400">
            Adjust the image position, zoom, and rotation to create your perfect avatar.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Preview Area */}
          <div 
            ref={containerRef}
            className="relative bg-gray-800 rounded-lg overflow-hidden mx-auto"
            style={{ 
              width: `${CONTAINER_SIZE}px`, 
              height: `${CONTAINER_SIZE}px` 
            }}
          >
            <div 
              className="absolute inset-0 flex items-center justify-center cursor-move select-none"
              onMouseDown={handleMouseDown}
              style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            >
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Crop preview"
                className="block"
                style={getImageStyle()}
                onLoad={handleImageLoad}
                draggable={false}
              />
            </div>
            
            {/* Crop overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Dark overlay */}
              <div className="absolute inset-0 bg-black/50"></div>
              {/* Crop circle */}
              <div 
                className="absolute bg-transparent border-2 border-[#FF7A00] rounded-full"
                style={{
                  width: `${CROP_SIZE}px`,
                  height: `${CROP_SIZE}px`,
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)'
                }}
              ></div>
            </div>
          </div>

          {/* Controls */}
          {imageLoaded && (
            <div className="space-y-4">
              {/* Zoom Control */}
              <div className="flex items-center space-x-4">
                <ZoomOut className="w-4 h-4 text-gray-400" />
                <Slider
                  value={[zoom]}
                  onValueChange={(value) => setZoom(value[0])}
                  min={minZoom}
                  max={3}
                  step={0.05}
                  className="flex-1"
                />
                <ZoomIn className="w-4 h-4 text-gray-400" />
              </div>
              
              {/* Rotation Control */}
              <div className="flex items-center space-x-4">
                <RotateCw className="w-4 h-4 text-gray-400" />
                <Slider
                  value={[rotation]}
                  onValueChange={(value) => setRotation(value[0])}
                  min={-180}
                  max={180}
                  step={15}
                  className="flex-1"
                />
              </div>

              {/* Reset Button */}
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  className="border-gray-600 text-gray-300"
                >
                  Reset
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} className="border-gray-600 text-gray-300">
            Cancel
          </Button>
          <Button 
            onClick={handleCrop} 
            className="bg-[#FF7A00] hover:bg-[#FF7A00]/80"
            disabled={!imageLoaded}
          >
            Apply Crop
          </Button>
        </DialogFooter>

        <canvas ref={canvasRef} className="hidden" />
      </DialogContent>
    </Dialog>
  );
};
