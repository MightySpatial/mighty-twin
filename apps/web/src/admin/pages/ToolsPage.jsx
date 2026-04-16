import { useState } from 'react'
import { useBreakpoint } from '../hooks/useBreakpoint'
import { useApiData } from '../hooks/useApi'
import { 
  Lock, Check, ExternalLink, Settings, Play, 
  FileCode, Cpu, Mountain, Layers, Sparkles, Image, Box, Loader
} from 'lucide-react'
import '../styles/components.css'
import './ToolsPage.css'

// Capability icons mapping
const CAPABILITY_ICONS = {
  ifc_converter: FileCode,
  cad_converter: FileCode,
  pointcloud_tools: Cpu,
  tiles_3d_generator: Box,
  gaussian_splats: Sparkles,
  raster_processing: Image,
  terrain_builder: Mountain,
  ai_copilot: Sparkles,
  widget_sdk: Layers,
  embed_sdk: Layers,
}

// All available converters/tools
const CONVERTERS = [
  {
    id: 'ifc_converter',
    name: 'IFC Converter',
    description: 'Convert IFC (BIM) files to GeoJSON, GeoPackage, or 3D Tiles',
    formats: ['IFC → GeoJSON', 'IFC → GPKG', 'IFC → 3D Tiles'],
    price: { perpetual: 2500, monthly: 99 },
  },
  {
    id: 'cad_converter',
    name: 'CAD Converter',
    description: 'Convert DWG/DXF files to GIS formats',
    formats: ['DWG → GeoJSON', 'DXF → GeoJSON', 'DWG → GPKG'],
    price: { perpetual: 2000, monthly: 79 },
  },
  {
    id: 'pointcloud_tools',
    name: 'Point Cloud Tools',
    description: 'LAS/LAZ import, classification, filtering, and export',
    formats: ['LAS/LAZ → 3D Tiles', 'LAS → Filtered LAS', 'Classify'],
    price: { perpetual: 3500, monthly: 149 },
  },
  {
    id: 'tiles_3d_generator',
    name: '3D Tiles Generator',
    description: 'Generate Cesium 3D Tiles from various sources',
    formats: ['PostGIS → 3D Tiles', 'GeoJSON → 3D Tiles', 'OBJ → 3D Tiles'],
    price: { perpetual: 5000, monthly: 199 },
  },
  {
    id: 'gaussian_splats',
    name: 'Gaussian Splats',
    description: 'Import and render Gaussian Splat captures',
    formats: ['.splat', '.ply (splat)', 'Pix4D georef'],
    price: { perpetual: 3000, monthly: 129 },
  },
  {
    id: 'raster_processing',
    name: 'Raster Processing',
    description: 'GeoTIFF processing, COG generation, imagery tools',
    formats: ['TIFF → COG', 'Mosaic', 'Reproject'],
    price: { perpetual: 2000, monthly: 79 },
  },
  {
    id: 'terrain_builder',
    name: 'Terrain Builder',
    description: 'Generate quantized-mesh terrain from DEM/DTM data',
    formats: ['DEM → Terrain', 'Contours → DEM', 'Merge DEMs'],
    price: { perpetual: 4000, monthly: 159 },
  },
]

export default function ToolsPage() {
  const { isDesktop } = useBreakpoint()
  const [activeConverter, setActiveConverter] = useState(null)

  // Live license capabilities from API
  const { data: licenseData, loading: licenseLoading } = useApiData('/api/setup/license/status', null)
  const LICENSE_CAPABILITIES = licenseData?.capabilities || {}
  const licenseTier = licenseData?.tier || 'community'
  const licenseOrg = licenseData?.organization

  const licensedCount = Object.values(LICENSE_CAPABILITIES).filter(Boolean).length
  const totalCount = CONVERTERS.length

  return (
    <div className="tools-page">
      {/* Header */}
      {isDesktop && (
        <header className="page-header">
          <div>
            <h1 className="page-title">Tools & Converters</h1>
            <p className="page-subtitle">
              {licensedCount} of {totalCount} tools licensed
            </p>
          </div>
        </header>
      )}

      {/* License Status Banner */}
      <div className="license-banner">
        <div className="license-banner-content">
          <div>
            {licenseLoading
              ? <Loader size={14} className="spin" style={{ opacity: 0.5 }} />
              : <><strong>License:</strong> {licenseOrg || 'Community'} · <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>{licenseTier}</span></>
            }
          </div>
          <div className="license-caps">
            {licenseLoading ? 'Loading…' : `${licensedCount} capabilities active · ${totalCount - licensedCount} available to add`}
          </div>
        </div>
        <a href="https://portal.mightyspatial.com/capabilities" className="btn btn-secondary btn-sm">
          <ExternalLink size={14} />
          Manage License
        </a>
      </div>

      {/* Converters Grid */}
      <div className="converters-grid">
        {CONVERTERS.map(converter => {
          const isLicensed = LICENSE_CAPABILITIES[converter.id]
          const Icon = CAPABILITY_ICONS[converter.id] || Box

          return (
            <div 
              key={converter.id} 
              className={`converter-card ${!isLicensed ? 'locked' : ''}`}
            >
              <div className="converter-header">
                <div className="converter-icon">
                  <Icon size={24} />
                </div>
                <div className="converter-status">
                  {isLicensed ? (
                    <span className="status-badge licensed">
                      <Check size={12} />
                      Licensed
                    </span>
                  ) : (
                    <span className="status-badge locked">
                      <Lock size={12} />
                      Not Licensed
                    </span>
                  )}
                </div>
              </div>

              <h3 className="converter-name">{converter.name}</h3>
              <p className="converter-description">{converter.description}</p>

              <div className="converter-formats">
                {converter.formats.map((fmt, i) => (
                  <span key={i} className="format-tag">{fmt}</span>
                ))}
              </div>

              <div className="converter-footer">
                {isLicensed ? (
                  <button 
                    className="btn btn-primary btn-full"
                    onClick={() => setActiveConverter(converter)}
                  >
                    <Play size={16} />
                    Open Converter
                  </button>
                ) : (
                  <div className="upgrade-section">
                    <div className="upgrade-price">
                      <span className="price">${converter.price.monthly}</span>
                      <span className="period">/month</span>
                      <span className="or">or</span>
                      <span className="perpetual">${converter.price.perpetual.toLocaleString()} perpetual</span>
                    </div>
                    <a 
                      href={`https://portal.mightyspatial.com/capabilities/${converter.id}/upgrade`}
                      className="btn btn-secondary btn-full"
                    >
                      <Lock size={16} />
                      Unlock This Tool
                    </a>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Converter Modal */}
      {activeConverter && (
        <ConverterModal 
          converter={activeConverter}
          onClose={() => setActiveConverter(null)}
        />
      )}
    </div>
  )
}

function ConverterModal({ converter, onClose }) {
  const [inputFile, setInputFile] = useState(null)
  const [outputFormat, setOutputFormat] = useState('')
  const [converting, setConverting] = useState(false)

  const handleConvert = async () => {
    setConverting(true)
    // Simulate conversion
    await new Promise(r => setTimeout(r, 2000))
    setConverting(false)
    alert('Conversion complete!')
  }

  return (
    <>
      <div className="modal-backdrop" onClick={onClose} />
      <div className="modal converter-modal">
        <div className="modal-header">
          <h2>{converter.name}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Input File</label>
            <div 
              className="file-drop-zone"
              onClick={() => document.getElementById('file-input').click()}
            >
              {inputFile ? (
                <div className="file-selected">
                  <span className="file-name">{inputFile.name}</span>
                  <span className="file-size">({(inputFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                </div>
              ) : (
                <div className="drop-prompt">
                  <span>Drop file here or click to browse</span>
                </div>
              )}
              <input 
                id="file-input"
                type="file" 
                hidden
                onChange={e => setInputFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Output Format</label>
            <select 
              className="form-input"
              value={outputFormat}
              onChange={e => setOutputFormat(e.target.value)}
            >
              <option value="">Select format...</option>
              {converter.formats.map((fmt, i) => (
                <option key={i} value={fmt}>{fmt}</option>
              ))}
            </select>
          </div>

          {/* Converter-specific options would go here */}
          <div className="form-group">
            <label className="form-label">Options</label>
            <div className="options-placeholder">
              Additional converter options would appear here based on the selected tool.
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button 
            className="btn btn-primary"
            onClick={handleConvert}
            disabled={!inputFile || !outputFormat || converting}
          >
            {converting ? 'Converting...' : 'Convert'}
          </button>
        </div>
      </div>
    </>
  )
}
