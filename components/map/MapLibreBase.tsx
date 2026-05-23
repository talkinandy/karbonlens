'use client';

/**
 * MapLibreBase — root MapLibre GL JS container shared by the explorer tab
 * and the project detail panel.
 *
 * Initialises a `maplibregl.Map` instance against a `div` ref on mount,
 * exposes it to descendant layer components via `MapContext`, and tears
 * down on unmount. Shows a pulse skeleton until the `load` event fires;
 * renders a fallback element if the constructor throws (MapLibre has a
 * known failure mode when WebGL is disabled).
 *
 * MUST be dynamically imported with `ssr: false` at every callsite — the
 * `maplibre-gl` package touches `window` at module scope. Callsites:
 *   - `components/map/MapExplorerTab.tsx`
 *   - `components/projects/detail/ProjectDetailMap.tsx`
 *
 * Ownership: T13. See `docs/stories/T13-map-integration.md §3.2`.
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Empty MapLibre style — all layers and sources are added by descendants
 * (Esri base, centroids, alerts, buffer). Glyphs are intentionally omitted
 * for v0.1; cluster badges use a `circle` paint, not text on a symbol layer.
 */
const EMPTY_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [],
};

export type MapLibreBaseProps = {
  /** Initial center `[longitude, latitude]`. */
  center: [number, number];
  /** Initial zoom level. */
  zoom: number;
  /**
   * When provided, the map will `fitBounds` to these SW/NE corners once on
   * load instead of using the initial center+zoom. Preferred on the
   * explorer tab to fit Indonesia.
   */
  fitBounds?: [[number, number], [number, number]];
  /** Tailwind height utility. Default: responsive. */
  className?: string;
  /** Accessible label for the `role="application"` container. */
  ariaLabel: string;
  /** Layer components consumed via `useMapContext()`. */
  children?: ReactNode;
};

type MapContextValue = {
  map: MapLibreMap;
};

const MapContext = createContext<MapContextValue | null>(null);

export function useMapContext(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) {
    throw new Error(
      'useMapContext must be used inside <MapLibreBase>. Did you forget to wrap a layer?',
    );
  }
  return ctx;
}

export default function MapLibreBase({
  center,
  zoom,
  fitBounds,
  className,
  ariaLabel,
  children,
}: MapLibreBaseProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let instance: MapLibreMap | null = null;
    try {
      instance = new maplibregl.Map({
        container: containerRef.current,
        style: EMPTY_STYLE,
        center,
        zoom,
        attributionControl: { compact: false },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'MapLibre init failed');
      return;
    }

    instance.addControl(new maplibregl.NavigationControl({}), 'top-right');

    const onLoad = () => {
      setLoaded(true);
      if (fitBounds && instance) {
        instance.fitBounds(fitBounds, { padding: 24, animate: false });
      }
      setMap(instance);
    };

    // Escape closes the topmost popup — satisfies §3.12 keyboard AC.
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        const popups =
          containerRef.current?.querySelectorAll<HTMLElement>(
            '.maplibregl-popup',
          );
        popups?.forEach((p) => {
          const closeBtn = p.querySelector<HTMLButtonElement>(
            '.maplibregl-popup-close-button',
          );
          closeBtn?.click();
        });
      }
    };

    instance.on('load', onLoad);
    const containerEl = containerRef.current;
    containerEl.addEventListener('keydown', onKeyDown);
    mapRef.current = instance;

    // When the map mounts inside a Suspense / dynamic-import boundary the
    // container can transition from 0x0 to its final size *after* MapLibre
    // initialises. MapLibre's internal observer attaches to its own canvas
    // and misses parent-driven resizes (the kl-card grows from min-height
    // 480 once layout settles). Watch the host container directly and
    // re-project on every change. A debounced rAF avoids cascading layout
    // thrash if the container animates.
    let rafId: number | null = null;
    const resizeObserver = new ResizeObserver(() => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        rafId = null;
        instance?.resize();
      });
    });
    resizeObserver.observe(containerEl);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      containerEl.removeEventListener('keydown', onKeyDown);
      instance?.remove();
      mapRef.current = null;
      setMap(null);
      setLoaded(false);
    };
    // Intentionally only bind on mount — center/zoom changes do not re-init.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div
        className={
          className ??
          'w-full h-[50vh] md:h-[60vh] flex items-center justify-center bg-[color:var(--surface-2)] text-[color:var(--text-2)] rounded-md'
        }
        role="alert"
      >
        <p style={{ fontSize: 14 }}>Map unavailable — try refresh.</p>
      </div>
    );
  }

  return (
    <div
      className={
        className ?? 'relative w-full h-[50vh] md:h-[60vh] rounded-md overflow-hidden'
      }
      style={{ position: 'relative' }}
    >
      <div
        ref={containerRef}
        role="application"
        aria-label={ariaLabel}
        tabIndex={0}
        style={{ width: '100%', height: '100%' }}
      />
      {!loaded && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            background: 'var(--surface-2)',
            borderRadius: 'var(--radius-md)',
          }}
          className="animate-pulse"
        />
      )}
      {map && (
        <MapContext.Provider value={{ map }}>{children}</MapContext.Provider>
      )}
    </div>
  );
}
