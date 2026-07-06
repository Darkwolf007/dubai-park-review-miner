import { useMemo, useState, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
  type ColumnFiltersState,
  type VisibilityState
} from '@tanstack/react-table';
import { Table2, Search, ChevronUp, ChevronDown, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, FileSpreadsheet, Download, Save, Columns3 } from 'lucide-react';
import type { NLPAnalyzedReview } from '../../lib/nlpPlaceholders';
import type { ParkDetails } from '../../lib/googlePlaces';
import { exportParksToExcel, exportToCSV, exportToJSON } from '../../lib/exportExcel';
import { SectionCard } from '../ui/SectionCard';
import { Pill } from '../ui/Pill';

const columnHelper = createColumnHelper<NLPAnalyzedReview>();

interface SavedView {
  name: string;
  globalFilter: string;
  columnFilters: ColumnFiltersState;
  sorting: SortingState;
  columnVisibility: VisibilityState;
}

const SAVED_VIEWS_KEY = 'dprm_analytics_saved_views';

function loadSavedViews(): SavedView[] {
  try {
    const raw = localStorage.getItem(SAVED_VIEWS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persistSavedViews(views: SavedView[]) {
  localStorage.setItem(SAVED_VIEWS_KEY, JSON.stringify(views));
}

export function ReviewExplorerTable({
  reviews,
  selectedParks
}: {
  reviews: NLPAnalyzedReview[];
  selectedParks: ParkDetails[];
}) {
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({});
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);

  useEffect(() => { setSavedViews(loadSavedViews()); }, []);

  const uniqueCategories = useMemo(() => Array.from(new Set(reviews.map(r => r.issueCategory))).sort(), [reviews]);

  const columns = useMemo(() => [
    columnHelper.accessor('parkName', {
      header: 'Park',
      cell: info => <span className="font-semibold text-slate-700">{info.getValue()}</span>
    }),
    columnHelper.accessor('reviewText', {
      header: 'Review',
      cell: info => <span className="text-slate-600 line-clamp-2 max-w-xs block" title={info.getValue()}>{info.getValue()}</span>
    }),
    columnHelper.accessor('rating', {
      header: 'Rating',
      cell: info => <span className="font-mono text-amber-600 font-bold">{info.getValue()} ★</span>
    }),
    columnHelper.accessor('sentiment', {
      header: 'Sentiment',
      cell: info => <Pill variant="sentiment" value={info.getValue()} />,
      filterFn: 'equals'
    }),
    columnHelper.accessor('topic', {
      header: 'Topic',
      cell: info => <span className="text-slate-500">{info.getValue()}</span>
    }),
    columnHelper.accessor('issueCategory', {
      header: 'Issue Category',
      cell: info => <Pill variant="category" value={info.getValue()} />,
      filterFn: 'equals'
    }),
    columnHelper.accessor('keywords', {
      header: 'Keywords',
      enableSorting: false,
      cell: info => (
        <div className="flex flex-wrap gap-1 max-w-[140px]">
          {info.getValue().slice(0, 3).map(kw => (
            <span key={kw} className="bg-slate-100 text-[8px] text-slate-500 px-1 py-0.5 rounded font-mono border border-slate-200">#{kw}</span>
          ))}
        </div>
      )
    }),
    columnHelper.accessor(r => r.publishedAtDate || r.publishedTimeStr || '', {
      id: 'date',
      header: 'Date',
      cell: info => <span className="text-slate-500 font-mono">{info.getValue()}</span>
    }),
    columnHelper.accessor('designRequirement', {
      header: 'Design Requirement',
      enableSorting: false,
      cell: info => <span className="text-indigo-900 line-clamp-2 max-w-xs block">{info.getValue()}</span>
    })
  ], []);

  const table = useReactTable({
    data: reviews,
    columns,
    state: { globalFilter, sorting, columnFilters, columnVisibility },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    globalFilterFn: (row, _columnId, filterValue) => {
      const needle = String(filterValue).toLowerCase();
      const r = row.original;
      return (
        r.reviewText.toLowerCase().includes(needle) ||
        r.authorName.toLowerCase().includes(needle) ||
        r.parkName.toLowerCase().includes(needle) ||
        r.keywords.some(k => k.toLowerCase().includes(needle))
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 15 } }
  });

  const filteredRows = table.getFilteredRowModel().rows.map(r => r.original);

  function applyView(view: SavedView) {
    setGlobalFilter(view.globalFilter);
    setColumnFilters(view.columnFilters);
    setSorting(view.sorting);
    setColumnVisibility(view.columnVisibility);
  }

  function saveCurrentView() {
    const name = window.prompt('Name this saved view:');
    if (!name) return;
    const next = [...savedViews.filter(v => v.name !== name), { name, globalFilter, columnFilters, sorting, columnVisibility }];
    setSavedViews(next);
    persistSavedViews(next);
  }

  return (
    <SectionCard
      icon={Table2}
      title="Review Explorer"
      action={
        <div className="flex items-center gap-1.5">
          <button onClick={() => exportParksToExcel(selectedParks, filteredRows, 'analytics_review_explorer.xlsx')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded bg-indigo-600 text-white hover:bg-indigo-700">
            <FileSpreadsheet className="w-3 h-3" /> Excel
          </button>
          <button onClick={() => exportToCSV(filteredRows, 'analytics_review_explorer.csv')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> CSV
          </button>
          <button onClick={() => exportToJSON(filteredRows, 'analytics_review_explorer.json')} className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold uppercase tracking-wider rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Download className="w-3 h-3" /> JSON
          </button>
        </div>
      }
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
          <input
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            placeholder="Search reviews, authors, parks, keywords..."
            className="w-full pl-6 pr-2 py-1.5 text-[10px] border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-400"
          />
        </div>
        <select
          value={(table.getColumn('issueCategory')?.getFilterValue() as string) || ''}
          onChange={e => table.getColumn('issueCategory')?.setFilterValue(e.target.value || undefined)}
          className="text-[10px] border border-slate-200 rounded px-1.5 py-1.5 text-slate-600"
        >
          <option value="">All Categories</option>
          {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select
          value={(table.getColumn('sentiment')?.getFilterValue() as string) || ''}
          onChange={e => table.getColumn('sentiment')?.setFilterValue(e.target.value || undefined)}
          className="text-[10px] border border-slate-200 rounded px-1.5 py-1.5 text-slate-600"
        >
          <option value="">All Sentiment</option>
          <option value="POSITIVE">Positive</option>
          <option value="NEUTRAL">Neutral</option>
          <option value="NEGATIVE">Negative</option>
        </select>

        <div className="relative">
          <button onClick={() => setShowColumnPicker(v => !v)} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
            <Columns3 className="w-3 h-3" /> Columns
          </button>
          {showColumnPicker && (
            <div className="absolute right-0 top-full mt-1 z-20 bg-white border border-slate-200 rounded shadow-lg p-2 w-40">
              {table.getAllLeafColumns().map(col => (
                <label key={col.id} className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-600 py-0.5 capitalize">
                  <input type="checkbox" checked={col.getIsVisible()} onChange={col.getToggleVisibilityHandler()} />
                  {col.id}
                </label>
              ))}
            </div>
          )}
        </div>

        <button onClick={saveCurrentView} className="flex items-center gap-1 px-2 py-1.5 text-[10px] font-semibold border border-slate-200 rounded text-slate-600 hover:bg-slate-50">
          <Save className="w-3 h-3" /> Save View
        </button>
        {savedViews.length > 0 && (
          <select
            onChange={e => {
              const view = savedViews.find(v => v.name === e.target.value);
              if (view) applyView(view);
            }}
            defaultValue=""
            className="text-[10px] border border-slate-200 rounded px-1.5 py-1.5 text-slate-600"
          >
            <option value="" disabled>Load saved view...</option>
            {savedViews.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
          </select>
        )}
      </div>

      <p className="text-[9px] text-slate-400 font-semibold mb-2">
        Showing <span className="text-slate-700">{filteredRows.length}</span> of <span className="text-slate-700">{reviews.length}</span> review vectors
      </p>

      <div className="overflow-x-auto border border-slate-200 rounded">
        <table className="w-full text-left text-[10px]">
          <thead className="bg-slate-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id} className="border-b border-slate-200">
                {hg.headers.map(header => (
                  <th
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className="py-1.5 px-2.5 font-bold uppercase tracking-wider text-slate-500 text-[9px] cursor-pointer select-none whitespace-nowrap"
                  >
                    <div className="flex items-center gap-0.5">
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getIsSorted() === 'asc' && <ChevronUp className="w-2.5 h-2.5" />}
                      {header.column.getIsSorted() === 'desc' && <ChevronDown className="w-2.5 h-2.5" />}
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="py-2 px-2.5 align-top">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} className="py-6 text-center text-slate-400 font-semibold">No reviews match the current filters.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between mt-2 text-[9px] font-semibold text-slate-500">
        <div className="flex items-center gap-1">
          <button onClick={() => table.setPageIndex(0)} disabled={!table.getCanPreviousPage()} className="p-1 border border-slate-200 rounded disabled:opacity-30">
            <ChevronsLeft className="w-3 h-3" />
          </button>
          <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} className="p-1 border border-slate-200 rounded disabled:opacity-30">
            <ChevronLeft className="w-3 h-3" />
          </button>
          <span>Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}</span>
          <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} className="p-1 border border-slate-200 rounded disabled:opacity-30">
            <ChevronRight className="w-3 h-3" />
          </button>
          <button onClick={() => table.setPageIndex(table.getPageCount() - 1)} disabled={!table.getCanNextPage()} className="p-1 border border-slate-200 rounded disabled:opacity-30">
            <ChevronsRight className="w-3 h-3" />
          </button>
        </div>
        <select
          value={table.getState().pagination.pageSize}
          onChange={e => table.setPageSize(Number(e.target.value))}
          className="border border-slate-200 rounded px-1.5 py-1"
        >
          {[10, 15, 25, 50].map(size => <option key={size} value={size}>{size} / page</option>)}
        </select>
      </div>
    </SectionCard>
  );
}
