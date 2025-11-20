// frontend/src/components/ExcelUpload.jsx
import * as XLSX from 'xlsx';
import { Upload } from 'lucide-react';

const blankSystem = { total_frames: '', page_size: '', cpu_quantum: '', memory_threshold: '' };

export default function ExcelUpload({ onData }) {
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const data = await file.arrayBuffer();
    const wb = XLSX.read(data);

    const sysSheet = wb.Sheets['System'] || wb.Sheets[wb.SheetNames[0]];
    const proSheet = wb.Sheets['Processes'] || wb.Sheets[wb.SheetNames[1] || wb.SheetNames[0]];

    let system = { ...blankSystem };
    let processes = [];

    if (sysSheet) {
      const json = XLSX.utils.sheet_to_json(sysSheet, { header: 1 });
      const flat = Object.fromEntries(
        json.filter((r) => r.length >= 2).map(([k, v]) => [String(k).trim().toLowerCase(), v])
      );
      system = {
        total_frames: flat['total_frames'] ?? flat['total frames'] ?? '',
        page_size: flat['page_size'] ?? flat['page size'] ?? '',
        cpu_quantum: flat['cpu_quantum'] ?? flat['cpu quantum'] ?? '',
        memory_threshold: flat['memory_threshold'] ?? flat['memory threshold'] ?? '',
      };
    }

    if (proSheet) {
      const rows = XLSX.utils.sheet_to_json(proSheet, { defval: '' });
      processes = rows.map((r, i) => ({
        pid: r.pid || `P${i + 1}`,
        arrival_time: r.arrival_time ?? r['arrival time'] ?? '',
        burst_time: r.burst_time ?? r['burst time'] ?? '',
        priority: r.priority ?? '',
        pages_count: r.pages_count ?? r['pages count'] ?? r['pages'] ?? r['page count'] ?? '',
      }));
    }

    onData({ system, processes });
  };

  return (
    <label className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md flex items-center gap-2">
      <Upload size={18} />
      <span className="text-sm font-medium">Import from Excel</span>
      <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" />
    </label>
  );
}

// inline-flex items-center gap-2 cursor-pointer bg-white text-gray-900 dark:bg-white/10 dark:text-white px-3 py-2 rounded-xl shadow hover:shadow-md border border-black/10 dark:border-white/10