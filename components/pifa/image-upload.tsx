'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2, Image as ImageIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ImageUploadProps {
  value: string
  onChange: (url: string) => void
  onRemove: () => void
  bucket?: string
  folder?: string
  className?: string
  label?: string
}

export function ImageUpload({
  value,
  onChange,
  onRemove,
  bucket = 'pifa-assets',
  folder = 'general',
  className,
  label = 'Subir Imagen'
}: ImageUploadProps) {
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validaciones básicas
    if (!file.type.startsWith('image/')) {
      toast.error('Por favor selecciona un archivo de imagen válido')
      return
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
      toast.error('La imagen es demasiado grande. Máximo 5MB.')
      return
    }

    setIsUploading(true)
    try {
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`
      const filePath = `${folder}/${fileName}`

      const { error: uploadError, data } = await supabase.storage
        .from(bucket)
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath)

      onChange(publicUrl)
      toast.success('Imagen subida correctamente')
    } catch (error) {
      console.error('Error uploading:', error)
      toast.error('Error al subir la imagen')
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className={cn("space-y-4 w-full", className)}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-[#6A6C6E] uppercase tracking-[0.3em] font-black ml-1">
          {label}
        </label>
        {value && (
          <button
            onClick={onRemove}
            type="button"
            className="text-[10px] text-red-500/60 hover:text-red-500 font-black uppercase tracking-widest transition-colors flex items-center gap-1"
          >
            <X className="w-3 h-3" /> Borrar
          </button>
        )}
      </div>

      <div 
        onClick={() => !isUploading && fileInputRef.current?.click()}
        className={cn(
          "relative h-40 w-full rounded-[24px] border-2 border-dashed transition-all cursor-pointer overflow-hidden flex flex-col items-center justify-center gap-3",
          value 
            ? "border-[#FF3131]/20 bg-[#FF3131]/5" 
            : "border-[#202020] bg-[#0A0A0A] hover:border-[#FF3131]/40 hover:bg-[#FF3131]/5",
          isUploading && "opacity-50 cursor-wait"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleUpload}
          accept="image/*"
          className="hidden"
          disabled={isUploading}
        />

        {value ? (
          <>
            <img 
              src={value} 
              alt="Preview" 
              className="absolute inset-0 w-full h-full object-contain p-4 filter drop-shadow-2xl" 
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center">
              <p className="text-[10px] font-black text-white uppercase tracking-widest bg-black/60 px-4 py-2 rounded-full">
                Cambiar Imagen
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-2xl bg-[#141414] border border-[#202020] group-hover:border-[#FF3131]/40 transition-colors">
              {isUploading ? (
                <Loader2 className="w-6 h-6 text-[#FF3131] animate-spin" />
              ) : (
                <Upload className="w-6 h-6 text-[#2D2D2D]" />
              )}
            </div>
            <div className="text-center">
              <p className="text-[10px] font-black text-[#6A6C6E] uppercase tracking-widest group-hover:text-white transition-colors">
                {isUploading ? 'Subiendo Recursos...' : 'Seleccionar Archivo'}
              </p>
              <p className="text-[8px] text-[#2D2D2D] font-bold uppercase tracking-widest mt-1">
                JPG, PNG o WEBP (MAX 5MB)
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
