import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap, useMapEvents, ScaleControl } from "react-leaflet";
import * as L from "leaflet";
import * as XLSX from "xlsx";
import html2canvas from "html2canvas";
import { cn } from "@/src/lib/utils";
import { scaleSequential, scaleThreshold } from "d3-scale";
import {
  interpolateYlOrRd, interpolateViridis, interpolateMagma, interpolateInferno,
  interpolatePlasma, interpolateBlues, interpolateGreens, interpolateReds,
  interpolatePurples, interpolateOranges, interpolateCool, interpolateWarm,
  interpolateRdYlGn, interpolateSpectral, interpolateBrBG, interpolateYlGnBu,
  schemeYlOrRd, schemeBlues, schemeGreens, schemeReds, schemePurples,
  schemeOranges, schemeRdYlGn, schemeSpectral, schemeBrBG, schemeYlGnBu
} from "d3-scale-chromatic";
import { BarChart, Bar, Cell, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { motion } from "motion/react";
import { Globe, Upload, Map as MapIcon, ZoomIn, ZoomOut, Home, Settings2, ArrowRight, Layers, FileSpreadsheet, Palette, Filter, Eye, BarChart2, FileText, ChevronLeft, ChevronRight, SlidersHorizontal, AlertCircle, Table2, Info, Search, TrendingUp, Crosshair, Database, Move } from "lucide-react";
import { Marker } from "react-leaflet";

/* ── Palettes ─────────────────────────────────────────────────────────────── */
const COLOR_PALETTES: { [key: string]: { interpolator: any; scheme: any } } = {
  "Yellow-Orange-Red": { interpolator: interpolateYlOrRd, scheme: schemeYlOrRd },
  "Viridis": { interpolator: interpolateViridis, scheme: null },
  "Magma": { interpolator: interpolateMagma, scheme: null },
  "Inferno": { interpolator: interpolateInferno, scheme: null },
  "Plasma": { interpolator: interpolatePlasma, scheme: null },
  "Blues": { interpolator: interpolateBlues, scheme: schemeBlues },
  "Greens": { interpolator: interpolateGreens, scheme: schemeGreens },
  "Reds": { interpolator: interpolateReds, scheme: schemeReds },
  "Purples": { interpolator: interpolatePurples, scheme: schemePurples },
  "Oranges": { interpolator: interpolateOranges, scheme: schemeOranges },
  "Cool": { interpolator: interpolateCool, scheme: null },
  "Warm": { interpolator: interpolateWarm, scheme: null },
  "Red-Yellow-Green": { interpolator: interpolateRdYlGn, scheme: schemeRdYlGn },
  "Spectral": { interpolator: interpolateSpectral, scheme: schemeSpectral },
  "Brown-BlueGreen": { interpolator: interpolateBrBG, scheme: schemeBrBG },
  "Yellow-Green-Blue": { interpolator: interpolateYlGnBu, scheme: schemeYlGnBu },
};

/* ── Base maps ────────────────────────────────────────────────────────────── */
const BASEMAPS: { [key: string]: { url: string; attribution: string; label: string } } = {
  osm: { url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", attribution: "© OpenStreetMap", label: "OpenStreetMap" },
  satellite: { url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", attribution: "© Esri", label: "Sputnik (Esri)" },
  topo: { url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", attribution: "© OpenTopoMap", label: "Topografik" },
  light: { url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", attribution: "© CartoDB", label: "Oq (CartoDB)" },
  dark: { url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", attribution: "© CartoDB", label: "Qora (CartoDB)" },
  none: { url: "", attribution: "", label: "Fonisiz" },
};

// Fix Leaflet icon
// @ts-ignore
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface ExcelRow { [key: string]: any; }
interface Mapping { geoKey: string; excelKey: string; valueKey: string; }

/* ── Fit bounds helper ───────────────────────────────────────────────────── */
function FitBounds({ data }: { data: any }) {
  const map = useMap();
  useEffect(() => {
    if (data) map.fitBounds(L.geoJSON(data).getBounds());
  }, [data, map]);
  return null;
}

/* ── Coordinate tracker ──────────────────────────────────────────────────── */
function CoordTracker({ onCoord }: { onCoord: (c: { lat: number; lng: number } | null) => void }) {
  useMapEvents({
    mousemove: (e) => onCoord({ lat: e.latlng.lat, lng: e.latlng.lng }),
    mouseout: () => onCoord(null),
  });
  return null;
}

/* ── Zoom controller ─────────────────────────────────────────────────────── */
function MapController({ action }: { action: string | null }) {
  const map = useMap();
  useEffect(() => {
    if (!action) return;
    if (action === "zoomin") map.zoomIn();
    if (action === "zoomout") map.zoomOut();
    if (action === "home") map.setView([41.3, 63.9], 6);
  }, [action, map]);
  return null;
}

/* ── Section label ───────────────────────────────────────────────────────── */
function SLabel({ icon: Icon, label, color = "bg-teal-500" }: { icon: any; label: string; color?: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={cn("w-1 h-3.5 rounded-sm", color)} />
      <span className="text-[10px] font-bold uppercase text-slate-400 tracking-widest">{label}</span>
      {Icon && <Icon size={10} className="text-slate-600 ml-auto" />}
    </div>
  );
}

/* ── StyledSelect ────────────────────────────────────────────────────────── */
function StyledSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void; options: string[]; placeholder: string;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-xs font-medium text-slate-200 outline-none appearance-none hover:border-slate-600 transition-colors cursor-pointer">
      <option value="" className="bg-slate-900">{placeholder}</option>
      {options.map(o => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
    </select>
  );
}

/* ── Map Labels ──────────────────────────────────────────────────────────── */
function MapLabels({ geoData, mapping, labelProperty, excelData, labelSize, isLabelMode, labelPositions, setLabelPositions }: any) {
  const map = useMap();
  const [centers, setCenters] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    if (!geoData || !labelProperty) return;
    const newCenters: Record<string, { lat: number; lng: number }> = {};
    const layer = L.geoJSON(geoData);
    layer.eachLayer((l: any) => {
      if (l.feature && l.getBounds) {
        const key = normalizeKey(l.feature.properties[mapping.geoKey]);
        newCenters[key] = l.getBounds().getCenter();
      }
    });
    setCenters(newCenters);
  }, [geoData, mapping.geoKey, labelProperty]);

  if (!labelProperty) return null;

  return (
    <>
      {geoData.features.map((feature: any) => {
        const key = normalizeKey(feature.properties[mapping.geoKey]);
        const excelRow = excelData.find((r: any) => normalizeKey(r[mapping.excelKey]) === key);
        const txt = excelRow?.[labelProperty] || feature.properties[labelProperty] || "";
        if (!txt) return null;

        const pos = labelPositions[key] || centers[key];
        if (!pos) return null;

        const icon = L.divIcon({
          className: "custom-text-marker",
          html: `<div class="leaflet-tooltip custom-label" style="font-size:${labelSize}px;font-weight:700;color:#0f172a;padding:2px 6px;display:inline-block;cursor:${isLabelMode ? 'grab' : 'default'}">${txt}</div>`,
          iconSize: [0, 0],
        });

        return (
          <Marker
            key={key}
            position={pos}
            icon={icon}
            draggable={isLabelMode}
            eventHandlers={{
              dragend: (e) => {
                const m = e.target;
                setLabelPositions((prev: any) => ({ ...prev, [key]: m.getLatLng() }));
              }
            }}
          />
        );
      })}
    </>
  );
}

/* ── Region Mini Charts ──────────────────────────────────────────────────── */
function RegionMiniCharts({ geoData, mapping, dataLookup, colorScale, stats, excelData, regionChartCols }: any) {
  const [centers, setCenters] = useState<Record<string, { lat: number; lng: number }>>({});

  useEffect(() => {
    if (!geoData) return;
    const newCenters: Record<string, { lat: number; lng: number }> = {};
    const layer = L.geoJSON(geoData);
    layer.eachLayer((l: any) => {
      if (l.feature && l.getBounds) {
        const key = normalizeKey(l.feature.properties[mapping.geoKey]);
        newCenters[key] = l.getBounds().getCenter();
      }
    });
    setCenters(newCenters);
  }, [geoData, mapping.geoKey]);

  const BAR_H = 30;
  const BAR_W = 6;
  const GAP = 2;
  const COL_COLORS = ['#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#f59e0b', '#10b981'];
  const maxVal = stats.max || 1;

  return (
    <>
      {geoData.features.map((feature: any) => {
        const key = normalizeKey(feature.properties[mapping.geoKey]);
        const pos = centers[key];
        if (!pos) return null;

        const excelRow = excelData?.find((r: any) => normalizeKey(r[mapping.excelKey]) === key);

        let bars: { h: number; color: string; label: string }[] = [];

        if (regionChartCols.length > 0 && excelRow) {
          // Foydalanuvchi tanlagan ustunlar bo'yicha
          bars = regionChartCols.map((col: string, i: number) => {
            const v = parseFloat(excelRow[col]);
            const val = isNaN(v) ? 0 : v;
            // Per-column max for better visual
            return { h: Math.max(2, (val / maxVal) * BAR_H), color: COL_COLORS[i % COL_COLORS.length], label: col };
          });
        } else {
          // Standart: hozirgi valueKey bo'yicha bitta bar
          const val = dataLookup.get(key);
          if (val === undefined) return null;
          bars = [{ h: Math.max(2, (val / maxVal) * BAR_H), color: colorScale(val), label: String(Math.round(val)) }];
        }

        if (bars.length === 0) return null;

        const totalW = bars.length * (BAR_W + GAP) - GAP;
        const svgRects = bars
          .map((b, i) => {
            const x = i * (BAR_W + GAP);
            return `<rect x="${x}" y="${BAR_H - b.h}" width="${BAR_W}" height="${b.h}" fill="${b.color}" rx="1.5"/>`;
          })
          .join('');

        const html = `
          <div style="
            background:transparent;
            padding:2px 3px 0 3px;
            pointer-events:none;
          ">
            <svg width="${totalW}" height="${BAR_H}" xmlns="http://www.w3.org/2000/svg">
              ${svgRects}
            </svg>
          </div>`;

        const iconW = totalW + 8;
        const iconH = BAR_H + 6;
        const icon = L.divIcon({
          className: '',
          html,
          iconSize: [iconW, iconH],
          iconAnchor: [iconW / 2, iconH / 2],
        });

        return <Marker key={`mc-${key}`} position={pos} icon={icon} interactive={false} />;
      })}
    </>
  );
}

/* ── Stat.uz Indicator list ─────────────────────────────────────────────── */
const STAT_INDICATORS: { id: string; label: string; unit: string }[] = [
  // Tug'ilish / vafot / nikoh
  { id: "223", label: "Tug'ilganlar soni (jami)", unit: "kishi" },
  { id: "224", label: "Tug'ilganlar soni (qiz bolalar)", unit: "kishi" },
  { id: "225", label: "Tug'ilganlar soni (o'g'il bolalar)", unit: "kishi" },
  { id: "226", label: "Vafot etganlar soni (jami)", unit: "kishi" },
  { id: "227", label: "Vafot etganlar (ayollar)", unit: "kishi" },
  { id: "228", label: "Vafot etganlar (erkaklar)", unit: "kishi" },
  { id: "229", label: "O'lim koeffitsienti (jami)", unit: "" },
  { id: "241", label: "Tug'ilish koeffitsienti (jami)", unit: "" },
  { id: "243", label: "Tuzilgan nikohlar (jami)", unit: "ta" },
  { id: "230", label: "Nikohdan ajralishlar (jami)", unit: "ta" },
  { id: "238", label: "Ko'chib kelganlar (jami)", unit: "kishi" },
  { id: "239", label: "Ko'chib ketganlar (jami)", unit: "kishi" },
  { id: "268", label: "Ko'chib kelganlar xorijdan", unit: "kishi" },
  { id: "269", label: "Ko'chib ketganlar xorijga", unit: "kishi" },
  { id: "295", label: "Tug'ilishda kutilayotgan umr davomiyligi", unit: "yil" },
  { id: "665", label: "Tug'ilishning yig'indi koeffitsienti", unit: "" },
  // Aholi soni (asosiy)
  { id: "244", label: "Doimiy aholi (ayol)", unit: "ming kishi" },
  { id: "245", label: "Doimiy aholi (erkak)", unit: "ming kishi" },
  { id: "246", label: "Doimiy aholi (jami)", unit: "ming kishi" },
  { id: "247", label: "Doimiy aholi (qishloq)", unit: "ming kishi" },
  { id: "248", label: "Doimiy aholi (shahar)", unit: "ming kishi" },
  { id: "236", label: "Aholi zichligi", unit: "kishi/km²" },
  { id: "2835", label: "Mehnatga layoqatli yoshdagi aholi", unit: "ming kishi" },
  // Yosh guruhlari
  { id: "561", label: "0–2 yoshdagi aholi", unit: "ming kishi" },
  { id: "2838", label: "3–5 yoshdagi aholi", unit: "ming kishi" },
  { id: "589", label: "6–7 yoshdagi aholi", unit: "ming kishi" },
  { id: "600", label: "8–15 yoshdagi aholi", unit: "ming kishi" },
  { id: "607", label: "16–17 yoshdagi aholi", unit: "ming kishi" },
  { id: "617", label: "18–19 yoshdagi aholi", unit: "ming kishi" },
  { id: "626", label: "20–24 yoshdagi aholi", unit: "ming kishi" },
  { id: "632", label: "25–29 yoshdagi aholi", unit: "ming kishi" },
  { id: "638", label: "30–34 yoshdagi aholi", unit: "ming kishi" },
  { id: "643", label: "35–39 yoshdagi aholi", unit: "ming kishi" },
  { id: "647", label: "40–49 yoshdagi aholi", unit: "ming kishi" },
  { id: "650", label: "50–59 yoshdagi aholi", unit: "ming kishi" },
  { id: "1190", label: "60–64 yoshdagi aholi", unit: "ming kishi" },
  { id: "1191", label: "65+ yoshdagi aholi", unit: "ming kishi" },
];

/* ════════════════════════════════════════════════════════════════════════════
   MAIN APP
   ════════════════════════════════════════════════════════════════════════════ */

const normalizeKey = (str: any) => String(str || "").toLowerCase().trim().replace(/['‘`ʼ]/g, "");

export default function App() {
  /* state */
  const [geoData, setGeoData] = useState<any>(null);
  const [excelData, setExcelData] = useState<ExcelRow[]>([]);
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [geoProperties, setGeoProperties] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Mapping>({ geoKey: "", excelKey: "", valueKey: "" });
  const [showAttributeKey, setShowAttributeKey] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"upload" | "map">("upload");
  const [mapTitle, setMapTitle] = useState<string>("GeoVizor Xaritasi");
  const [colorPalette, setColorPalette] = useState<keyof typeof COLOR_PALETTES>("Yellow-Orange-Red");
  const [borderWidth, setBorderWidth] = useState<number>(1);

  const [baseMapKey, setBaseMapKey] = useState<string>("osm");
  const [classificationType, setClassificationType] = useState<"continuous" | "equal" | "quantile">("continuous");
  const [numClasses, setNumClasses] = useState<number>(5);
  const [labelProperty, setLabelProperty] = useState<string>("");
  const [leftPanelOpen, setLeftPanelOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [valueUnit, setValueUnit] = useState<string>("ming kishi");
  const [fillOpacity, setFillOpacity] = useState<number>(0.75);
  const [coord, setCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [zoom, setZoom] = useState<number>(6);
  const [mapAction, setMapAction] = useState<string | null>(null);
  const [labelSize, setLabelSize] = useState<number>(11);
  const [selectedFeature, setSelectedFeature] = useState<any>(null);
  const [rightTab, setRightTab] = useState<"attributes" | "info" | "chart">("attributes");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [isLabelMode, setIsLabelMode] = useState<boolean>(false);
  const layoutMode = false;
  const [labelPositions, setLabelPositions] = useState<Record<string, { lat: number; lng: number }>>({});
  const [selectedIndicator, setSelectedIndicator] = useState<string>("246");
  const [isFetchingApi, setIsFetchingApi] = useState(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showScale, setShowScale] = useState<boolean>(true);
  const [showNorthArrow, setShowNorthArrow] = useState<boolean>(true);
  const [showCoordinates, setShowCoordinates] = useState<boolean>(true);
  const [legendPosition, setLegendPosition] = useState<"br" | "bl" | "tr" | "tl">("br");
  const [showAttribution, setShowAttribution] = useState<boolean>(true);
  const mapRef = useRef<HTMLDivElement>(null);

  // Multi-year data support
  const [selectedYears, setSelectedYears] = useState<string[]>(["2025", "2024", "2023"]);
  const [multiYearData, setMultiYearData] = useState<{ [year: string]: ExcelRow[] }>({});
  const [chartDataByYear, setChartDataByYear] = useState<{ [key: string]: { [year: string]: number } }>({});
  const [showMapChart, setShowMapChart] = useState<boolean>(false);
  const [showRegionCharts, setShowRegionCharts] = useState<boolean>(false);
  const [regionChartCols, setRegionChartCols] = useState<string[]>([]);
  const [cacheSource, setCacheSource] = useState<"" | "localStorage" | "server" | "network">("")

  /* ── localStorage cache helpers ────────────────────────────────────────── */
  const LS_TTL = 60 * 60 * 1000; // 1 soat
  const lsGet = (key: string) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const { t, d } = JSON.parse(raw);
      if (Date.now() - t > LS_TTL) { localStorage.removeItem(key); return null; }
      return d;
    } catch { return null; }
  };
  const lsSet = (key: string, data: any) => {
    try { localStorage.setItem(key, JSON.stringify({ t: Date.now(), d: data })); } catch { }
  };
  const lsClear = () => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith("geovizor_api_"));
    keys.forEach(k => localStorage.removeItem(k));
    return keys.length;
  };

  /* ── File handlers ─────────────────────────────────────────────────────── */
  const handleGeoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const json = JSON.parse(ev.target?.result as string);
        setGeoData(json);
        if (json.features?.length > 0) {
          const props = Object.keys(json.features[0].properties || {});
          setGeoProperties(props);
          if (props.length > 0) setMapping(prev => ({ ...prev, geoKey: props[0] }));
        }
      } catch { alert("Noto'g'ri GeoJSON fayl"); }
    };
    reader.readAsText(file);
  };

  const handleExcelUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws) as ExcelRow[];
      setExcelData(json);
      if (json.length > 0) {
        const cols = Object.keys(json[0]);
        setExcelColumns(cols);
        setMapping(prev => ({ ...prev, excelKey: cols[0], valueKey: cols[1] || cols[0] }));
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const fetchApiData = async () => {
    if (!selectedIndicator || selectedYears.length === 0) return;
    setIsFetchingApi(true);
    setCacheSource("");
    const indicatorMeta = STAT_INDICATORS.find(i => i.id === selectedIndicator);
    const lsKey = `geovizor_api_${selectedIndicator}`;

    const processData = (json: any, source: "localStorage" | "server" | "network") => {
      if (json && json[0] && json[0].data) {
        const data = json[0].data as ExcelRow[];
        const cols = Object.keys(data[0] || {});
        const geoKeyCol = cols.includes("Klassifikator") ? "Klassifikator" : cols[0];
        const newChartDataByYear: { [key: string]: { [year: string]: number } } = {};
        const newMultiYearData: { [year: string]: ExcelRow[] } = {};

        selectedYears.forEach(year => { newMultiYearData[year] = data; });

        data.forEach((row: ExcelRow) => {
          const regionKey = normalizeKey(row[geoKeyCol]);
          if (!regionKey) return;
          selectedYears.forEach(year => {
            const value = parseFloat(row[year]);
            if (!isNaN(value)) {
              if (!newChartDataByYear[regionKey]) newChartDataByYear[regionKey] = {};
              newChartDataByYear[regionKey][year] = value;
            }
          });
        });

        const latestYear = selectedYears[0];
        setExcelData(data);
        setMultiYearData(newMultiYearData);
        setChartDataByYear(newChartDataByYear);
        setExcelColumns(cols);
        setMapping(prev => ({ ...prev, excelKey: geoKeyCol, valueKey: latestYear }));
        if (indicatorMeta?.unit) setValueUnit(indicatorMeta.unit);
        if (indicatorMeta?.label) {
          const yearLabel = selectedYears.length > 1
            ? `${indicatorMeta.label} (${selectedYears.join(", ")})`
            : `${indicatorMeta.label} (${latestYear})`;
          setMapTitle(yearLabel);
        }
        setCacheSource(source);
        return true;
      }
      return false;
    };

    try {
      // 1️⃣ localStorage keshidan o'qish
      const lsCached = lsGet(lsKey);
      if (lsCached) {
        console.log("[Cache] localStorage HIT:", lsKey);
        if (processData(lsCached, "localStorage")) {
          setIsFetchingApi(false);
          return;
        }
      }

      // 2️⃣ Server proxy orqali yuklash (server o'zi disk kesh ishlatadi)
      const targetUrl = `https://api.siat.stat.uz/media/uploads/sdmx/sdmx_data_${selectedIndicator}.json`;
      const res = await fetch(`/api/proxy?url=${encodeURIComponent(targetUrl)}`);
      const fromServerCache = res.headers.get("X-Cache") === "HIT";
      if (!res.ok) throw new Error(`Server xatosi: ${res.status}`);
      const json = await res.json();

      const source = fromServerCache ? "server" : "network";
      if (processData(json, source)) {
        // localStorage ga ham saqlash
        lsSet(lsKey, json);
        console.log(`[Cache] localStorage WRITE: ${lsKey} (manba: ${source})`);
      } else {
        alert("Noto'g'ri ma'lumot formati. Ushbu indikator kodi uchun ma'lumot topilmadi.");
      }
    } catch (e: any) {
      console.error(e);
      alert(`API dan ma'lumot yuklashda xatolik: ${e.message}`);
    } finally {
      setIsFetchingApi(false);
    }
  };

  /* ── Data ──────────────────────────────────────────────────────────────── */
  const dataLookup = useMemo(() => {
    const m = new Map<string, number>();
    if (!mapping.excelKey || !mapping.valueKey || !geoData) return m;

    // 1. Faqat GeoJSON da bor bo'lgan hududlarni yig'ib olamiz (O'zbekiston Respublikasi kabi umumiy summalarni chetlab o'tish uchun)
    const validGeoKeys = new Set<string>();
    geoData.features.forEach((f: any) => {
      const k = normalizeKey(f.properties[mapping.geoKey]);
      if (k) validGeoKeys.add(k);
    });

    // 2. Excel/API dan kelgan ma'lumotlarni faqat yaroqli hududlar uchun map'ga qo'shamiz
    excelData.forEach(row => {
      const key = normalizeKey(row[mapping.excelKey]);
      const val = parseFloat(row[mapping.valueKey]);
      if (!isNaN(val) && validGeoKeys.has(key)) {
        m.set(key, val);
      }
    });
    return m;
  }, [excelData, mapping.excelKey, mapping.valueKey, geoData, mapping.geoKey]);

  const stats = useMemo(() => {
    const vals = Array.from(dataLookup.values());
    if (!vals.length) return { min: 0, max: 1, total: 0, avg: 0, count: 0, stddev: 0, median: 0 };
    const sorted = [...vals].sort((a, b) => a - b);
    const total = vals.reduce((a, b) => a + b, 0);
    const avg = total / vals.length;
    const stddev = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / vals.length);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    return { min: Math.min(...vals), max: Math.max(...vals), total, avg: Math.round(avg), count: vals.length, stddev: Math.round(stddev), median: Math.round(median) };
  }, [dataLookup]);

  const colorScale = useMemo(() => {
    const pal = COLOR_PALETTES[colorPalette];
    const vals = Array.from(dataLookup.values());
    if (classificationType === "continuous" || !vals.length)
      return scaleSequential(pal.interpolator).domain([stats.min, stats.max]);

    let thresholds: number[] = [];
    if (classificationType === "equal") {
      const step = (stats.max - stats.min) / numClasses;
      thresholds = Array.from({ length: numClasses - 1 }, (_, i) => stats.min + step * (i + 1));
    } else {
      const sorted = [...vals].sort((a, b) => a - b);
      thresholds = Array.from({ length: numClasses - 1 }, (_, i) => {
        const idx = Math.floor((sorted.length / numClasses) * (i + 1));
        return sorted[idx];
      });
    }
    let colors: string[] = pal.scheme
      // @ts-ignore
      ? (pal.scheme[numClasses] || pal.scheme[pal.scheme.length - 1])
      : Array.from({ length: numClasses }, (_, i) => pal.interpolator(i / (numClasses - 1)));
    return scaleThreshold<number, string>().domain(thresholds).range(colors);
  }, [stats, colorPalette, classificationType, numClasses, dataLookup]);

  const getStyle = useCallback((feature: any) => {
    const key = normalizeKey(feature.properties[mapping.geoKey]);
    const val = dataLookup.get(key);
    return {
      fillColor: val !== undefined ? colorScale(val) : "#334155",
      weight: borderWidth, opacity: 1, color: "#475569", fillOpacity,
    };
  }, [dataLookup, mapping.geoKey, colorScale, borderWidth, fillOpacity]);

  const onEachFeature = (feature: any, layer: L.Layer) => {
    const key = normalizeKey(feature.properties[mapping.geoKey]);
    const value = dataLookup.get(key);
    const excelRow = excelData.find(r => normalizeKey(r[mapping.excelKey]) === key);
    const displayLabel = showAttributeKey && excelRow ? excelRow[showAttributeKey] : feature.properties[mapping.geoKey];

    // Tooltip is now handled separately by MapLabels component

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ fillOpacity: Math.min(fillOpacity + 0.15, 1), weight: 2.5, color: "#14b8a6" });
      },
      mouseout: (e) => {
        e.target.setStyle({ fillOpacity, weight: borderWidth, color: "#475569" });
      },
      click: () => {
        setSelectedFeature({ name: displayLabel, value, unit: valueUnit, key, excelRow, geoProps: feature.properties });
        setRightTab("info");
        setRightPanelOpen(true);
      }
    });
  };

  /* ── Legend ────────────────────────────────────────────────────────────── */




  const legendLabels = useMemo(() => {
    if (classificationType === "continuous") return [];
    const vals = Array.from(dataLookup.values());
    if (!vals.length) return [];
    let thresholds: number[] = [];
    if (classificationType === "equal") {
      const step = (stats.max - stats.min) / numClasses;
      thresholds = Array.from({ length: numClasses - 1 }, (_, i) => stats.min + step * (i + 1));
    } else {
      const sorted = [...vals].sort((a, b) => a - b);
      thresholds = Array.from({ length: numClasses - 1 }, (_, i) => {
        const idx = Math.floor((sorted.length / numClasses) * (i + 1));
        return sorted[idx];
      });
    }
    const ranges = [stats.min, ...thresholds, stats.max];
    return Array.from({ length: ranges.length - 1 }, (_, i) => ({
      color: colorScale((ranges[i] + ranges[i + 1]) / 2 as any),
      label: `${Math.round(ranges[i]).toLocaleString()} – ${Math.round(ranges[i + 1]).toLocaleString()}`
    }));
  }, [dataLookup, colorScale, classificationType, numClasses, stats]);

  /* ── Ranked data ───────────────────────────────────────────────────────── */
  const rankedData = useMemo(() => {
    const groupKey = showAttributeKey || mapping.excelKey;
    return Array.from(dataLookup.entries())
      .map(([key, val]) => {
        const record = excelData.find(r => normalizeKey(r[mapping.excelKey]) === key);
        const name = String(record?.[groupKey] || key);
        return { name, val, key, color: colorScale(val) };
      })
      .sort((a, b) => b.val - a.val);
  }, [dataLookup, showAttributeKey, excelData, mapping.excelKey, colorScale]);

  const filteredData = useMemo(() =>
    rankedData.filter(d => d.name.toLowerCase().includes(searchQuery.toLowerCase()))
    , [rankedData, searchQuery]);



  /* ────────────────────────────────────────────────────────────────────────
     RENDER
     ──────────────────────────────────────────────────────────────────────── */
  return (
    <div className="h-screen flex flex-col bg-[#1e2130] text-slate-200 font-sans overflow-hidden">

      {/* ══ HEADER — GIS Toolbar style ══════════════════════════════════════ */}
      <header className="h-10 bg-[#151824] flex items-center px-3 gap-0 shrink-0 border-b border-slate-800/80 z-[3000]">
        {/* Brand */}
        <div className="flex items-center gap-2 pr-4 border-r border-slate-800">
          <div className="w-6 h-6 bg-gradient-to-br from-teal-400 to-teal-600 rounded flex items-center justify-center">
            <Globe size={13} className="text-white" />
          </div>
          <span className="text-xs font-bold text-white tracking-wide">GeoVizor</span>
          <span className="text-[9px] bg-teal-600/20 text-teal-400 border border-teal-600/30 px-1.5 py-0.5 rounded font-mono">v2.1</span>
        </div>

        {/* Nav tabs */}
        <div className="flex items-center gap-0.5 px-3 border-r border-slate-800">
          {[
            { id: "upload", label: "Ma'lumotlar", icon: Upload },
            { id: "map", label: "Xarita", icon: MapIcon, disabled: !geoData },
          ].map(({ id, label, icon: Icon, disabled }) => (
            <button
              key={id}
              disabled={disabled}
              onClick={() => setActiveTab(id as any)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold rounded transition-all disabled:opacity-30",
                activeTab === id ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-800"
              )}
            >
              <Icon size={12} />{label}
            </button>
          ))}
        </div>

        {/* GIS Tools (map view only) */}
        {activeTab === "map" && (
          <div className="flex items-center gap-0.5 px-3 border-r border-slate-800">
            {[
              { id: "zoomin", icon: ZoomIn, title: "Kattalashtirish" },
              { id: "zoomout", icon: ZoomOut, title: "Kichiklashtirish" },
              { id: "home", icon: Home, title: "Boshlanish holatiga qaytish" },
            ].map(({ id, icon: Icon, title }) => (
              <button key={id} title={title}
                onClick={() => { setMapAction(id); setTimeout(() => setMapAction(null), 100); }}
                className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors">
                <Icon size={13} />
              </button>
            ))}
            <button
              title={showMapChart ? "Xarita grafikini yashirish" : "Xarita grafikini ko'rsatish"}
              onClick={() => setShowMapChart(v => !v)}
              className={cn("p-1.5 rounded transition-colors",
                showMapChart ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"
              )}
            >
              <BarChart2 size={13} />
            </button>
            <button
              title={showRegionCharts ? "Viloyat chartlarini yashirish" : "Viloyat chartlarini ko'rsatish"}
              onClick={() => setShowRegionCharts(v => !v)}
              className={cn("p-1.5 rounded transition-colors flex items-center gap-1 text-[10px] font-bold",
                showRegionCharts ? "bg-violet-600 text-white" : "text-slate-400 hover:text-white hover:bg-slate-700"
              )}
            >
              <BarChart2 size={13} />
              <span>Hz</span>
            </button>
          </div>
        )}



        {/* Status */}
        <div className="ml-auto flex items-center gap-3 pr-2">
          <div className="flex items-center gap-1.5">
            <div className={cn("w-1.5 h-1.5 rounded-full",
              geoData && excelData.length ? "bg-teal-400 shadow-[0_0_6px_rgba(45,212,191,0.7)]" : "bg-amber-400"
            )} />
            <span className="text-[10px] text-slate-500">
              {geoData && excelData.length ? `${geoData.features.length} obyekt · ${excelData.length} yozuv` : "Ma'lumot kutilmoqda"}
            </span>
          </div>
        </div>
      </header>

      {/* ══ MAIN ════════════════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-hidden flex flex-col">

        {activeTab === "upload" ? (
          /* ═══ UPLOAD VIEW ═══════════════════════════════════════════════ */
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="flex-1 overflow-y-auto p-8 bg-[#1e2130]">
            <div className="max-w-3xl mx-auto space-y-8">

              <div className="text-center space-y-2 py-4">
                <h2 className="text-3xl font-extrabold tracking-tight text-white">
                  Geodata <span className="text-teal-400">Vizualizator</span>
                </h2>
                <p className="text-sm text-slate-500">GeoJSON va Excel yuklang — interaktiv xarita yarating</p>
              </div>

              {/* Upload cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                  { label: "GeoJSON / JSON", hint: "Hududiy chegaralar", accept: ".geojson,.json", onChange: handleGeoUpload, loaded: !!geoData, info: geoData ? `${geoData.features.length} ta obyekt` : null, icon: Layers },
                  { label: "Excel / CSV", hint: "Statistik jadval", accept: ".xlsx,.xls,.csv", onChange: handleExcelUpload, loaded: excelData.length > 0, info: excelData.length > 0 ? `${excelData.length} yozuv · ${excelColumns.length} ustun` : null, icon: FileSpreadsheet },
                ].map(({ label, hint, accept, onChange, loaded, info, icon: Icon }) => (
                  <label key={label} className={cn(
                    "relative rounded-xl border-2 border-dashed p-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group",
                    loaded ? "border-teal-500/50 bg-teal-500/5" : "border-slate-700 bg-slate-800/40 hover:border-slate-600 hover:bg-slate-800/60"
                  )}>
                    <input type="file" accept={accept} onChange={onChange} className="hidden" />
                    <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                      loaded ? "bg-teal-500/20 text-teal-400" : "bg-slate-700 text-slate-500 group-hover:text-slate-300"
                    )}>
                      <Icon size={20} />
                    </div>
                    <div className="text-center">
                      <p className="font-bold text-[13px] text-white">{loaded ? `${label} yuklandi ✓` : label}</p>
                      <p className="text-[11px] text-slate-500 mt-1">{info || hint}</p>
                    </div>
                  </label>
                ))}

                {/* API Fetch Card */}
                <div className={cn(
                  "relative rounded-xl border-2 border-slate-700 bg-slate-800/40 p-5 flex flex-col items-center justify-center gap-2 transition-all",
                  isFetchingApi ? "border-teal-500/50 bg-teal-500/5" : "hover:border-slate-600 hover:bg-slate-800/60"
                )}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-slate-700 text-slate-400">
                    <Database size={20} />
                  </div>
                  <div className="text-center w-full">
                    <p className="font-bold text-[13px] text-white mb-2">API dan yuklash</p>
                    <div className="flex flex-col gap-2 w-full mt-1">
                      <select
                        value={selectedIndicator}
                        onChange={e => setSelectedIndicator(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1.5 text-xs text-white outline-none focus:border-teal-500"
                      >
                        {STAT_INDICATORS.map(ind => (
                          <option key={ind.id} value={ind.id}>
                            {ind.label}
                          </option>
                        ))}
                      </select>

                      <button
                        onClick={fetchApiData}
                        disabled={isFetchingApi || !selectedIndicator || selectedYears.length === 0}
                        className="bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white rounded px-3 py-1.5 text-xs font-bold transition-colors w-full"
                      >
                        {isFetchingApi ? "Yuklanmoqda..." : "Yuklash"}
                      </button>

                      {/* Cache source badge */}
                      {cacheSource && (
                        <div className={cn(
                          "flex items-center justify-center gap-1.5 px-2 py-1 rounded text-[10px] font-bold border",
                          cacheSource === "localStorage" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                            cacheSource === "server" ? "bg-sky-500/10 text-sky-400 border-sky-500/30" :
                              "bg-amber-500/10 text-amber-400 border-amber-500/30"
                        )}>
                          <span>{cacheSource === "localStorage" ? "⚡ Brauzer keshidan" : cacheSource === "server" ? "💾 Server keshidan" : "🌐 Tarmoqdan yuklandi"}</span>
                        </div>
                      )}

                      {/* Clear cache button */}
                      <button
                        onClick={() => {
                          const n = lsClear();
                          setCacheSource("");
                          alert(`${n} ta brauzer keshi tozalandi`);
                        }}
                        className="text-[10px] text-slate-600 hover:text-red-400 transition-colors underline"
                      >
                        Brauzer keshini tozalash
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Settings */}
              <div className="bg-[#151824] rounded-xl p-6 border border-slate-800">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-teal-600 rounded-lg flex items-center justify-center">
                    <Settings2 size={16} className="text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white">Konfiguratsiya</h3>
                    <p className="text-[11px] text-slate-500">Ma'lumotlarni bog'lash</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-5">
                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Chegara ID (GeoJSON)</label>
                      <StyledSelect value={mapping.geoKey} onChange={v => setMapping(p => ({ ...p, geoKey: v }))} options={geoProperties} placeholder="Tanlang..." />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Jadval ID (Excel)</label>
                      <StyledSelect value={mapping.excelKey} onChange={v => setMapping(p => ({ ...p, excelKey: v }))} options={excelColumns} placeholder="Tanlang..." />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Asosiy qiymat (Heatmap)</label>
                      <select value={mapping.valueKey} onChange={e => setMapping(p => ({ ...p, valueKey: e.target.value }))}
                        className="w-full bg-teal-700 border-none rounded-lg px-3 py-2.5 text-xs font-bold text-white outline-none hover:bg-teal-600 cursor-pointer appearance-none transition-colors">
                        <option value="">Metrikani tanlang</option>
                        {excelColumns.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">O'lchov birligi</label>
                      <input type="text" value={valueUnit} onChange={e => setValueUnit(e.target.value)} placeholder="ming kishi, %, so'm..."
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-teal-500 transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Xarita sarlavhasi</label>
                      <input type="text" value={mapTitle} onChange={e => setMapTitle(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-xs text-slate-200 outline-none focus:border-teal-500 transition-colors" placeholder="Sarlavha..." />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Namoyish atributi</label>
                      <StyledSelect value={showAttributeKey} onChange={setShowAttributeKey} options={excelColumns} placeholder="Standart..." />
                    </div>
                    <button onClick={() => setActiveTab("map")} disabled={!geoData || !excelData.length}
                      className="w-full py-3 bg-teal-600 text-white rounded-lg font-bold text-xs hover:bg-teal-500 disabled:opacity-20 transition-all flex items-center justify-center gap-2 active:scale-[0.98]">
                      Xaritani ochish <ArrowRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

        ) : (
          /* ═══ MAP VIEW ══════════════════════════════════════════════════ */
          <div className="flex-1 flex overflow-hidden">

            {/* ── LEFT PANEL — Layers & Style ─────────────────────────── */}
            <aside className={cn(
              "bg-[#151824] shrink-0 transition-all duration-200 z-20 flex flex-col border-r border-slate-800",
              leftPanelOpen ? "w-64" : "w-10 items-center"
            )}>
              {leftPanelOpen ? (
                <>
                  {/* Panel header */}
                  <div className="h-9 px-3 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5">
                      <Layers size={12} className="text-teal-400" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Qatlamlar</span>
                    </div>
                    <button onClick={() => setLeftPanelOpen(false)} className="text-slate-600 hover:text-slate-300 p-0.5 rounded">
                      <ChevronLeft size={14} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto p-3 space-y-4 scrollbar-hide">

                    {/* Layer info */}
                    {geoData && (
                      <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/40">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-3 h-3 rounded-sm bg-teal-500" />
                          <span className="text-[11px] font-semibold text-slate-200 truncate">{mapping.valueKey || "Qatlam"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-[9px] text-slate-500">
                          <span>Polygon</span><span className="text-right text-slate-400">{geoData.features.length} ta</span>
                          <span>CRS</span><span className="text-right text-slate-400">WGS 84</span>
                          <span>Birlik</span><span className="text-right text-slate-400">{valueUnit || "—"}</span>
                        </div>
                      </div>
                    )}

                    {/* Color Palette */}
                    <div>
                      <SLabel icon={Palette} label="Rang palitrasi" color="bg-teal-500" />
                      <select value={colorPalette} onChange={e => setColorPalette(e.target.value as any)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-slate-200 outline-none appearance-none cursor-pointer hover:border-slate-600 transition-colors">
                        {Object.keys(COLOR_PALETTES).map(p => <option key={p} value={p} className="bg-slate-900">{p}</option>)}
                      </select>
                      {/* Palette preview */}
                      <div className="mt-2 h-3 rounded" style={{
                        background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) =>
                          COLOR_PALETTES[colorPalette].interpolator(i / 7)).join(",")})`
                      }} />
                    </div>

                    {/* Border width */}
                    <div>
                      <SLabel icon={Filter} label="Chegara qalinligi" color="bg-amber-500" />
                      <div className="flex justify-between text-[10px] mb-1.5">
                        <span className="text-slate-500">Qalinlik</span>
                        <span className="font-mono text-amber-400 font-bold">{borderWidth}px</span>
                      </div>
                      <input type="range" min="0" max="4" step="0.5" value={borderWidth}
                        onChange={e => setBorderWidth(parseFloat(e.target.value))}
                        className="w-full h-1 bg-slate-700 rounded-full appearance-none accent-amber-500" />
                    </div>

                    {/* Transparency */}
                    <div>
                      <SLabel icon={Eye} label="Shaffoflik" color="bg-violet-500" />
                      <div className="flex justify-between text-[10px] mb-1.5">
                        <span className="text-slate-500">Qatlam shaffofligi</span>
                        <span className="font-mono text-violet-400 font-bold">{Math.round(fillOpacity * 100)}%</span>
                      </div>
                      <input type="range" min="0" max="100" step="5" value={Math.round(fillOpacity * 100)}
                        onChange={e => setFillOpacity(parseInt(e.target.value) / 100)}
                        className="w-full h-1 bg-slate-700 rounded-full appearance-none accent-violet-500" />
                    </div>

                    {/* Classification */}
                    <div>
                      <SLabel icon={BarChart2} label="Klassifikatsiya" color="bg-emerald-500" />
                      <div className="grid grid-cols-3 gap-1 mb-2">
                        {([
                          { k: "continuous", l: "Uzluksiz" },
                          { k: "equal", l: "Teng" },
                          { k: "quantile", l: "Kvantil" },
                        ] as const).map(({ k, l }) => (
                          <button key={k} onClick={() => setClassificationType(k)}
                            className={cn("py-1.5 rounded text-[10px] font-semibold transition-all border",
                              classificationType === k ? "bg-emerald-600 border-emerald-500 text-white" : "bg-slate-800 border-slate-700 text-slate-500 hover:text-white"
                            )}>
                            {l}
                          </button>
                        ))}
                      </div>
                      {classificationType !== "continuous" && (
                        <div>
                          <div className="flex justify-between text-[10px] mb-1.5">
                            <span className="text-slate-500">Klasslar soni</span>
                            <span className="font-mono text-emerald-400 font-bold">{numClasses}</span>
                          </div>
                          <input type="range" min="3" max="10" step="1" value={numClasses}
                            onChange={e => setNumClasses(parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-700 rounded-full appearance-none accent-emerald-500" />
                          <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>3</span><span>10</span></div>
                        </div>
                      )}
                    </div>

                    {/* Layer label */}
                    <div>
                      <SLabel icon={FileText} label="Xaritada nom" color="bg-purple-500" />
                      <select value={labelProperty} onChange={e => setLabelProperty(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-2 text-[11px] text-slate-200 outline-none appearance-none cursor-pointer hover:border-slate-600 transition-colors mb-2">
                        <option value="" className="bg-slate-900">Ko'rsatmaslik</option>
                        {excelColumns.map(c => <option key={"e-" + c} value={c} className="bg-slate-900">{c} (Excel)</option>)}
                        {geoProperties.map(p => <option key={"g-" + p} value={p} className="bg-slate-900">{p} (GeoJSON)</option>)}
                      </select>

                      {labelProperty && (
                        <div>
                          <div className="flex justify-between text-[10px] mb-1.5 mt-2">
                            <span className="text-slate-500">Yozuv o'lchami</span>
                            <span className="font-mono text-purple-400 font-bold">{labelSize}px</span>
                          </div>
                          <input type="range" min="8" max="24" step="1" value={labelSize}
                            onChange={e => setLabelSize(parseInt(e.target.value))}
                            className="w-full h-1 bg-slate-700 rounded-full appearance-none accent-purple-500" />
                          <div className="flex justify-between text-[9px] text-slate-700 mt-0.5"><span>8px</span><span>24px</span></div>

                          {/* Toggle for Label movement */}
                          <div className="mt-3 flex items-center justify-between bg-slate-800/80 p-2.5 rounded-lg border border-slate-700/50">
                            <div className="flex items-center gap-1.5">
                              <Move size={12} className={cn("transition-colors", isLabelMode ? "text-teal-400" : "text-slate-500")} />
                              <span className="text-[10px] font-bold text-slate-300">Yozuvni surish</span>
                            </div>
                            <button onClick={() => setIsLabelMode(!isLabelMode)}
                              className={cn("px-2.5 py-1 rounded text-[10px] font-bold transition-all shadow-sm",
                                isLabelMode ? "bg-teal-500 text-white border border-teal-400" : "bg-slate-700 text-slate-400 border border-slate-600 hover:bg-slate-600 hover:text-white"
                              )}>
                              {isLabelMode ? "Yoniq" : "O'chiq"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Basemap */}
                    <div>
                      <SLabel icon={Globe} label="Asosiy xarita" color="bg-sky-500" />
                      <div className="space-y-0.5">
                        {Object.entries(BASEMAPS).map(([k, bm]) => (
                          <button key={k} onClick={() => setBaseMapKey(k)}
                            className={cn("w-full text-left px-3 py-1.5 rounded text-[11px] font-medium transition-all",
                              baseMapKey === k ? "bg-sky-700 text-sky-200" : "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                            )}>
                            {baseMapKey === k && <span className="mr-1.5 text-sky-400">▶</span>}{bm.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Region chart column selector */}
                    {excelColumns.length > 0 && (
                      <div>
                        <SLabel icon={BarChart2} label="Viloyat chart ustunlari" color="bg-violet-500" />
                        <div className="text-[9px] text-slate-600 mb-2">
                          Viloyatlar ustida ko'rsatiladigan ustun(lar)ni tanlang:
                        </div>
                        <div className="space-y-1 max-h-36 overflow-y-auto scrollbar-hide pr-1">
                          {excelColumns.map(col => (
                            <label key={col} className="flex items-center gap-2 cursor-pointer group py-0.5">
                              <input
                                type="checkbox"
                                checked={regionChartCols.includes(col)}
                                onChange={e => {
                                  if (e.target.checked) {
                                    setRegionChartCols(prev => [...prev, col]);
                                  } else {
                                    setRegionChartCols(prev => prev.filter(c => c !== col));
                                  }
                                }}
                                className="w-3 h-3 rounded accent-violet-500 cursor-pointer shrink-0"
                              />
                              <span className={cn(
                                "text-[10px] font-medium truncate transition-colors",
                                regionChartCols.includes(col) ? "text-violet-300" : "text-slate-500 group-hover:text-slate-300"
                              )}>{col}</span>
                            </label>
                          ))}
                        </div>
                        {regionChartCols.length > 0 && (
                          <button
                            onClick={() => setRegionChartCols([])}
                            className="mt-1.5 text-[9px] text-slate-700 hover:text-red-400 transition-colors underline"
                          >
                            Tanlovni tozalash
                          </button>
                        )}
                      </div>
                    )}

                  </div>
                </>
              ) : (
                <div className="py-3 flex flex-col items-center gap-2.5">
                  <button onClick={() => setLeftPanelOpen(true)} className="text-slate-600 hover:text-teal-400 p-1 rounded transition-colors">
                    <ChevronRight size={13} />
                  </button>
                  <Layers size={12} className="text-slate-700" />
                  <Palette size={12} className="text-slate-700" />
                  <SlidersHorizontal size={12} className="text-slate-700" />
                </div>
              )}
            </aside>

            {/* ── MAP ─────────────────────────────────────────────────── */}
            <section className={cn("flex-1 relative flex flex-col overflow-hidden", layoutMode ? "bg-[#0a0f18] p-4 sm:p-12 overflow-auto items-center justify-center" : "")}>

              {layoutMode && (
                <div className="absolute top-4 left-0 right-0 flex justify-center z-50 pointer-events-none">
                  <div className="bg-teal-500/20 text-teal-400 px-4 py-1.5 rounded-full border border-teal-500/30 text-xs font-bold uppercase tracking-widest pointer-events-auto shadow-lg backdrop-blur-sm">
                    Kompanovka Rejimi (A4 Landscape)
                  </div>
                </div>
              )}

              <div ref={mapRef}
                className="relative shrink-0 transition-all duration-500 ease-in-out w-full h-full flex-1"
                style={{ background: baseMapKey === "none" ? "#0f172a" : baseMapKey === "dark" ? "#0d0d12" : "#aad3df" }}>
                <MapContainer center={[41.3, 63.9]} zoom={6} className="w-full h-full" zoomControl={false} scrollWheelZoom>
                  {/* Tracker Removed for performance */}
                  <MapController action={mapAction} />
                  {showScale && <ScaleControl position="bottomleft" imperial={false} />}
                  {baseMapKey !== "none" && BASEMAPS[baseMapKey] && (
                    <TileLayer key={baseMapKey} url={BASEMAPS[baseMapKey].url} attribution={layoutMode ? "" : BASEMAPS[baseMapKey].attribution} crossOrigin="anonymous" />
                  )}
                  {geoData && (
                    <>
                      <GeoJSON data={geoData} style={getStyle} onEachFeature={onEachFeature}
                        key={`${colorPalette}-${classificationType}-${numClasses}-${fillOpacity}-${borderWidth}-${labelProperty}`} />
                      <FitBounds data={geoData} />
                      <MapLabels
                        geoData={geoData}
                        mapping={mapping}
                        labelProperty={labelProperty}
                        excelData={excelData}
                        labelSize={labelSize}
                        isLabelMode={isLabelMode}
                        labelPositions={labelPositions}
                        setLabelPositions={setLabelPositions}
                      />
                      {showRegionCharts && (
                        <RegionMiniCharts
                          geoData={geoData}
                          mapping={mapping}
                          dataLookup={dataLookup}
                          colorScale={colorScale}
                          stats={stats}
                          excelData={excelData}
                          regionChartCols={regionChartCols}
                        />
                      )}
                    </>
                  )}
                </MapContainer>

                {/* ── Map Title Overlay ─────────────────────────────── */}
                {mapTitle && (
                  <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
                    <div className="bg-[#ffffff]/90 backdrop-blur-sm px-6 py-2.5 rounded-xl border border-[#e2e8f0]/50 shadow-lg text-center">
                      <h1 className="text-xl font-extrabold text-[#1e293b] tracking-tight">{mapTitle}</h1>
                      {mapping.valueKey && <p className="text-[10px] font-bold text-white uppercase tracking-widest mt-0.5">{mapping.valueKey}</p>}
                    </div>
                  </div>
                )}

                {/* ── Legend ────────────────────────────────────────── */}
                <div className={cn("absolute z-[1000]", {
                  "bottom-12 right-3": legendPosition === "br",
                  "bottom-12 left-3": legendPosition === "bl",
                  "top-24 right-3": legendPosition === "tr",
                  "top-24 left-3": legendPosition === "tl",
                })}>
                  <div className="bg-[#151824]/95 backdrop-blur-sm p-3.5 rounded-lg border border-[#334155]/50 shadow-xl min-w-[170px]">
                    <div className="text-[9px] font-bold text-[#64748b] uppercase tracking-widest mb-0.5">{mapping.valueKey || "Izoh"}</div>
                    <div className="text-[9px] text-[#475569] mb-2.5">({valueUnit})</div>
                    {classificationType === "continuous" ? (
                      <div>
                        <div className="h-2.5 w-full rounded"
                          style={{ background: `linear-gradient(to right, ${colorScale(stats.min)}, ${colorScale((stats.min + stats.max) / 2)}, ${colorScale(stats.max)})` }} />
                        <div className="flex justify-between font-mono text-[9px] text-[#64748b] mt-1.5">
                          <span>{stats.min.toLocaleString()}</span>
                          <span>{stats.max.toLocaleString()}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        {legendLabels.map((l, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-4 h-3 rounded-sm shrink-0 border border-[#334155]/30" style={{ background: l.color }} />
                            <span className="font-mono text-[9px] text-[#94a3b8]">{l.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* No data item */}
                    <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#334155]/30">
                      <div className="w-4 h-3 rounded-sm shrink-0 bg-[#334155] border border-[#475569]/30" />
                      <span className="text-[9px] text-[#475569]">Ma'lumot yo'q</span>
                    </div>
                    {showAttribution && (
                      <div className="text-[7px] text-[#64748b] mt-2 pt-2 border-t border-[#334155]/30">
                        © {new Date().getFullYear()} GeoVizor · Leaflet · OpenStreetMap
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Region Chart Legend ─────────────────────────────── */}
                {showRegionCharts && regionChartCols.length > 0 && (
                  <div className="absolute top-24 left-3 z-[1000] bg-[#151824]/95 backdrop-blur-sm rounded-lg border border-slate-700/50 shadow-xl p-3 pointer-events-none">
                    <div className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                      Viloyat chart izoh
                    </div>
                    <div className="space-y-1.5">
                      {regionChartCols.map((col: string, i: number) => {
                        const COL_COLORS = ['#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#f59e0b', '#10b981'];
                        return (
                          <div key={col} className="flex items-center gap-2">
                            <div
                              className="w-4 h-3 rounded-sm shrink-0"
                              style={{ background: COL_COLORS[i % COL_COLORS.length] }}
                            />
                            <span className="text-[9px] text-slate-300 font-medium">{col}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── Map Chart Overlay ─────────────────────────────── */}}
                {showMapChart && rankedData.length > 0 && (
                  <div
                    className="absolute bottom-10 left-3 z-[1000] bg-[#0f1624]/96 backdrop-blur-sm rounded-xl border border-slate-700/40 shadow-2xl"
                    style={{ width: 290 }}
                  >
                    {/* Header */}
                    <div className="px-3 pt-3 pb-1 border-b border-slate-800/60">
                      <div className="text-[10px] font-bold text-slate-200 truncate">
                        {mapping.valueKey || "Qiymat"}
                      </div>
                      <div className="text-[9px] text-slate-600">{valueUnit}</div>
                    </div>

                    {/* Chart area */}
                    {regionChartCols.length > 1 ? (
                      /* Multi-series: regionChartCols ustunlari bo'yicha */
                      <div className="p-2">
                        <ResponsiveContainer width="100%" height={200}>
                          <BarChart
                            data={rankedData.slice(0, 12).map((d: any) => {
                              const exRow = excelData.find((r: any) => normalizeKey(r[mapping.excelKey]) === d.key);
                              const COL_COLORS = ['#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#f59e0b', '#10b981'];
                              const colVals: any = { name: d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name };
                              regionChartCols.forEach((col: string) => {
                                colVals[col] = exRow ? parseFloat(exRow[col]) || 0 : 0;
                              });
                              return colVals;
                            })}
                            margin={{ top: 10, right: 8, left: -22, bottom: 42 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 7 }} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tick={{ fill: '#475569', fontSize: 7 }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '10px' }}
                              labelStyle={{ color: '#e2e8f0' }}
                              formatter={(v: any) => v?.toLocaleString()}
                            />
                            {regionChartCols.map((col: string, i: number) => {
                              const COL_COLORS = ['#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#f59e0b', '#10b981'];
                              return (
                                <Bar key={col} dataKey={col} name={col} fill={COL_COLORS[i % COL_COLORS.length]} radius={[2, 2, 0, 0]} maxBarSize={10}>
                                  <LabelList dataKey={col} position="top" style={{ fill: '#64748b', fontSize: 6 }} formatter={(v: any) => v > 0 ? v.toLocaleString() : ''} />
                                </Bar>
                              );
                            })}
                          </BarChart>
                        </ResponsiveContainer>
                        {/* Legend */}
                        <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-1">
                          {regionChartCols.map((col: string, i: number) => {
                            const COL_COLORS = ['#14b8a6', '#f97316', '#8b5cf6', '#ef4444', '#0ea5e9', '#f59e0b', '#10b981'];
                            return (
                              <div key={col} className="flex items-center gap-1">
                                <div className="w-2.5 h-2 rounded-sm" style={{ background: COL_COLORS[i % COL_COLORS.length] }} />
                                <span className="text-[8px] text-slate-500">{col}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      /* Single series */
                      <div className="p-2">
                        <ResponsiveContainer width="100%" height={185}>
                          <BarChart
                            data={rankedData.slice(0, 14).map((d: any) => ({ name: d.name.length > 8 ? d.name.slice(0, 8) + '…' : d.name, val: d.val, color: d.color }))}
                            margin={{ top: 14, right: 6, left: -22, bottom: 42 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                            <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 7 }} angle={-45} textAnchor="end" interval={0} />
                            <YAxis tick={{ fill: '#475569', fontSize: 7 }} />
                            <Tooltip
                              contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '6px', fontSize: '10px' }}
                              labelStyle={{ color: '#e2e8f0' }}
                              formatter={(v: any) => [v?.toLocaleString(), mapping.valueKey]}
                            />
                            <Bar dataKey="val" radius={[2, 2, 0, 0]}>
                              {rankedData.slice(0, 14).map((entry: any, index: number) => (
                                <Cell key={index} fill={entry.color} />
                              ))}
                              <LabelList dataKey="val" position="top" style={{ fill: '#64748b', fontSize: 6 }} formatter={(v: any) => v?.toLocaleString()} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                )}

                {/* ── No data warning ───────────────────────────────── */}
                {!geoData && (
                  <div className="absolute inset-0 flex items-center justify-center z-[500]">
                    <div className="text-center space-y-2">
                      <AlertCircle size={32} className="text-slate-700 mx-auto" />
                      <p className="text-sm text-slate-600">GeoJSON fayl yuklanmagan</p>
                    </div>
                  </div>
                )}
              </div>

              {/* ── STATUS BAR ────────────────────────────────────────── */}
              {!layoutMode && (
                <div className="h-6 bg-[#0f1420] border-t border-slate-800 flex items-center px-3 gap-4 shrink-0 text-[10px] text-slate-600 font-mono">
                  {coord ? (
                    <span className="text-teal-500">
                      Lat: {coord.lat.toFixed(5)}  Lon: {coord.lng.toFixed(5)}
                    </span>
                  ) : (
                    <span>Koordinatalar</span>
                  )}
                  <span className="border-l border-slate-800 pl-4">CRS: EPSG:4326 (WGS 84)</span>
                  <span className="border-l border-slate-800 pl-4">Proyeksiya: Web Mercator</span>
                  {mapping.valueKey && <span className="border-l border-slate-800 pl-4 text-slate-500">Metrika: {mapping.valueKey}</span>}
                  <span className="ml-auto">{BASEMAPS[baseMapKey]?.label}</span>
                </div>
              )}
            </section>

            {/* ── RIGHT PANEL — Attribute Table ────────────────────── */}
            <aside className={cn(
              "bg-[#151824] shrink-0 transition-all duration-200 z-20 flex flex-col border-l border-slate-800",
              rightPanelOpen ? "w-[300px]" : "w-10 items-center"
            )}>
              {rightPanelOpen ? (
                <>
                  {/* Panel header */}
                  <div className="h-9 px-3 border-b border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setRightTab("attributes")}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all",
                          rightTab === "attributes" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white")}>
                        <Table2 size={10} />&nbsp;Jadval
                      </button>
                      <button onClick={() => setRightTab("chart")}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all",
                          rightTab === "chart" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white")}>
                        <BarChart2 size={10} />&nbsp;Grafik
                      </button>
                      <button onClick={() => setRightTab("info")}
                        className={cn("flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all",
                          rightTab === "info" ? "bg-slate-700 text-white" : "text-slate-500 hover:text-white")}>
                        <Info size={10} />&nbsp;Ma'lumot
                      </button>
                    </div>
                    <button onClick={() => setRightPanelOpen(false)} className="text-slate-600 hover:text-slate-300 p-0.5 rounded">
                      <ChevronRight size={14} />
                    </button>
                  </div>

                  {rightTab === "attributes" ? (
                    /* ── Attribute Table ────────────────────────────── */
                    <div className="flex-1 flex flex-col overflow-hidden">
                      {/* Stats summary bar */}
                      <div className="px-3 py-2 border-b border-slate-800 grid grid-cols-4 gap-1">
                        {[
                          { l: "Jami", v: stats.total.toLocaleString(), c: "text-teal-400" },
                          { l: "Kichigi", v: stats.min.toLocaleString(), c: "text-sky-400" },
                          { l: "Kattasi", v: stats.max.toLocaleString(), c: "text-red-400" },
                          { l: "O'rtacha", v: stats.avg.toLocaleString(), c: "text-amber-400" },
                        ].map(({ l, v, c }) => (
                          <div key={l} className="text-center">
                            <div className={cn("text-[11px] font-bold tabular-nums", c)}>{v}</div>
                            <div className="text-[8px] text-slate-600 uppercase tracking-wide">{l}</div>
                          </div>
                        ))}
                      </div>
                      {/* Additional stats */}
                      <div className="px-3 py-1.5 border-b border-slate-800 flex gap-3 text-[9px] text-slate-600">
                        <span>N: <b className="text-slate-400">{stats.count}</b></span>
                        <span>Σ: <b className="text-slate-400">{stats.total.toLocaleString()}</b></span>
                        <span>σ: <b className="text-slate-400">{stats.stddev.toLocaleString()}</b></span>
                        <span className="ml-auto text-slate-600">{valueUnit}</span>
                      </div>
                      {/* Search */}
                      <div className="px-3 py-1.5 border-b border-slate-800 relative">
                        <Search size={10} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-600" />
                        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                          placeholder="Qidirish..." className="w-full bg-slate-800 rounded px-7 py-1 text-[11px] text-slate-300 outline-none border border-slate-700 focus:border-teal-500 transition-colors" />
                      </div>
                      {/* Table */}
                      <div className="flex-1 overflow-y-auto scrollbar-hide">
                        <table className="w-full text-[10px]">
                          <thead className="sticky top-0 bg-[#0f1420] z-10">
                            <tr>
                              <th className="text-left px-3 py-1.5 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-800">#</th>
                              <th className="text-left px-2 py-1.5 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-800">Hudud</th>
                              <th className="text-right px-3 py-1.5 text-slate-600 font-semibold uppercase tracking-wider border-b border-slate-800">Qiymat</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredData.map((item, i) => (
                              <tr key={item.key}
                                onClick={() => { setSelectedFeature({ name: item.name, value: item.val, unit: valueUnit, key: item.key }); setRightTab("info"); }}
                                className="border-b border-slate-800/50 hover:bg-slate-800/50 cursor-pointer group transition-colors">
                                <td className="px-3 py-1.5 text-slate-700 tabular-nums">{i + 1}</td>
                                <td className="px-2 py-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: item.color }} />
                                    <span className="text-slate-300 group-hover:text-white transition-colors truncate">{item.name}</span>
                                  </div>
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums font-mono text-slate-400 group-hover:text-teal-300 transition-colors">
                                  {item.val.toLocaleString()}
                                </td>
                              </tr>
                            ))}
                            {filteredData.length === 0 && (
                              <tr><td colSpan={3} className="py-8 text-center text-slate-700">Ma'lumot yo'q</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      {/* Histogram mini */}
                      <div className="px-3 py-2 border-t border-slate-800">
                        <div className="text-[8px] text-slate-700 mb-1.5 uppercase tracking-wider">Taqsimot</div>
                        <div className="flex items-end gap-0.5 h-8">
                          {Array.from({ length: 20 }, (_, i) => {
                            const lo = stats.min + (stats.max - stats.min) * (i / 20);
                            const hi = stats.min + (stats.max - stats.min) * ((i + 1) / 20);
                            const count = rankedData.filter(d => d.val >= lo && d.val < hi).length;
                            const maxCount = Math.max(...Array.from({ length: 20 }, (_, j) => {
                              const l = stats.min + (stats.max - stats.min) * (j / 20);
                              const h = stats.min + (stats.max - stats.min) * ((j + 1) / 20);
                              return rankedData.filter(d => d.val >= l && d.val < h).length;
                            }));
                            const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
                            return (
                              <div key={i} className="flex-1 rounded-sm transition-all hover:opacity-70"
                                style={{ height: `${Math.max(pct, 4)}%`, background: COLOR_PALETTES[colorPalette].interpolator(i / 19) }}
                                title={`${Math.round(lo)}–${Math.round(hi)}: ${count} ta`} />
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : rightTab === "chart" ? (
                    /* ── Bar Chart Tab with Multi-Year ────────────────────────────── */
                    <div className="flex-1 flex flex-col overflow-hidden p-3">
                      <div className="flex items-center gap-2 mb-3 shrink-0">
                        <TrendingUp size={12} className="text-teal-400" />
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                          {selectedYears.length > 1 ? "Yillar bo'yicha taqqoslash" : "Top 12 hudud"}
                        </span>
                      </div>
                      {selectedYears.length > 1 && Object.keys(chartDataByYear).length > 0 ? (
                        <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-800/40 rounded-xl border border-slate-700/40 p-4">
                          <ResponsiveContainer width="100%" height={Math.max(300, Object.keys(chartDataByYear).length * 30)}>
                            <BarChart
                              data={Object.entries(chartDataByYear)
                                .sort((a, b) => {
                                  const sumA = Object.values(a[1] as any).reduce((x: any, y: any) => x + y, 0);
                                  const sumB = Object.values(b[1] as any).reduce((x: any, y: any) => x + y, 0);
                                  return sumB - sumA;
                                })
                                .slice(0, 15)
                                .map(([key, values]) => {
                                  const regionName = excelData.find(r => normalizeKey(r[mapping.excelKey]) === key)?.[mapping.excelKey] || key;
                                  return { name: regionName, ...values };
                                })}
                              layout="vertical"
                              margin={{ top: 5, right: 60, left: 120, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis type="number" stroke="#64748b" style={{ fontSize: '11px' }} />
                              <YAxis dataKey="name" type="category" width={115} stroke="#64748b" style={{ fontSize: '10px' }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}
                                labelStyle={{ color: '#e2e8f0' }}
                                formatter={(value: any) => value.toLocaleString()}
                              />
                              <Legend wrapperStyle={{ paddingTop: '10px', fontSize: '11px' }} />
                              {selectedYears.map((year, idx) => {
                                const colors = ['#14b8a6', '#0ea5e9', '#f59e0b', '#ef4444', '#8b5cf6'];
                                return (
                                  <Bar key={year} dataKey={year} name={year} fill={colors[idx % colors.length]} radius={[0, 4, 4, 0]}>
                                    <LabelList dataKey={year} position="right" style={{ fill: '#94a3b8', fontSize: 9 }} formatter={(v: any) => v?.toLocaleString()} />
                                  </Bar>
                                );
                              })}
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      ) : (
                        <div className="flex-1 overflow-y-auto scrollbar-hide bg-slate-800/40 rounded-xl border border-slate-700/40 p-3">
                          <ResponsiveContainer width="100%" height={Math.max(300, rankedData.length * 30)}>
                            <BarChart
                              data={rankedData.slice(0, 15).map(d => ({
                                name: d.name.length > 12 ? d.name.slice(0, 12) + '…' : d.name,
                                val: d.val,
                                color: d.color
                              }))}
                              layout="vertical"
                              margin={{ top: 5, right: 40, left: 100, bottom: 5 }}
                            >
                              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                              <XAxis type="number" stroke="#64748b" style={{ fontSize: '11px' }} />
                              <YAxis dataKey="name" type="category" width={95} stroke="#64748b" style={{ fontSize: '10px' }} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}
                                labelStyle={{ color: '#e2e8f0' }}
                                formatter={(v: any) => [v.toLocaleString(), mapping.valueKey]}
                              />
                              <Bar dataKey="val" radius={[0, 4, 4, 0]}>
                                {rankedData.slice(0, 15).map((entry, index) => (
                                  <Cell key={index} fill={entry.color} />
                                ))}
                                <LabelList dataKey="val" position="right" style={{ fill: '#94a3b8', fontSize: 9 }} formatter={(v: any) => v?.toLocaleString()} />
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                          {rankedData.length === 0 && (
                            <p className="text-center text-[11px] text-slate-600 py-8">Ma'lumot yo'q</p>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* ── Feature Info (click on map) ──────────────── */
                    <div className="flex-1 overflow-y-auto p-3 scrollbar-hide">
                      {selectedFeature ? (
                        <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}>
                          <div className="bg-slate-800/50 rounded-lg p-3.5 border border-slate-700/40 mb-3">
                            <div className="text-[9px] text-teal-500 font-bold uppercase tracking-wider mb-1">Tanlangan obyekt</div>
                            <div className="text-sm font-bold text-white">{selectedFeature.name}</div>
                            {selectedFeature.value !== undefined && (
                              <div className="mt-2 flex items-baseline gap-1.5">
                                <span className="text-2xl font-black text-teal-400 tabular-nums">
                                  {selectedFeature.value.toLocaleString()}
                                </span>
                                <span className="text-xs text-slate-500">{selectedFeature.unit}</span>
                              </div>
                            )}
                            {selectedFeature.value !== undefined && stats.max > 0 && (
                              <div className="mt-2.5">
                                <div className="flex justify-between text-[9px] text-slate-600 mb-1">
                                  <span>Ulushi</span>
                                  <span>{((selectedFeature.value / stats.total) * 100).toFixed(1)}%</span>
                                </div>
                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full bg-teal-500 transition-all"
                                    style={{ width: `${(selectedFeature.value / stats.max) * 100}%` }} />
                                </div>
                              </div>
                            )}
                          </div>

                          {/* GeoJSON properties */}
                          {selectedFeature.geoProps && (
                            <div className="mb-3">
                              <div className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-2">GeoJSON xususiyatlari</div>
                              <div className="space-y-1">
                                {Object.entries(selectedFeature.geoProps).map(([k, v]) => (
                                  <div key={k} className="flex justify-between gap-2 py-1 border-b border-slate-800/50 text-[11px]">
                                    <span className="text-slate-600 truncate">{k}</span>
                                    <span className="text-slate-300 font-mono text-right truncate">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Excel row data */}
                          {selectedFeature.excelRow && (
                            <div>
                              <div className="text-[9px] text-slate-600 uppercase tracking-wider font-bold mb-2">Excel ma'lumotlari</div>
                              <div className="space-y-1">
                                {Object.entries(selectedFeature.excelRow).map(([k, v]) => (
                                  <div key={k} className="flex justify-between gap-2 py-1 border-b border-slate-800/50 text-[11px]">
                                    <span className="text-slate-600 truncate">{k}</span>
                                    <span className="text-slate-300 font-mono text-right truncate">{String(v)}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-12">
                          <Crosshair size={28} className="text-slate-700" />
                          <p className="text-xs text-slate-600">Xaritada obyektni bosing</p>
                          <p className="text-[10px] text-slate-700">Barcha atributlar ko'rsatiladi</p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="py-3 flex flex-col items-center gap-2.5">
                  <button onClick={() => setRightPanelOpen(true)} className="text-slate-600 hover:text-teal-400 p-1 rounded transition-colors">
                    <ChevronLeft size={13} />
                  </button>
                  <Table2 size={12} className="text-slate-700" />
                  <Database size={12} className="text-slate-700" />
                </div>
              )}
            </aside>

          </div>
        )}
      </main>
    </div>
  );
}
