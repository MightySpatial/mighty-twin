import { useState, useEffect, useMemo, useCallback } from "react"
import "./AttributeTable.css"

export interface AttributeFeature {
  [key: string]: unknown
}

export interface AttributeTableProps {
  layerId: string
  layerName: string
  layerMeta?: {
    description?: string
    site?: string
    geometryType?: string
    type?: string
  }
  fetchAttributes: (layerId: string) => Promise<AttributeFeature[]>
  onClose: () => void
  viewerUrl?: string
}

const EXCLUDED_KEYS = new Set([
  "id",
  "geometry",
  "description",
  "type",
  "tileset_path",
  "file_path",
  "file_type",
  "storage_type",
  "table_name",
  "feature_count",
  "geometry_type",
])

const PAGE_SIZES = [10, 25, 50, 100, 0] as const

function formatCellValue(val: unknown): string {
  if (val == null) return ""
  if (typeof val === "object") return JSON.stringify(val)
  return String(val)
}

export default function AttributeTable({
  layerId,
  layerName,
  layerMeta,
  fetchAttributes,
  onClose,
  viewerUrl,
}: AttributeTableProps) {
  const [features, setFeatures] = useState<AttributeFeature[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortAsc, setSortAsc] = useState(true)
  const [pageSize, setPageSize] = useState(25)
  const [page, setPage] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAttributes(layerId)
      .then((data) => {
        if (!cancelled) setFeatures(data)
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || "Failed to load attributes")
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [layerId, fetchAttributes])

  // Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [onClose])

  // Auto-detect columns
  const columns = useMemo(() => {
    const colSet = new Set<string>()
    for (const f of features) {
      for (const key of Object.keys(f)) {
        if (!EXCLUDED_KEYS.has(key) && !key.startsWith("_")) {
          colSet.add(key)
        }
      }
    }
    return Array.from(colSet)
  }, [features])

  // Filter
  const filtered = useMemo(() => {
    if (!search.trim()) return features
    const q = search.toLowerCase()
    return features.filter((f) =>
      columns.some((col) => {
        const v = f[col]
        return v != null && String(v).toLowerCase().includes(q)
      })
    )
  }, [features, search, columns])

  // Sort
  const sorted = useMemo(() => {
    if (!sortCol) return filtered
    return [...filtered].sort((a, b) => {
      const av = a[sortCol]
      const bv = b[sortCol]
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const aStr = String(av)
      const bStr = String(bv)
      const aNum = Number(av)
      const bNum = Number(bv)
      let cmp: number
      if (!isNaN(aNum) && !isNaN(bNum)) {
        cmp = aNum - bNum
      } else {
        cmp = aStr.localeCompare(bStr)
      }
      return sortAsc ? cmp : -cmp
    })
  }, [filtered, sortCol, sortAsc])

  // Paginate
  const totalPages = pageSize === 0 ? 1 : Math.max(1, Math.ceil(sorted.length / pageSize))
  const pageRows = pageSize === 0 ? sorted : sorted.slice(page * pageSize, (page + 1) * pageSize)

  // Reset page on filter/sort change
  useEffect(() => {
    setPage(0)
  }, [search, sortCol, sortAsc, pageSize])

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortAsc((prev) => !prev)
      } else {
        setSortCol(col)
        setSortAsc(true)
      }
    },
    [sortCol]
  )

  const handleExportCsv = useCallback(() => {
    if (columns.length === 0) return
    const header = columns.join(",")
    const rows = sorted.map((f) =>
      columns
        .map((col) => {
          const v = formatCellValue(f[col])
          if (v.includes(",") || v.includes('"') || v.includes("\n")) {
            return `"${v.replace(/"/g, '""')}"`
          }
          return v
        })
        .join(",")
    )
    const csv = [header, ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${layerName.replace(/[^a-zA-Z0-9_-]/g, "_")}_attributes.csv`
    a.click()
    URL.revokeObjectURL(url)
  }, [columns, sorted, layerName])

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).classList.contains("attr-modal-overlay")) {
        onClose()
      }
    },
    [onClose]
  )

  const hasInfo =
    layerMeta &&
    (layerMeta.description || layerMeta.site || layerMeta.geometryType || layerMeta.type)

  return (
    <div className="attr-modal-overlay" onClick={handleBackdropClick}>
      <div className="attr-modal">
        {/* Header */}
        <div className="attr-modal-header">
          <span className="attr-modal-title">{layerName}</span>
          {!loading && (
            <span className="attr-modal-record-count">
              {features.length.toLocaleString()} record{features.length !== 1 ? "s" : ""}
            </span>
          )}
          <div className="attr-modal-actions">
            <button className="attr-modal-btn" onClick={handleExportCsv} title="Export CSV">
              CSV ↓
            </button>
            {viewerUrl && (
              <button
                className="attr-modal-btn"
                onClick={() => window.open(viewerUrl, "_blank")}
                title="Open in new window"
              >
                ↗
              </button>
            )}
            <button className="attr-modal-close" onClick={onClose} title="Close">
              ×
            </button>
          </div>
        </div>

        {/* Info strip */}
        {hasInfo && (
          <div className="attr-modal-info">
            {layerMeta!.description && (
              <div className="attr-modal-info-item">
                <span className="attr-modal-info-label">Description</span>
                <span className="attr-modal-info-value">{layerMeta!.description}</span>
              </div>
            )}
            {layerMeta!.site && (
              <div className="attr-modal-info-item">
                <span className="attr-modal-info-label">Site</span>
                <span className="attr-modal-info-value">{layerMeta!.site}</span>
              </div>
            )}
            {layerMeta!.geometryType && (
              <div className="attr-modal-info-item">
                <span className="attr-modal-info-label">Geometry</span>
                <span className="attr-modal-info-value">{layerMeta!.geometryType}</span>
              </div>
            )}
            {layerMeta!.type && (
              <div className="attr-modal-info-item">
                <span className="attr-modal-info-label">Type</span>
                <span className="attr-modal-info-value">{layerMeta!.type}</span>
              </div>
            )}
          </div>
        )}

        {/* Controls row */}
        <div className="attr-modal-toolbar">
          <input
            className="attr-modal-search"
            type="text"
            placeholder="Search all columns…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="attr-modal-pagesize"
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s === 0 ? "All" : s}
              </option>
            ))}
          </select>
          <span className="attr-modal-feature-count">
            Showing {sorted.length === features.length
              ? `${features.length.toLocaleString()} feature${features.length !== 1 ? "s" : ""}`
              : `${sorted.length.toLocaleString()} of ${features.length.toLocaleString()} features`}
          </span>
        </div>

        {/* Table */}
        {loading ? (
          <div className="attr-modal-loading">
            <div className="attr-modal-spinner" />
            Loading attributes…
          </div>
        ) : error ? (
          <div className="attr-modal-error">{error}</div>
        ) : features.length === 0 ? (
          <div className="attr-modal-empty">No features found</div>
        ) : (
          <div className="attr-modal-scroll">
            <table className="attr-modal-table">
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th key={col} onClick={() => handleSort(col)}>
                      {col}
                      {sortCol === col && (
                        <span className="sort-arrow">{sortAsc ? "↑" : "↓"}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((feature, rowIdx) => (
                  <tr key={rowIdx}>
                    {columns.map((col) => {
                      const raw = feature[col]
                      if (raw == null) {
                        return (
                          <td key={col}>
                            <span className="attr-null">—</span>
                          </td>
                        )
                      }
                      const str = formatCellValue(raw)
                      const truncated = str.length > 80
                      return (
                        <td key={col} title={truncated ? str : undefined}>
                          {truncated ? str.slice(0, 80) + "…" : str}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && !error && features.length > 0 && pageSize !== 0 && totalPages > 1 && (
          <div className="attr-modal-pagination">
            <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              ← Prev
            </button>
            <span className="attr-modal-page-info">
              Page {page + 1} of {totalPages}
            </span>
            <button disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
