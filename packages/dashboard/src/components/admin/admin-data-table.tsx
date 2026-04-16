'use client';

import { useState } from 'react';
import { ChevronUp, ChevronDown, Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (row: T) => React.ReactNode;
  className?: string;
}

interface AdminDataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  emptyMessage?: string;
  onRowClick?: (row: T) => void;
}

export function AdminDataTable<T>({
  columns,
  data,
  keyExtractor,
  searchable = false,
  searchPlaceholder = 'Search...',
  onSearch,
  emptyMessage = 'No data found',
  onRowClick,
}: AdminDataTableProps<T>) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [searchQuery, setSearchQuery] = useState('');

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  return (
    <div className="rounded-xl border border-border-primary bg-bg-card overflow-hidden">
      {searchable && (
        <div className="border-b border-border-primary px-4 py-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-border-primary bg-bg-primary py-2 pl-9 pr-3 text-xs text-text-primary placeholder:text-text-muted focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500/30"
            />
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border-primary">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-text-muted ${
                    col.sortable ? 'cursor-pointer select-none hover:text-text-secondary' : ''
                  } ${col.className ?? ''}`}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <div className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortDir === 'asc'
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-primary">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-text-muted">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyExtractor(row)}
                  className={`transition-colors hover:bg-white/[0.02] ${onRowClick ? 'cursor-pointer' : ''}`}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-3 text-sm ${col.className ?? ''}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
