import { useState, useEffect, useCallback } from 'react';
import type { FilterState, SortOption } from '../types';

const DEFAULT_FILTERS: FilterState = {
  state: '',
  district: '',
  category: '',
  search: '',
  minRisk: 25,
  mpName: null,
  sort: 'risk_score_desc',
  page: 0,
  limit: 50,
};

function readFiltersFromUrl(): FilterState {
  const params = new URLSearchParams(window.location.search);
  return {
    state: params.get('state') || '',
    district: params.get('district') || '',
    category: params.get('category') || '',
    search: params.get('search') || '',
    minRisk: parseInt(params.get('risk') || '25', 10) || 25,
    mpName: params.get('mp') || null,
    sort: (params.get('sort') as SortOption) || 'risk_score_desc',
    page: parseInt(params.get('page') || '0', 10) || 0,
    limit: parseInt(params.get('limit') || '50', 10) || 50,
  };
}

function writeFiltersToUrl(filters: FilterState) {
  const params = new URLSearchParams();
  if (filters.state) params.set('state', filters.state);
  if (filters.district) params.set('district', filters.district);
  if (filters.category) params.set('category', filters.category);
  if (filters.search) params.set('search', filters.search);
  if (filters.minRisk !== 25) params.set('risk', String(filters.minRisk));
  if (filters.mpName) params.set('mp', filters.mpName);
  if (filters.sort !== 'risk_score_desc') params.set('sort', filters.sort);
  if (filters.page > 0) params.set('page', String(filters.page));
  if (filters.limit !== 50) params.set('limit', String(filters.limit));

  const qs = params.toString();
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

export function useFilters() {
  const [filters, setFilters] = useState<FilterState>(readFiltersFromUrl);

  useEffect(() => {
    writeFiltersToUrl(filters);
  }, [filters]);

  const updateFilter = useCallback(<K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key !== 'page' && key !== 'limit') {
        next.page = 0;
      }
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
  }, []);

  const activeFilterCount = [
    filters.state !== '',
    filters.district !== '',
    filters.category !== '',
    filters.search !== '',
    filters.minRisk !== 25,
    filters.mpName !== null,
  ].filter(Boolean).length;

  return { filters, updateFilter, resetFilters, activeFilterCount };
}
