import { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileVideo, Image, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { SUPPORTED_FORMATS } from '@/lib/types';

interface FileDropzoneProps {
  onFileSelect: (file: File) => void;
  disabled?: boolean;
}

export function FileDropzone({ onFileSelect, disabled }: FileDropzoneProps) {
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    [onFileSelect]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: SUPPORTED_FORMATS,
    maxFiles: 1,
    disabled,
  });

  const hasRejections = fileRejections.length > 0;

  return (
    <div className="w-full">
      <Card
        {...getRootProps()}
        className={`
          relative overflow-hidden border-2 border-dashed transition-all duration-smooth cursor-pointer
          ${isDragActive 
            ? 'border-brand bg-brand/5 shadow-brand' 
            : hasRejections
            ? 'border-error bg-error/5'
            : 'border-border hover:border-brand/50 hover:bg-surface-hover'
          }
          ${disabled ? 'cursor-not-allowed opacity-50' : ''}
        `}
      >
        <input {...getInputProps()} />
        
        <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
          <div className={`
            w-16 h-16 rounded-full flex items-center justify-center mb-6 transition-colors
            ${isDragActive 
              ? 'bg-brand text-brand-foreground' 
              : hasRejections
              ? 'bg-error text-error-foreground'
              : 'bg-surface text-muted-foreground'
            }
          `}>
            {hasRejections ? (
              <AlertCircle size={32} />
            ) : isDragActive ? (
              <Upload size={32} />
            ) : (
              <FileVideo size={32} />
            )}
          </div>

          <h3 className="text-title mb-2">
            {isDragActive 
              ? 'Drop your file here' 
              : hasRejections
              ? 'Unsupported file type'
              : 'Upload your animation'}
          </h3>
          
          <p className="text-body text-muted-foreground mb-6 max-w-md">
            {hasRejections ? (
              'Please select an MP4, WebM, GIF, or APNG file.'
            ) : (
              'Drop your MP4, WebM, GIF, or APNG here or click to browse files.'
            )}
          </p>

          <div className="flex items-center gap-4 text-caption text-muted-foreground">
            <div className="flex items-center gap-1">
              <FileVideo size={16} />
              <span>MP4, WebM</span>
            </div>
            <div className="flex items-center gap-1">
              <Image size={16} />
              <span>GIF, APNG</span>
            </div>
          </div>
        </div>

        {/* Visual emphasis border */}
        <div className={`
          absolute inset-0 rounded-lg transition-opacity duration-smooth pointer-events-none
          ${isDragActive ? 'opacity-100' : 'opacity-0'}
          bg-gradient-to-br from-brand/10 via-transparent to-brand/10
        `} />
      </Card>

      {hasRejections && (
        <div className="mt-4 p-3 rounded-lg bg-error/10 border border-error/20">
          <p className="text-sm text-error">
            {fileRejections[0]?.errors[0]?.message || 'File type not supported'}
          </p>
        </div>
      )}
    </div>
  );
}