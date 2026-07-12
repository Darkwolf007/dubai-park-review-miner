import { useEffect, useRef, useState } from 'react';
import { Layers, Info, Download, ChevronDown, ChevronRight, SlidersHorizontal, Check } from 'lucide-react';
import { DATASET_CATEGORIES, type DatasetLayerConfig } from './layerConfig';
import { COLOR_THEMES, DEFAULT_LAYER_STYLE, getColorTheme, type LayerStyle } from './colorThemes';
import type { GisManifest } from '../../lib/gis/types';

const CHOROPLETH_MODES = new Set(['choropleth', 'pointChoropleth']);

function StylePopover({
  layer,
  style,
  onChange,
  onClose
}: {
  layer: DatasetLayerConfig;
  style: LayerStyle;
  onChange: (next: Partial<LayerStyle>) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, [onClose]);

  const supportsGradient = CHOROPLETH_MODES.has(layer.renderMode || '');

  return (
    <div
      ref={ref}
      className="absolute z-20 mt-1 w-56 bg-mux-surface border border-mux-tertiary/40 rounded-[12px] shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-3 space-y-3"
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <div>
        <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary mb-1.5">Color Theme</p>
        <div className="flex flex-wrap gap-1.5">
          {COLOR_THEMES.map(theme => (
            <button
              key={theme.id}
              onClick={() => onChange({ colorThemeId: theme.id })}
              title={theme.label}
              className="w-6 h-6 rounded-full flex items-center justify-center border transition-transform hover:scale-110"
              style={{ backgroundColor: theme.solid, borderColor: theme.id === style.colorThemeId ? '#000' : 'transparent' }}
            >
              {theme.id === style.colorThemeId && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary">Opacity</p>
          <span className="font-mono text-[9px] text-mux-secondary">{Math.round(style.opacity * 100)}%</span>
        </div>
        <input
          type="range"
          min={0.1}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={e => onChange({ opacity: Number(e.target.value) })}
          className="w-full h-1 accent-mux-primary"
        />
      </div>

      {supportsGradient && (
        <div className="flex items-center justify-between">
          <p className="font-mono text-[9px] font-medium uppercase tracking-wider text-mux-tertiary">Gradient</p>
          <button
            onClick={() => onChange({ gradient: !style.gradient })}
            className={`relative w-8 h-4 rounded-full transition-colors ${style.gradient ? 'bg-mux-primary' : 'bg-mux-tertiary/40'}`}
          >
            <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${style.gradient ? 'translate-x-4' : 'translate-x-0.5'}`} />
          </button>
        </div>
      )}
      {supportsGradient && (
        <p className="text-[8px] text-mux-tertiary leading-relaxed">
          {style.gradient ? 'Smooth 5-step gradient across the value range.' : 'Stepped Low / Medium / High classes.'}
        </p>
      )}
    </div>
  );
}

export function DatasetExplorerPanel({
  activeLayers,
  onToggleLayer,
  layerStyles,
  onStyleChange,
  manifest,
  onDownload
}: {
  activeLayers: Set<string>;
  onToggleLayer: (id: string) => void;
  layerStyles: Record<string, LayerStyle>;
  onStyleChange: (id: string, style: Partial<LayerStyle>) => void;
  manifest: GisManifest | null;
  onDownload: (layer: DatasetLayerConfig) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DATASET_CATEGORIES.map(c => c.id)));
  const [metadataFor, setMetadataFor] = useState<DatasetLayerConfig | null>(null);
  const [styleOpenFor, setStyleOpenFor] = useState<string | null>(null);

  function toggleCategory(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-mux-surface rounded-[16px] border border-mux-tertiary/30 p-3.5">
      <div className="flex items-center gap-1.5 mb-3">
        <Layers className="w-3.5 h-3.5 text-mux-primary" />
        <h3 className="font-mono text-[10px] font-medium uppercase tracking-wider text-mux-secondary">Dataset Explorer</h3>
      </div>

      <div className="space-y-1.5 max-h-[720px] overflow-y-auto pr-1">
        {DATASET_CATEGORIES.map(category => {
          const isOpen = expanded.has(category.id);
          return (
            <div key={category.id} className="border border-mux-tertiary/25 rounded-[10px] overflow-visible">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-mux-secondary hover:bg-mux-neutral-95"
              >
                <span className="flex items-center gap-1">
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {category.label}
                </span>
                <span className="text-[8px] text-mux-tertiary">{category.layers.filter(l => l.dataStatus === 'real').length}/{category.layers.length}</span>
              </button>
              {isOpen && (
                <div className="border-t border-mux-tertiary/20 divide-y divide-mux-tertiary/10">
                  {category.layers.map(layer => {
                    const isReal = layer.dataStatus === 'real';
                    const isOn = activeLayers.has(layer.id);
                    const style = layerStyles[layer.id] ?? DEFAULT_LAYER_STYLE;
                    const theme = getColorTheme(style.colorThemeId);
                    const manifestEntry = layer.layerKey ? manifest?.layers[layer.layerKey] : undefined;
                    return (
                      <div key={layer.id} className={`relative px-2 py-1.5 ${!isReal ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            disabled={!isReal}
                            checked={isOn}
                            onChange={() => onToggleLayer(layer.id)}
                            className="accent-mux-primary"
                          />
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isReal ? (isOn ? theme.solid : layer.color) : '#cbd5e1' }}
                          />
                          <span className="text-[10px] font-semibold text-mux-secondary flex-1 truncate" style={{ fontFamily: 'var(--font-sans)' }}>{layer.label}</span>
                          {layer.dataStatus === 'statOnly' && (
                            <span className="text-[7px] font-bold text-mux-primary uppercase">Stat only</span>
                          )}
                          {layer.dataStatus === 'unavailable' && (
                            <span className="text-[7px] font-bold text-mux-tertiary uppercase">No dataset</span>
                          )}
                          <button onClick={() => setMetadataFor(metadataFor?.id === layer.id ? null : layer)} className="text-mux-tertiary hover:text-mux-primary">
                            <Info className="w-3 h-3" />
                          </button>
                          {isReal && isOn && (
                            <button
                              onClick={() => setStyleOpenFor(styleOpenFor === layer.id ? null : layer.id)}
                              className={`hover:text-mux-primary ${styleOpenFor === layer.id ? 'text-mux-primary' : 'text-mux-tertiary'}`}
                              title="Style"
                            >
                              <SlidersHorizontal className="w-3 h-3" />
                            </button>
                          )}
                          {isReal && isOn && layer.layerKey && (
                            <button onClick={() => onDownload(layer)} className="text-mux-tertiary hover:text-mux-primary">
                              <Download className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {styleOpenFor === layer.id && (
                          <StylePopover
                            layer={layer}
                            style={style}
                            onChange={patch => onStyleChange(layer.id, patch)}
                            onClose={() => setStyleOpenFor(null)}
                          />
                        )}

                        {metadataFor?.id === layer.id && (
                          <div className="mt-1 text-[9px] text-mux-tertiary bg-mux-neutral-95 border border-mux-tertiary/20 rounded-[8px] p-1.5 leading-relaxed" style={{ fontFamily: 'var(--font-sans)' }}>
                            {manifestEntry && (
                              <div>
                                <div><strong className="text-mux-secondary">Rows:</strong> {manifestEntry.featureCount.toLocaleString()}</div>
                                <div><strong className="text-mux-secondary">Source:</strong> {manifestEntry.source}</div>
                              </div>
                            )}
                            {layer.note && <div className="mt-0.5">{layer.note}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
