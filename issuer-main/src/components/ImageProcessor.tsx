import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { Loader2, Trash2, Download, Upload } from "lucide-react";
import imageCompression from 'browser-image-compression';
import { removeBackground } from '@imgly/background-removal';

// Progressive enhancement settings
const SETTINGS = {
  upload: {
    maxSize: 10 * 1024 * 1024,
    maxWidth: 1500,
    maxHeight: 1500,
    quality: 0.8,
    types: ['image/jpeg', 'image/png', 'image/webp'],
    compression: {
      maxSizeMB: 1,
      maxWidthOrHeight: 1500,
      useWebWorker: true,
      initialQuality: 0.8,
      preserveExif: false,
      alwaysKeepResolution: true,
      fileType: "image/png"
    }
  },
  processing: {
    model: "isnet",
    format: "image/png",
    quality: 1,
    workerCount: typeof navigator !== 'undefined' ? 
      Math.min(navigator.hardwareConcurrency || 2, 4) : 2
  }
};

interface ProcessedImage {
  original: File | null;
  originalUrl: string;
  processed: Blob | null;
  processedUrl: string | null;
  name: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

// Check if device is mobile
const isMobile = typeof window !== 'undefined' && 
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

export const ImageProcessor: React.FC = () => {
  const [image, setImage] = useState<ProcessedImage | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [timeLeft, setTimeLeft] = useState(20);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const workerRef = useRef<Worker | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (image) {
      if (image.originalUrl) {
        URL.revokeObjectURL(image.originalUrl);
      }
      if (image.processedUrl) {
        URL.revokeObjectURL(image.processedUrl);
      }
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setProgress(0);
    setTimeLeft(0);
    setIsProcessing(false);
  }, [image]);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const handleFileChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      // Validate file type
      if (!SETTINGS.upload.types.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPG, PNG or WebP image.');
      }

      // Validate file size
      if (file.size > SETTINGS.upload.maxSize) {
        throw new Error('File is too large. Please upload an image under 10MB.');
      }

      // Compress image before processing
      const options = {
        ...SETTINGS.upload.compression,
        fileType: file.type,
      };

      console.log('Compressing image...');
      const compressedFile = await imageCompression(file, options);
      console.log('Compression complete:', {
        originalSize: (file.size / 1024 / 1024).toFixed(2) + 'MB',
        compressedSize: (compressedFile.size / 1024 / 1024).toFixed(2) + 'MB'
      });

      const imageUrl = URL.createObjectURL(compressedFile);
      
      setImage({
        original: compressedFile,
        originalUrl: imageUrl,
        processed: null,
        processedUrl: null,
        name: file.name,
        status: 'pending'
      });

    } catch (error) {
      console.error('File handling error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load image",
        variant: "destructive",
      });
    }
  }, [toast]);

  const processImage = useCallback(async (file: File): Promise<Blob> => {
    let timer: NodeJS.Timeout | null = null;
    try {
      setTimeLeft(20);
      setProgress(0);
      
      timer = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            if (timer) clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      timerRef.current = timer;

      console.log('Starting background removal...');
      const result = await removeBackground(file, {
        model: SETTINGS.processing.model,
        progress: (p) => {
          const progressValue = Math.floor(p * 100);
          setProgress(progressValue);
          console.log('Processing progress:', progressValue + '%');
        },
        output: {
          format: SETTINGS.processing.format,
          quality: SETTINGS.processing.quality,
        }
      });

      console.log('Background removal complete');
      if (timer) clearInterval(timer);
      timerRef.current = null;

      return new Blob([result], { 
        type: SETTINGS.processing.format 
      });
    } catch (error) {
      console.error('Detailed processing error:', error);
      if (timer) clearInterval(timer);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      setTimeLeft(0);
      setProgress(0);
      throw error;
    }
  }, []);

  const handleProcess = useCallback(async () => {
    if (!image?.original || isProcessing) return;

    setIsProcessing(true);
    setProgress(0);
    setTimeLeft(20);

    try {
      console.log('Starting image processing...');
      const processedBlob = await processImage(image.original);
      console.log('Image processing complete');

      const processedUrl = URL.createObjectURL(processedBlob);
      console.log('Created URL for processed image');

      setImage(prev => {
        if (prev?.processedUrl) {
          URL.revokeObjectURL(prev.processedUrl);
        }
        return prev ? {
          ...prev,
          processed: processedBlob,
          processedUrl: processedUrl,
          status: 'completed'
        } : null;
      });

      toast({
        title: "Success",
        description: "Image processed successfully"
      });
    } catch (error) {
      console.error('Processing error details:', error);
      setImage(prev => prev ? { ...prev, status: 'failed' } : null);
      toast({
        title: "Processing failed",
        description: "Failed to process image. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setTimeLeft(0);
      setProgress(0);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [image, isProcessing, processImage, toast]);

  const handleDownload = useCallback(() => {
    if (!image?.processed || !image.name) return;

    try {
      const link = document.createElement('a');
      link.href = URL.createObjectURL(image.processed);
      // Always save as PNG to preserve transparency
      link.download = `processed_${image.name.replace(/\.[^/.]+$/, '')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download image",
        variant: "destructive",
      });
    }
  }, [image, toast]);

  const handleDelete = useCallback(() => {
    if (!image) return;

    try {
      // Force stop processing if in progress
      if (isProcessing) {
        setIsProcessing(false);
      }

      // Clean up URLs
      if (image.originalUrl) {
        URL.revokeObjectURL(image.originalUrl);
      }
      if (image.processedUrl) {
        URL.revokeObjectURL(image.processedUrl);
      }

      // Clear timers
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }

      // Reset all states
      setImage(null);
      setIsProcessing(false);
      setProgress(0);
      setTimeLeft(0);
      setIsDragging(false);

      // Clear file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      toast({
        title: "Success",
        description: "Image deleted successfully"
      });
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete image",
        variant: "destructive"
      });
    }
  }, [image, isProcessing, toast]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFileChange(e);
  }, [handleFileChange]);

  return (
    <Card className="w-full max-w-5xl mx-auto">
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Original Image Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Original</h2>
            <div 
              className={`relative aspect-square rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-800 flex items-center justify-center transition-colors duration-200 ${
                isDragging ? 'border-blue-500' : ''
              }`}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              {image?.originalUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={image.originalUrl}
                    alt="Original"
                    className="w-full h-full object-contain"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 w-8 h-8 rounded-full hover:bg-red-600 z-10"
                    onClick={handleDelete}
                    disabled={false} // Always allow deletion
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="sr-only">Delete image</span>
                  </Button>
                </div>
              ) : (
                <div className="text-center space-y-4">
                  <div className="flex flex-col items-center justify-center">
                    <Upload className="w-8 h-8 text-gray-400" />
                    <p className="mt-2 text-sm text-gray-500">
                      Drag and drop or click to upload
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    Choose Image
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SETTINGS.upload.types.join(',')}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Processed Image Section */}
          <div className="space-y-4">
            <h2 className="text-xl font-semibold">Processed</h2>
            <div className="relative aspect-square rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-800">
              {isProcessing ? (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-sm">
                  <div className="text-center space-y-4">
                    <div className="relative">
                      <div className="w-20 h-20 border-4 border-blue-100 rounded-full animate-pulse">
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="text-xl font-semibold text-blue-500">{progress}%</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-lg font-medium text-gray-700">Processing your image...</p>
                      <p className="text-sm text-gray-500">Time remaining: {timeLeft}s</p>
                    </div>
                  </div>
                </div>
              ) : image?.processedUrl ? (
                <div className="relative w-full h-full">
                  <img
                    src={image.processedUrl}
                    alt="Processed"
                    className="w-full h-full object-contain"
                  />
                  <Button
                    variant="default"
                    size="icon"
                    className="absolute top-2 right-2 bg-green-500 hover:bg-green-600 text-white rounded-full w-8 h-8 shadow-lg hover:scale-110 transition-all duration-200"
                    onClick={handleDownload}
                  >
                    <Download className="w-4 h-4" />
                    <span className="sr-only">Download processed image</span>
                  </Button>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center space-y-2">
                    <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto">
                      <img
                        src="/placeholder.svg"
                        alt="Upload placeholder"
                        className="w-8 h-8 opacity-50"
                      />
                    </div>
                    <p className="text-sm text-gray-500">
                      Upload an image to see the result
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Upload Section */}
          {!image?.original && (
            <div className="col-span-2 mt-6">
              <div 
                className={`relative rounded-lg border-2 border-dashed transition-all duration-200 ${
                  isDragging 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-800'
                } p-8`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <div className="text-center space-y-6">
                  <div className="flex flex-col items-center justify-center">
                    <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                      <Upload className="w-10 h-10 text-blue-500" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">Upload an Image</h3>
                    <p className="text-sm text-gray-500 max-w-sm">
                      Drag and drop your image here, or click the button below to select from your computer
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white hover:bg-gray-50 border-2 hover:border-blue-500 transition-all duration-200"
                  >
                    <Upload className="w-4 h-4 mr-2" />
                    Choose Image
                  </Button>
                  <p className="text-xs text-gray-400">
                    Supports: JPG, PNG, WebP
                  </p>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={SETTINGS.upload.types.join(',')}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-between items-center">
          <Button
            variant="outline"
            size="lg"
            onClick={handleDelete}
            className="w-full sm:w-auto px-8 py-2 text-lg font-medium border-2 hover:bg-red-50 hover:border-red-500 hover:text-red-600 transition-all duration-200"
          >
            <Trash2 className="w-5 h-5 mr-2" />
            Delete Image
          </Button>

          {!isProcessing && image?.original && (
            <Button
              size="lg"
              onClick={handleProcess}
              className="w-full sm:w-auto px-8 py-2 text-lg font-medium bg-blue-500 hover:bg-blue-600 transition-all duration-200"
              disabled={isProcessing}
            >
              <span className="mr-2">⚡</span>
              Process Image
            </Button>
          )}

          {image?.processed && !isProcessing && (
            <Button
              size="lg"
              onClick={handleDownload}
              className="w-full sm:w-auto px-8 py-2 text-lg font-medium bg-green-500 hover:bg-green-600 transition-all duration-200"
            >
              <Download className="w-5 h-5 mr-2" />
              Download Result
            </Button>
          )}

          {isProcessing && (
            <Button
              size="lg"
              disabled
              className="w-full sm:w-auto px-8 py-2 text-lg font-medium bg-blue-500"
            >
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Processing...
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};