import { useEffect, useState, useRef } from 'react'
import { Upload, File, Trash2, Download } from 'lucide-react'
import { getDocuments, uploadDocument, deleteDocument, type DocumentRecord } from '@/lib/apiAdmin'

interface DocumentUploadProps {
  entityType: 'employee' | 'leave' | 'payroll_input' | 'account'
  entityId: string
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentUpload({ entityType, entityId }: DocumentUploadProps) {
  const [docs, setDocs] = useState<DocumentRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function loadDocs() {
    if (!entityId) return
    setLoading(true)
    try {
      const data = await getDocuments(entityType, entityId)
      setDocs(data)
      setError(null)
    } catch {
      // Backend may not be ready yet — fail gracefully
      setDocs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDocs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          // Strip the data:...;base64, prefix
          const base64Data = result.split(',')[1] || result
          resolve(base64Data)
        }
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      await uploadDocument({
        entityType,
        entityId,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        data: base64,
      })
      await loadDocs()
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Upload failed'
      setError(msg)
    } finally {
      setUploading(false)
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteDocument(id)
      setDocs((prev) => prev.filter((d) => d.id !== id))
    } catch (err: unknown) {
      const msg = err && typeof err === 'object' && 'message' in err ? String((err as Error).message) : 'Delete failed'
      setError(msg)
    }
  }

  function handleDownload(doc: DocumentRecord) {
    // Open in new tab — the backend should serve the file at this URL
    const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'
    window.open(`${API_BASE}/api/documents/${doc.id}/download`, '_blank')
  }

  return (
    <div className="rounded-xl border border-surface-200 bg-surface-50/80 p-4">
      <p className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider mb-3">
        Documents
      </p>

      {/* File list */}
      {loading ? (
        <p className="text-xs text-surface-500">Loading documents...</p>
      ) : docs.length > 0 ? (
        <ul className="space-y-2 mb-3">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center gap-3 rounded-lg border border-surface-200 bg-white p-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-50 border border-brand-100 flex items-center justify-center shrink-0">
                <File className="w-4 h-4 text-brand-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900 truncate">
                  {doc.originalName}
                </p>
                <p className="text-[10px] text-surface-500">
                  {formatFileSize(doc.fileSize)}
                  {doc.createdAt ? ` · ${new Date(doc.createdAt).toLocaleDateString()}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownload(doc)}
                  className="p-1.5 rounded-lg text-surface-500 hover:bg-surface-100 transition-colors"
                  title="Download"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(doc.id)}
                  className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/* Upload button */}
      <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-surface-300 bg-white px-3 py-2.5 text-xs text-surface-600 hover:border-brand-400 hover:bg-brand-50/30 transition-colors">
        <Upload className="w-4 h-4 shrink-0" />
        <span>{uploading ? 'Uploading...' : 'Upload a document'}</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={uploading}
        />
      </label>

      {error && (
        <p className="text-[11px] text-red-600 mt-2">{error}</p>
      )}
    </div>
  )
}
