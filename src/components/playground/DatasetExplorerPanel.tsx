import { useState } from 'react';
import { Layers, Info, Download, ChevronDown, ChevronRight } from 'lucide-react';
import { DATASET_CATEGORIES, type DatasetLayerConfig } from './layerConfig';
import type { GisManifest } from '../../lib/gis/types';
import { SectionCard } from '../ui/SectionCard';

export function DatasetExplorerPanel({
  activeLayers,
  onToggleLayer,
  layerOpacity,
  onOpacityChange,
  manifest,
  onDownload
}: {
  activeLayers: Set<string>;
  onToggleLayer: (id: string) => void;
  layerOpacity: Record<string, number>;
  onOpacityChange: (id: string, value: number) => void;
  manifest: GisManifest | null;
  onDownload: (layer: DatasetLayerConfig) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(DATASET_CATEGORIES.map(c => c.id)));
  const [metadataFor, setMetadataFor] = useState<DatasetLayerConfig | null>(null);

  function toggleCategory(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <SectionCard icon={Layers} title="Dataset Explorer">
      <div className="space-y-1.5 max-h-[720px] overflow-y-auto pr-1">
        {DATASET_CATEGORIES.map(category => {
          const isOpen = expanded.has(category.id);
          return (
            <div key={category.id} className="border border-slate-200 rounded">
              <button
                onClick={() => toggleCategory(category.id)}
                className="w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 hover:bg-slate-50"
              >
                <span className="flex items-center gap-1">
                  {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {category.label}
                </span>
                <span className="text-[8px] text-slate-400 font-mono">{category.layers.filter(l => l.dataStatus === 'real').length}/{category.layers.length}</span>
              </button>
              {isOpen && (
                <div className="border-t border-slate-100 divide-y divide-slate-50">
                  {category.layers.map(layer => {
                    const isReal = layer.dataStatus === 'real';
                    const isOn = activeLayers.has(layer.id);
                    const manifestEntry = layer.layerKey ? manifest?.layers[layer.layerKey] : undefined;
                    return (
                      <div key={layer.id} className={`px-2 py-1.5 ${!isReal ? 'opacity-50' : ''}`}>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="checkbox"
                            disabled={!isReal}
                            checked={isOn}
                            onChange={() => onToggleLayer(layer.id)}
                            className="accent-indigo-600"
                          />
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ backgroundColor: isReal ? layer.color : '#cbd5e1' }}
                          />
                          <span className="text-[10px] font-semibold text-slate-700 flex-1 truncate">{layer.label}</span>
                          {layer.dataStatus === 'statOnly' && (
                            <span className="text-[7px] font-bold text-amber-500 uppercase">Stat only</span>
                          )}
                          {layer.dataStatus === 'unavailable' && (
                            <span className="text-[7px] font-bold text-slate-400 uppercase">No dataset</span>
                          )}
                          <button onClick={() => setMetadataFor(metadataFor?.id === layer.id ? null : layer)} className="text-slate-400 hover:text-indigo-600">
                            <Info className="w-3 h-3" />
                          </button>
                          {isReal && isOn && layer.layerKey && (
                            <button onClick={() => onDownload(layer)} className="text-slate-400 hover:text-indigo-600">
                              <Download className="w-3 h-3" />
                            </button>
                          )}
                        </div>

                        {isReal && isOn && (
                          <input
                            type="range"
                            min={0.1}
                            max={1}
                            step={0.1}
                            value={layerOpacity[layer.id] ?? 0.8}
                            onChange={e => onOpacityChange(layer.id, Number(e.target.value))}
                            className="w-full mt-1 accent-indigo-600 h-1"
                          />
                        )}

                        {metadataFor?.id === layer.id && (
                          <div className="mt-1 text-[9px] text-slate-500 bg-slate-50 border border-slate-100 rounded p-1.5 leading-relaxed">
                            {manifestEntry && (
                              <div>
                                <div><strong className="text-slate-600">Rows:</strong> {manifestEntry.featureCount.toLocaleString()}</div>
                                <div><strong className="text-slate-600">Source:</strong> {manifestEntry.source}</div>
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
    </SectionCard>
  );
}
