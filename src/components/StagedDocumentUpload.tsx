import { useRef } from 'react'
import { Upload, File, Trash2 } from 'lucide-react'

interface StagedDocumentUploadProps {
  files: File[]
  onFilesChange: (files: File[]) => void
  disabled?: boolean
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Used on new-entry forms (employee/leave/payroll-input/account create modals).
 * Holds files in memory until the parent saves the record, then the parent
 * calls uploadStagedDocuments() with the returned entityId to flush them.
 *
 * 22MAY2026 client video: document upload was broken on every new-entry form —
 * forced the user to save first and re-open the edit form. This widget lets
 * them stage uploads alongside the rest of the form fields.
 */
export default function StagedDocumentUpload({ files, onFilesChange, disabled }: StagedDocumentUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const incoming = e.target.files
    if (!incoming || incoming.length === 0) return
    onFilesChange([...files, ...Array.from(incoming)])
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function removeAt(idx: number) {
    onFilesChange(files.filter((_, i) => i !== idx))
  }

  return (
    <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-900 p-4">
      <p className="text-[10px] font-semibold text-surface-400 dark:text-surface-500 uppercase tracking-wider mb-3">
        Documents
      </p>

      {files.length > 0 && (
        <ul className="space-y-2 mb-3">
          {files.map((f, idx) => (
            <li
              key={`${f.name}-${idx}`}
              className="flex items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900 p-2.5"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-50 dark:bg-brand-900/30 border border-brand-100 dark:border-brand-800 flex items-center justify-center shrink-0">
                <File className="w-4 h-4 text-brand-600 dark:text-brand-300" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-surface-900 dark:text-surface-50 truncate">{f.name}</p>
                <p className="text-[10px] text-surface-500 dark:text-surface-400">{formatFileSize(f.size)} · Will upload on save</p>
              </div>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <label className={`flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-surface-300 dark:border-surface-700 bg-white dark:bg-surface-900 px-3 py-2.5 text-xs text-surface-600 dark:text-surface-300 hover:border-brand-400 hover:bg-brand-50/30 dark:hover:bg-brand-900/20 transition-colors ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <Upload className="w-4 h-4 shrink-0" />
        <span>{files.length > 0 ? 'Add another document' : 'Upload a document'}</span>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileChange}
          disabled={disabled}
        />
      </label>
      <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-1.5">
        Files are uploaded after you click Save.
      </p>
    </div>
  )
}

/**
 * Helper to flush staged files after the parent has POSTed the record and
 * received its ID. Wraps the existing uploadDocument API.
 */
export async function uploadStagedDocuments(
  files: File[],
  entityType: 'employee' | 'leave' | 'payroll_input' | 'account',
  entityId: string,
  uploadDocument: (data: { entityType: string; entityId: string; fileName: string; mimeType: string; data: string }) => Promise<unknown>,
): Promise<{ uploaded: number; failed: number; firstError?: string }> {
  let uploaded = 0
  let failed = 0
  let firstError: string | undefined
  for (const f of files) {
    try {
      const reader = new FileReader()
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string
          resolve(result.split(',')[1] || result)
        }
        reader.onerror = reject
        reader.readAsDataURL(f)
      })
      await uploadDocument({
        entityType,
        entityId,
        fileName: f.name,
        mimeType: f.type || 'application/octet-stream',
        data: base64,
      })
      uploaded++
    } catch (err) {
      failed++
      if (!firstError) firstError = err instanceof Error ? err.message : String(err)
    }
  }
  return { uploaded, failed, firstError }
}
